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

const SYSTEM_PROMPT = `Eres Cathedral Project Classifier Agent. Tu trabajo: identificar a qué proyecto pertenece un documento (factura, albarán) y SUGERIR al admin. NUNCA auto-asignar excepto cuando hay certeza absoluta.

FILOSOFÍA DEFENSIVA (decretada David sesión 18/05/2026): "lo que no podamos auto, lo procesamos nosotros". Errores meten facturas en proyectos incorrectos → contabilidad distorsionada + casi imposible detectar post-asignación. Falsos negativos (manual review) preferibles a falsos positivos (asignación errónea).

Contexto:

1. Cathedral tiene 5 divisiones: OBR (reformas), FLP (flipping), CDU (cambio uso), PRO (promoción), OBN (obra nueva). Códigos formato \`<DIV>-<AÑO>-<NUM>\` (ej. CDU-2025-001) o cortos \`CG-<DIV><NUM>\` (ej. CG-CDU01).

2. Señales de match (informativo, NO determina auto-assign):
   - **Código literal exact**: texto contiene "CDU-2025-001" o "CG-CDU01" exacto → match_type='code_literal'
   - **Dirección obra**: dirección menciona address proyecto → match_type='address_match'
   - **Historial proveedor exclusivo**: lealtad ≥85% mín 5 facturas → match_type='history_exclusive'
   - **Historial parcial**: ≥2 facturas en proyecto sin exclusividad → match_type='history_partial'
   - **Concepto semántico**: descripción matches proyecto → match_type='semantic_concept'
   - **Múltiples señales débiles** → match_type='multi_signal'

3. REGLA SUPREMA action (Cathedral defensive):
   - **auto_assign** SOLO si TODAS estas se cumplen:
     a) Código literal exact (regex \`[A-Z]{2,4}-\\d{4}-\\d{3}\` o \`CG-[A-Z0-9]{2,8}\`) presente en texto
     b) Código coincide con UN SOLO project_code del active_projects array
     c) NO hay señales contradictorias (otro proyecto address/history)
   - **suggest** en TODOS los demás casos donde tienes candidato razonable (incluso si confidence subjetiva alta sin código literal)
   - **needs_review** si no hay candidatos razonables o múltiples candidatos indistinguibles

4. NO auto_assign basado solo en:
   - Dirección match aunque sea exacta (riesgo Buenavista 24 vs 38, números cercanos OCR typos)
   - Historial proveedor exclusivo (riesgo trabajador fotografía factura otra obra del mismo proveedor)
   - Concepto semántico (LLM puede equivocarse)
   - Múltiples señales débiles (no garantía)

5. Edge cases conocidos Cathedral:
   - Buenavista street tiene SOLO 24 + 38. Si texto dice "Buenavista 25/26/27" → suggest project 24 (typo). "Buenavista 36/37" → suggest 38. Otros números → needs_review.
   - Workers (Rafael, Hipólito) pueden subir factura otra obra → sin código literal SIEMPRE suggest.

6. NUNCA inventes project_id. Solo usa IDs del active_projects array.

7. alternatives: lista hasta 3 candidates con razones (incluido el ganador). Si solo hay uno, alternatives=1 item.

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

  // ── DEFENSIVE GATE (Cathedral SUPREMA): auto_assign solo si código literal exact en texto ──
  // David sesión 18/05: "lo que no podamos auto, lo procesamos nosotros".
  // Aunque LLM devuelva auto_assign, server-side enforce: sin código literal exact → suggest.
  const projectCodeRegex = /\b[A-Z]{2,4}-\d{4}-\d{3}\b/g
  const shortCodeRegex = /\bCG-[A-Z0-9]{2,8}\b/g
  const textForRegex = (body.extracted_text || '') + ' ' + (body.concept || '')
  const literalCodesFound = [
    ...(textForRegex.match(projectCodeRegex) || []),
    ...(textForRegex.match(shortCodeRegex) || []),
  ]
  const activeCodeSet = new Set([
    ...activeProjects.map((p) => p.code),
    ...activeProjects.map((p) => p.codigo_corto).filter(Boolean) as string[],
  ])
  const matchedActiveCodes = literalCodesFound.filter((c) => activeCodeSet.has(c))
  const literalExactMatchUnique = matchedActiveCodes.length === 1
  const literalMatchesAssigned = literalExactMatchUnique && (matchedActiveCodes[0] === parsed.project_code)

  let serverEnforcedAction = parsed.action as string
  let serverDowngradedReason = ''
  if (parsed.action === 'auto_assign' && !literalMatchesAssigned) {
    serverEnforcedAction = 'suggest'
    serverDowngradedReason = literalCodesFound.length === 0
      ? 'no_literal_code_in_text'
      : (matchedActiveCodes.length > 1 ? 'multiple_literal_codes_ambiguous' : 'literal_code_mismatch_with_assigned')
  }

  return NextResponse.json({
    ...parsed,
    action: serverEnforcedAction,
    _server_enforcement: {
      defensive_gate_applied: serverDowngradedReason !== '',
      downgrade_reason: serverDowngradedReason || null,
      literal_codes_in_text: literalCodesFound,
      literal_codes_active: matchedActiveCodes,
      original_llm_action: parsed.action,
    },
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
