/**
 * POST /api/decide-table
 *
 * Microutility endpoint Tarea 3 Plan A (ADR-0007): decide tabla destino +
 * asignación proyecto con reglas corroboración Cathedral.
 *
 * Llamado por:
 *   - workflow n8n general (sustituye Code node "Decidir Tabla Destino")
 *   - Portal trabajador upload (futuro, integración pendiente)
 *
 * Reglas corroboración (memoria `cathedral-all.md` + `cathedral-n8n.md`):
 *   IA NUNCA auto-asigna proyecto sola. Necesita ≥1 señal corroborante:
 *     1. Código proyecto encontrado LITERALMENTE en texto/concepto
 *     2. Historial proveedor confirma (≥2 facturas mismo project_id, lealtad ≥70%)
 *     3. Historial exclusivo (≥85% lealtad, mín 5 facturas) → auto sin IA
 *
 * Decisión tabla destino (v2 16/05/2026 noche — paridad n8n `Decidir Tabla Destino`):
 *   - doc_type=nomina | nomina_lote → payrolls
 *   - doc_type=resumen_nominas → payroll_summaries
 *   - doc_type=presupuesto | cotizacion → quotes (early return)
 *   - doc_type=modelo_fiscal + emisor Cathedral (B19761915) → tax_filings
 *   - doc_type=recibo_prestamo | hipoteca | cuota_hipoteca → invoices needs_review
 *     (`mortgages` requiere operation_id NOT NULL FK flipping_operations — no insertable directo)
 *   - doc_type=contrato | escritura | licencia | informe | seguro | nota_simple → documents
 *   - default (factura, ticket, albarán, etc.) → invoices con búsqueda proyecto
 *
 * Body POST:
 *   {
 *     "doc_type": string,
 *     "supplier_id": uuid?,
 *     "supplier_nif": string?,
 *     "supplier_name": string?,
 *     "extracted_text": string?,
 *     "concept": string?,
 *     "amount_total": number?,
 *     "issue_date": "YYYY-MM-DD"?,
 *     "company_id": uuid?  // default Cathedral
 *   }
 *
 * Response 200:
 *   {
 *     "table": "invoices" | "quotes" | "tax_filings" | "payrolls" | "payroll_summaries" | "documents",
 *     "table_reason": string,
 *     "project_id": uuid | null,
 *     "project_code": string | null,
 *     "project_match_type": "code_literal" | "history_confirmed" | "history_exclusive" | null,
 *     "project_confidence": number,
 *     "action": "auto_assign" | "suggest" | "needs_review",
 *     "razones": string[],
 *     "source": "cathedral-decide-table-v1"
 *   }
 *
 * Auth: Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}
 *
 * Performance objetivo: <500ms p95. 2 queries Supabase paralelas (projects
 * por code + historial supplier). Indexes existentes:
 *   - idx_invoices_supplier_id (partial WHERE NOT NULL)
 *   - invoices_file_hash_key UNIQUE
 *
 * Validator session 16/05/2026 refutó 4 supuestos iniciales:
 *   - `projects.active` NO existe → filtrar solo deleted_at IS NULL
 *   - Patrón códigos reales: [A-Z]{2,4}-\d{4}-\d{3} (no C-YYYY-NNN)
 *   - `mortgages` requiere operation_id NOT NULL → NO insertable
 *   - supplier_id null en ~50% facturas → fallback supplier_nif
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const CATHEDRAL_COMPANY_ID = '00000000-0000-0000-0000-cca7ed1a1000'
const CATHEDRAL_NIF = 'B19761915'

// Patrón verificado live BD 16/05/2026: FLP-2025-003, OBR-2024-001,
// PRO-2025-001, CDU-2025-001, OBN-2025-001
const PROJECT_CODE_REGEX = /\b([A-Z]{2,4}-\d{4}-\d{3})\b/g
// codigo_corto buyer-reference (ej: CG-MAR5)
const CODIGO_CORTO_REGEX = /\b(CG-[A-Z0-9]{2,8})\b/gi

const BodySchema = z.object({
  doc_type: z.string().min(1).max(50),
  supplier_id: z.string().uuid().nullish(),
  supplier_nif: z.string().max(20).nullish(),
  supplier_name: z.string().max(500).nullish(),
  extracted_text: z.string().max(50000).nullish(),
  concept: z.string().max(1000).nullish(),
  amount_total: z.number().nullish(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  company_id: z.string().uuid().default(CATHEDRAL_COMPANY_ID),
})

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const expected = (process.env.CATHEDRAL_INTERNAL_TOKEN ?? '').trim()
  if (!token || !expected) return false
  if (token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

function normalizeNif(nif: string): string {
  return nif.toUpperCase().replace(/[\s.\-]/g, '')
}

function extractProjectCodes(text: string): string[] {
  if (!text) return []
  const upper = text.toUpperCase()
  const codes = new Set<string>()
  for (const m of upper.matchAll(PROJECT_CODE_REGEX)) codes.add(m[1])
  for (const m of text.matchAll(CODIGO_CORTO_REGEX)) codes.add(m[1].toUpperCase())
  return [...codes]
}

type Action = 'auto_assign' | 'suggest' | 'needs_review'

export async function POST(request: Request) {
  const startedAt = Date.now()

  // 1. Auth
  if (!checkAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        detail: parsed.error.issues[0]?.message ?? 'Invalid payload',
      },
      { status: 400 }
    )
  }

  const {
    doc_type,
    supplier_id,
    supplier_nif,
    extracted_text,
    concept,
    company_id,
  } = parsed.data

  const supabase = createAdminSupabaseClient()
  const razones: string[] = []

  // ── PASO A: Decidir tabla destino (v2: paridad n8n Decidir Tabla Destino) ──

  // Helper para respuesta temprana cuando tabla destino no es invoices.
  // No hace búsqueda de proyecto porque las otras tablas no tienen project_id
  // (excepto quotes que se asigna manualmente).
  function earlyReturn(
    table: 'quotes' | 'tax_filings' | 'payrolls' | 'payroll_summaries' | 'documents' | 'invoices',
    reason: string,
    razon: string,
    action: Action = 'needs_review'
  ) {
    const elapsed = Date.now() - startedAt
    console.log(`[decide-table v2] doc_type=${doc_type} → ${table} t=${elapsed}ms`)
    return Response.json({
      table,
      table_reason: reason,
      project_id: null,
      project_code: null,
      project_match_type: null,
      project_confidence: 0,
      action,
      razones: [razon],
      source: 'cathedral-decide-table-v2',
    })
  }

  // A1. Nóminas → payrolls / payroll_summaries (paridad n8n)
  if (doc_type === 'nomina' || doc_type === 'nomina_lote') {
    return earlyReturn(
      'payrolls',
      `doc_type=${doc_type} → tabla payrolls`,
      'Nómina individual → payrolls (asignación trabajador manual)'
    )
  }
  if (doc_type === 'resumen_nominas') {
    return earlyReturn(
      'payroll_summaries',
      'doc_type=resumen_nominas → tabla payroll_summaries',
      'Resumen mensual nóminas → payroll_summaries'
    )
  }

  // A2. Presupuesto / Cotización → quotes (n8n: ['presupuesto','cotizacion'])
  if (doc_type === 'presupuesto' || doc_type === 'cotizacion') {
    return earlyReturn(
      'quotes',
      `doc_type=${doc_type} → tabla quotes`,
      'Presupuesto/cotización: tabla quotes, sin auto-asignación proyecto'
    )
  }

  // A3. modelo_fiscal emitido por Cathedral → tax_filings
  const normalizedNif = supplier_nif ? normalizeNif(supplier_nif) : ''
  if (doc_type === 'modelo_fiscal' && normalizedNif === normalizeNif(CATHEDRAL_NIF)) {
    return earlyReturn(
      'tax_filings',
      'doc_type=modelo_fiscal + emisor Cathedral (B19761915) → tax_filings',
      'Modelo fiscal propio Cathedral → tax_filings'
    )
  }

  // A4. Recibos préstamo/hipoteca → invoices con needs_review.
  // mortgages.operation_id NOT NULL FK flipping_operations → NO insertable directo.
  // Regex paridad n8n: /(hipoteca|préstamo|recibo de préstamo|cuota mensual.*préstamo)/i
  const isLoanDoc =
    ['recibo_prestamo', 'hipoteca', 'cuota_hipoteca'].includes(doc_type) ||
    /hipoteca|préstamo|prestamo|recibo de préstamo|cuota mensual.*(préstam|prestam)/i.test(
      concept ?? ''
    )
  if (isLoanDoc) {
    const elapsed = Date.now() - startedAt
    console.log(`[decide-table v2] loan doc → invoices needs_review t=${elapsed}ms`)
    return Response.json({
      table: 'invoices',
      table_reason:
        'recibo préstamo/hipoteca → invoices (needs_review). mortgages requiere operation_id NOT NULL FK flipping_operations, no insertable sin contexto operación.',
      project_id: null,
      project_code: null,
      project_match_type: null,
      project_confidence: 0,
      action: 'needs_review' as Action,
      razones: [
        'Recibo préstamo/hipoteca detectado',
        'Insertado en invoices con needs_review=true para asignar operación manual',
      ],
      source: 'cathedral-decide-table-v2',
    })
  }

  // A5. Documentos legales / contractuales → documents (paridad n8n)
  // n8n: ['contrato','escritura','licencia','informe','seguro','nota_simple','modelo_fiscal']
  // 'modelo_fiscal' ya cubierto en A3 cuando es Cathedral. Si no es Cathedral
  // (modelo de un proveedor externo) → cae aquí.
  const documentDocTypes = [
    'contrato',
    'escritura',
    'licencia',
    'informe',
    'seguro',
    'nota_simple',
    'modelo_fiscal', // modelos no-Cathedral
    'certificado',
    'certificacion',
  ]
  if (documentDocTypes.includes(doc_type)) {
    return earlyReturn(
      'documents',
      `doc_type=${doc_type} → tabla documents (documento legal/contractual)`,
      `Documento ${doc_type} → tabla documents`
    )
  }

  // A6. Default → invoices con búsqueda proyecto (factura, ticket, albarán,
  // proforma, rectificativa, abono, justificante_pago, otro, etc.)

  // ── PASO B: Buscar proyecto (2 queries paralelas) ───────────────────────
  const fullText = [extracted_text ?? '', concept ?? ''].join(' ')
  const codesInText = extractProjectCodes(fullText)

  // Fallback historial: si supplier_id null usar supplier_nif. ~50% facturas
  // producción tienen supplier_id=null (validator verified).
  // Usar `.eq()` directo (no `.or()` con string raw — PostgREST filter DSL es
  // sensible a caracteres especiales en value; supplier_nif puede contener
  // comas/paréntesis en payloads malformados → potencial injection).
  const supplierHistoryQuery = (() => {
    if (!supplier_id && !normalizedNif) return null
    let q = supabase
      .from('invoices')
      .select('project_id')
      .not('project_id', 'is', null)
      .is('deleted_at', null)
      .eq('company_id', company_id)
      .limit(200)
    if (supplier_id) {
      q = q.eq('supplier_id', supplier_id)
    } else if (supplier_nif) {
      q = q.eq('supplier_nif', supplier_nif)
    }
    return q
  })()

  const supplierFilter: string | null =
    supplier_id || normalizedNif ? 'has_filter' : null

  const [projectsByCodeRes, supplierHistoryRes] = await Promise.all([
    codesInText.length > 0
      ? supabase
          .from('projects')
          .select('id, code, name')
          .in('code', codesInText)
          .is('deleted_at', null)
          .eq('company_id', company_id)
      : Promise.resolve({ data: [] as Array<{ id: string; code: string; name: string }>, error: null }),

    supplierHistoryQuery
      ? supplierHistoryQuery
      : Promise.resolve({ data: [] as Array<{ project_id: string }>, error: null }),
  ])

  // Errores Supabase reales
  if (
    (projectsByCodeRes as { error: unknown }).error ||
    (supplierHistoryRes as { error: unknown }).error
  ) {
    const errA = (projectsByCodeRes as { error: { message?: string } | null }).error
    const errB = (supplierHistoryRes as { error: { message?: string } | null }).error
    console.error(
      '[decide-table] Supabase error projects=%s history=%s',
      errA?.message ?? 'ok',
      errB?.message ?? 'ok'
    )
    return Response.json(
      { error: 'Upstream database error' },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  // ── PASO C: Aplicar señales corroboración ──────────────────────────────

  let project_id: string | null = null
  let project_code: string | null = null
  let project_match_type: 'code_literal' | 'history_confirmed' | 'history_exclusive' | null = null
  let project_confidence = 0
  let action: Action = 'needs_review'

  // C1. Señal código literal en texto (mayor prioridad)
  const matchedProjects = (projectsByCodeRes.data ?? []) as Array<{
    id: string
    code: string
    name: string
  }>
  if (matchedProjects.length > 0) {
    const best = matchedProjects[0]
    project_id = best.id
    project_code = best.code
    project_match_type = 'code_literal'
    project_confidence = 0.95
    action = 'auto_assign'
    razones.push(
      `Código proyecto "${best.code}" encontrado literalmente en texto/concepto → auto_assign`
    )
  }

  // C2/C3. Historial proveedor (solo si C1 no fue conclusivo)
  if (action !== 'auto_assign') {
    const history = (supplierHistoryRes.data ?? []) as Array<{ project_id: string }>
    if (history.length > 0) {
      const total = history.length
      const counts: Record<string, number> = {}
      for (const row of history) {
        counts[row.project_id] = (counts[row.project_id] ?? 0) + 1
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
      const [topPid, topCount] = sorted[0]
      const loyalty = topCount / total
      const loyaltyPct = Math.round(loyalty * 100)

      if (loyalty >= 0.85 && total >= 5) {
        // Historial exclusivo → auto-asigna sin necesidad IA
        project_id = topPid
        project_match_type = 'history_exclusive'
        project_confidence = Math.min(0.92, loyalty)
        action = 'auto_assign'
        razones.push(
          `Historial exclusivo proveedor: ${topCount}/${total} (${loyaltyPct}% ≥85%, mín 5) → auto_assign`
        )
      } else if (loyalty >= 0.7 && total >= 3) {
        // Lealtad alta → auto-asigna
        project_id = topPid
        project_match_type = 'history_confirmed'
        project_confidence = Math.min(0.8, loyalty)
        action = 'auto_assign'
        razones.push(
          `Lealtad proveedor: ${topCount}/${total} (${loyaltyPct}% ≥70%, mín 3) → auto_assign`
        )
      } else if (total >= 2 && topCount >= 2) {
        // Historial parcial → suggest
        project_id = topPid
        project_match_type = 'history_confirmed'
        project_confidence = loyalty * 0.6
        action = 'suggest'
        razones.push(
          `Historial proveedor parcial: ${topCount}/${total} (${loyaltyPct}%) → suggest (insuficiente para auto_assign)`
        )
      } else {
        razones.push(
          `Historial proveedor insuficiente (${total} facturas, max lealtad ${loyaltyPct}%)`
        )
      }

      // Enriquecer project_code si tenemos project_id pero no code
      if (project_id && !project_code) {
        const codeRes = await supabase
          .from('projects')
          .select('code')
          .eq('id', project_id)
          .is('deleted_at', null)
          .maybeSingle()
        if (codeRes.data) project_code = (codeRes.data as { code: string }).code
      }
    } else if (supplierFilter) {
      razones.push('Sin historial proveedor en BD')
    } else {
      razones.push('Sin supplier_id ni supplier_nif para buscar historial')
    }
  }

  if (razones.length === 0) {
    razones.push('Sin señales de corroboración → needs_review')
  }

  // Razones suggest formato §PROYECTO_SUGERIDO (compat workflow n8n actual)
  const finalRazones =
    action === 'suggest' && project_code
      ? [
          ...razones,
          `§PROYECTO_SUGERIDO:${project_code}:${Math.round(project_confidence * 100)}%:historial`,
        ]
      : razones

  const elapsed = Date.now() - startedAt
  console.log(
    `[decide-table] table=invoices match=${project_match_type ?? 'none'} action=${action} ` +
      `conf=${project_confidence.toFixed(2)} t=${elapsed}ms`
  )

  return Response.json({
    table: 'invoices',
    table_reason: 'default → invoices',
    project_id: action === 'auto_assign' ? project_id : null,
    project_code: action === 'auto_assign' ? project_code : null,
    project_match_type: action === 'auto_assign' ? project_match_type : null,
    project_confidence,
    action,
    razones: finalRazones,
    source: 'cathedral-decide-table-v2',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
