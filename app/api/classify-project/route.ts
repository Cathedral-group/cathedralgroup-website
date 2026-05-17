/**
 * POST /api/classify-project
 *
 * Project Classifier Agent (Claude Sonnet 4.6 + prompt caching).
 *
 * Asigna project_id a un documento post-OCR. Si confianza baja → needs_review.
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN
 *
 * Body:
 *   {
 *     extracted_text: string,
 *     concept?: string,
 *     supplier_name?: string,
 *     supplier_nif?: string,
 *     amount_total?: number,
 *     issue_date?: string,
 *     direccion_obra?: string,
 *   }
 *
 * Response:
 *   {
 *     project_id: uuid | null,
 *     project_code: string | null,
 *     match_type: string,
 *     confidence: number,        // 0-1
 *     action: 'auto_assign' | 'suggest' | 'needs_review',
 *     reasoning: string,
 *     alternatives: Array<{project_id, project_code, confidence, reason}>
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const maxDuration = 60

interface ClassifyBody {
  extracted_text?: string
  concept?: string | null
  supplier_name?: string | null
  supplier_nif?: string | null
  amount_total?: number | null
  issue_date?: string | null
  direccion_obra?: string | null
  company_id?: string | null
}

interface ProjectRow {
  id: string
  code: string
  codigo_corto: string | null
  name: string
  address: string | null
  type: string | null
  status: string | null
  description: string | null
  zona: string | null
}

interface SupplierHistoryRow {
  project_id: string
  project_code: string | null
  invoice_count: number
  last_invoice_date: string | null
  loyalty_pct: number
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    project_id: { type: ['string', 'null'] },
    project_code: { type: ['string', 'null'] },
    match_type: {
      type: 'string',
      enum: ['code_literal', 'address_match', 'history_exclusive', 'history_partial', 'semantic_concept', 'multi_signal', 'no_match'],
    },
    confidence: { type: 'number' },
    action: { type: 'string', enum: ['auto_assign', 'suggest', 'needs_review'] },
    reasoning: { type: 'string' },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          project_id: { type: ['string', 'null'] },
          project_code: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['project_code', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['project_id', 'project_code', 'match_type', 'confidence', 'action', 'reasoning', 'alternatives'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `Eres Cathedral Project Classifier Agent. Tu trabajo: asignar un documento (factura, albarán, etc) al proyecto Cathedral correcto.

Reglas:

1. Cathedral tiene 5 divisiones: OBR (reformas), FLP (flipping), CDU (cambio uso), PRO (promoción), OBN (obra nueva). Cada proyecto tiene código formato \`<DIV>-<AÑO>-<NUM>\` (ej. CDU-2025-001, FLP-2024-003).

2. Existen también códigos cortos formato \`CG-<DIV><NUM>\` (ej. CG-CDU01) para identificación rápida en texto facturas.

3. Señales de match (prioridad alta → baja):
   - **Código literal**: texto contiene "CDU-2025-001" o "CG-CDU01" exacto → match_type='code_literal'
   - **Dirección obra**: texto menciona dirección que coincide con address del proyecto → match_type='address_match'
   - **Historial proveedor exclusivo**: proveedor lealtad ≥85% mín 5 facturas a un proyecto → match_type='history_exclusive'
   - **Historial parcial**: proveedor tiene ≥2 facturas en un proyecto pero no exclusivo → match_type='history_partial'
   - **Concepto semántico**: descripción factura matches proyecto por contexto (cliente, zona, tipo obra) → match_type='semantic_concept'
   - **Múltiples señales débiles** combinadas → match_type='multi_signal'

4. Niveles confianza + action:
   - **auto_assign** (confidence ≥0.90): código literal + historial confirma, O dirección exacta + supplier recurrente, O historial exclusivo
   - **suggest** (confidence 0.60-0.89): código literal sin historial, dirección parcial, historial parcial, concepto semántico fuerte
   - **needs_review** (confidence <0.60): sin señales claras, múltiples candidates indistinguibles, o sin proyectos candidatos

5. NUNCA inventes project_id. Solo usa IDs/códigos del active_projects array proporcionado en user message.

6. NUNCA auto_assign si no hay supplier_project_history confirmando. En duda → suggest (admin valida).

7. alternatives: lista hasta 3 candidates con sus razones (incluido el ganador). Si no hay candidatos viables, devuelve array vacío.

Output: JSON estricto schema. reasoning <300 caracteres explicación corta para audit log.`

async function fetchActiveProjects(companyId: string | null): Promise<ProjectRow[]> {
  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('projects')
    .select('id, code, codigo_corto, name, address, type, status, description, zona')
    .is('deleted_at', null)
    .neq('status', 'finalizado')
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query.limit(50)
  if (error) {
    console.error('[classify-project] projects fetch error:', error)
    return []
  }
  return (data || []) as ProjectRow[]
}

async function fetchSupplierHistory(supplierNif: string | null, companyId: string | null): Promise<SupplierHistoryRow[]> {
  if (!supplierNif) return []
  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('invoices')
    .select('project_id, projects!inner(code), issue_date')
    .eq('supplier_nif', supplierNif)
    .is('deleted_at', null)
    .not('project_id', 'is', null)
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query
  if (error || !data) {
    console.error('[classify-project] supplier history fetch error:', error)
    return []
  }

  const counts = new Map<string, { code: string | null; count: number; last: string | null }>()
  const total = data.length
  for (const row of data as Array<{ project_id: string; projects?: { code?: string }; issue_date?: string }>) {
    if (!row.project_id) continue
    const existing = counts.get(row.project_id) || { code: row.projects?.code || null, count: 0, last: null }
    existing.count += 1
    if (row.issue_date && (!existing.last || row.issue_date > existing.last)) existing.last = row.issue_date
    counts.set(row.project_id, existing)
  }

  return Array.from(counts.entries()).map(([project_id, v]) => ({
    project_id,
    project_code: v.code,
    invoice_count: v.count,
    last_invoice_date: v.last,
    loyalty_pct: total > 0 ? Math.round((v.count / total) * 100) : 0,
  }))
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = process.env.CATHEDRAL_INTERNAL_TOKEN
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ClassifyBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.extracted_text && !body.concept) {
    return NextResponse.json({ error: 'extracted_text o concept requerido' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })
  }

  const [activeProjects, supplierHistory] = await Promise.all([
    fetchActiveProjects(body.company_id ?? null),
    fetchSupplierHistory(body.supplier_nif ?? null, body.company_id ?? null),
  ])

  if (activeProjects.length === 0) {
    return NextResponse.json({
      project_id: null,
      project_code: null,
      match_type: 'no_match',
      confidence: 0,
      action: 'needs_review',
      reasoning: 'No hay proyectos activos en BD para clasificar',
      alternatives: [],
    })
  }

  const projectsContext = activeProjects.map((p) => ({
    id: p.id,
    code: p.code,
    codigo_corto: p.codigo_corto,
    name: p.name,
    address: p.address,
    type: p.type,
    status: p.status,
    description: p.description,
    zona: p.zona,
    // División inferida del prefijo del code (OBR/FLP/CDU/PRO/OBN)
    division: (p.code || '').split('-')[0] || null,
  }))

  const userMessage = JSON.stringify({
    document: {
      extracted_text: (body.extracted_text || '').slice(0, 4000),
      concept: body.concept,
      supplier_name: body.supplier_name,
      supplier_nif: body.supplier_nif,
      amount_total: body.amount_total,
      issue_date: body.issue_date,
      direccion_obra: body.direccion_obra,
    },
    active_projects: projectsContext,
    supplier_project_history: supplierHistory,
  })

  const client = new Anthropic({ apiKey })

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming)
  } catch (err) {
    console.error('[classify-project] Anthropic API error:', err)
    return NextResponse.json(
      { error: 'Anthropic API failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 502 },
    )
  }

  const firstText = response.content.find((b) => b.type === 'text')
  if (!firstText || firstText.type !== 'text') {
    return NextResponse.json({ error: 'Respuesta vacía del modelo' }, { status: 502 })
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(firstText.text)
  } catch {
    return NextResponse.json({ error: 'Respuesta no-JSON del modelo' }, { status: 502 })
  }

  const projectCode = parsed.project_code as string | null
  if (projectCode) {
    const match = activeProjects.find((p) => p.code === projectCode || p.codigo_corto === projectCode)
    if (match && parsed.project_id !== match.id) {
      parsed.project_id = match.id
    }
  }

  return NextResponse.json({
    ...parsed,
    _meta: {
      model: 'claude-sonnet-4-6',
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      cache_read: response.usage.cache_read_input_tokens || 0,
      cache_creation: response.usage.cache_creation_input_tokens || 0,
      candidates_considered: activeProjects.length,
      supplier_history_rows: supplierHistory.length,
    },
  })
}
