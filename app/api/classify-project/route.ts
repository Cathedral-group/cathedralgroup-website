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
  // Nuevos campos sesión 18/05: David — buscar en TODOS textos (email + factura)
  email_subject?: string | null
  email_body_excerpt?: string | null
  email_account?: string | null
  drive_folder_path?: string | null
  source?: string | null
  // Always-manual gates inputs
  doc_type?: string | null
  ocr_confidence?: number | null
}

const HIGH_VALUE_AMOUNT_THRESHOLD = 3000 // EUR — David sesión 18/05
const NON_FACTURA_DOC_TYPES = new Set(['rectificativa', 'abono', 'contrato', 'presupuesto', 'nota_simple', 'escritura'])
const OCR_CONFIDENCE_MIN = 0.80
const UNCERTAINTY_REGEX = /\b(no estoy seguro|no sé|comprob[ae]|verifica|duda|posiblemente|tal vez|quiz[áa]s|igual)\b/i

type AlwaysManualResult =
  | { forced: true; reason: string; details: Record<string, unknown> }
  | { forced: false }

function checkAlwaysManualGates(body: ClassifyBody): AlwaysManualResult {
  // 1. Worker portal source
  if ((body.source || '').toLowerCase() === 'worker_portal') {
    return { forced: true, reason: 'worker_portal_source', details: { source: body.source } }
  }
  // 2. High-value amount (>€3000)
  if (typeof body.amount_total === 'number' && body.amount_total > HIGH_VALUE_AMOUNT_THRESHOLD) {
    return { forced: true, reason: 'high_value_amount', details: { amount_total: body.amount_total, threshold: HIGH_VALUE_AMOUNT_THRESHOLD } }
  }
  // 3. Document type non-factura standard
  if (body.doc_type && NON_FACTURA_DOC_TYPES.has(body.doc_type.toLowerCase())) {
    return { forced: true, reason: 'non_standard_doc_type', details: { doc_type: body.doc_type } }
  }
  // 4. OCR confidence baja
  if (typeof body.ocr_confidence === 'number' && body.ocr_confidence < OCR_CONFIDENCE_MIN) {
    return { forced: true, reason: 'ocr_confidence_low', details: { ocr_confidence: body.ocr_confidence, threshold: OCR_CONFIDENCE_MIN } }
  }
  // 5. Amount missing (no se puede pagar sin saber importe → human verifica)
  if (body.amount_total === null || body.amount_total === undefined) {
    return { forced: true, reason: 'amount_total_missing', details: {} }
  }
  // 6. Email body contiene marcadores incertidumbre
  if (body.email_body_excerpt && UNCERTAINTY_REGEX.test(body.email_body_excerpt)) {
    return { forced: true, reason: 'email_uncertainty_markers', details: { matched: body.email_body_excerpt.match(UNCERTAINTY_REGEX)?.[0] } }
  }
  return { forced: false }
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

// ── Spanish address parser (validated doc-validator 18/05/2026) ──
// MDN normalize('NFD') + Combining Diacriticals block U+0300-U+036F
interface ParsedAddress {
  street: string
  rawNum: string
  baseNum: number
  numType: 'exact' | 'with_suffix' | 'range' | 'multiple' | 'unknown'
  suggestOnly: boolean
}

const ADDR_RE = /(?:(?:C\.?\/|Calle|Cl\.?|Av\.?(?:da)?\.?|Avda\.?|P(?:aseo|so|º)\.?|Ctra\.?|Camino)\s+(?:de\s+(?:la\s+|los\s+|las\s+|el\s+)?)?)?([A-ZÀ-ÿa-z][A-ZÀ-ÿa-z\s\-']*?),?\s+n[oºª°]?\.?\s*(\d+(?:[-–]\d+)?(?:[a-zA-Z]{1,3})?)|(?:(?:C\.?\/|Calle|Cl\.?|Av\.?(?:da)?\.?|Avda\.?|P(?:aseo|so|º)\.?|Ctra\.?|Camino)\s+(?:de\s+(?:la\s+|los\s+|las\s+|el\s+)?)?)?([A-ZÀ-ÿa-z][A-ZÀ-ÿa-z\s\-']*?),?\s+(\d+(?:[-–]\d+)?(?:bis|ter|dup|[A-Za-z])?(?!\w))/gi

function normalizeStreet(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(?:c\/|calle|cl\.?|av\.?(?:da)?\.?|avda\.?|p(?:aseo|so|º)\.?|ctra\.?|camino)\s+/i, '')
    .replace(/^(?:de\s+(?:la|los|las|el)\s+|de\s+)/i, '')
    .replace(/[,.\s]+$/, '')
    .trim()
}

function parseSpanishAddress(text: string): ParsedAddress[] {
  const results: ParsedAddress[] = []
  if (!text) return results
  const matches = [...text.matchAll(ADDR_RE)]
  for (const m of matches) {
    const rawStreet = (m[1] || m[3] || '').trim()
    const rawNum = (m[2] || m[4] || '').trim()
    if (!rawStreet || !rawNum) continue
    const street = normalizeStreet(rawStreet)
    if (!street || street.length < 3) continue
    const rangeM = rawNum.match(/^(\d+)[-–](\d+)$/)
    const suffixM = rawNum.match(/^(\d+)(bis|ter|dup|[a-zA-Z])$/i)
    const exactM = rawNum.match(/^(\d+)$/)
    let numType: ParsedAddress['numType'] = 'unknown'
    let baseNum = 0
    let suggestOnly = true
    if (rangeM) { numType = 'range'; baseNum = +rangeM[1]; suggestOnly = true }
    else if (suffixM) { numType = 'with_suffix'; baseNum = +suffixM[1]; suggestOnly = false }
    else if (exactM) { numType = 'exact'; baseNum = +exactM[1]; suggestOnly = false }
    results.push({ street, rawNum, baseNum, numType, suggestOnly })
  }
  const distinctStreets = new Set(results.map((r) => r.street))
  if (distinctStreets.size > 1) results.forEach((r) => (r.suggestOnly = true))
  return results
}

// Cathedral Buenavista typo guard (hardcoded MVP — BD config table futuro)
const BUENAVISTA_COERCE: Record<number, { coerceTo: number }> = {
  25: { coerceTo: 24 }, 26: { coerceTo: 24 }, 27: { coerceTo: 24 },
  36: { coerceTo: 38 }, 37: { coerceTo: 38 },
}

interface AddressMatchHint {
  matched_project_id: string | null
  matched_project_code: string | null
  street: string
  raw_num: string
  effective_num: number
  coerced: boolean
  coerced_from: number | null
  coerced_to: number | null
  candidates_count: number
}

function matchAddressToProject(parsed: ParsedAddress, activeProjects: ProjectRow[]): AddressMatchHint | null {
  if (!parsed.street || parsed.numType === 'range' || parsed.numType === 'multiple') return null
  let effectiveNum = parsed.baseNum
  let coerced = false
  let coercedFrom: number | null = null
  let coercedTo: number | null = null
  if (parsed.street === 'buenavista' && BUENAVISTA_COERCE[parsed.baseNum]) {
    coerced = true
    coercedFrom = parsed.baseNum
    coercedTo = BUENAVISTA_COERCE[parsed.baseNum].coerceTo
    effectiveNum = coercedTo
  }
  const candidates = activeProjects.filter((p) => {
    if (!p.address) return false
    const projParsed = parseSpanishAddress(p.address)
    return projParsed.some((pp) => pp.street === parsed.street && pp.baseNum === effectiveNum)
  })
  if (candidates.length === 0) return null
  return {
    matched_project_id: candidates.length === 1 ? candidates[0].id : null,
    matched_project_code: candidates.length === 1 ? candidates[0].code : null,
    street: parsed.street,
    raw_num: parsed.rawNum,
    effective_num: effectiveNum,
    coerced,
    coerced_from: coercedFrom,
    coerced_to: coercedTo,
    candidates_count: candidates.length,
  }
}

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

  // ── ALWAYS-MANUAL GATES (David SUPREMA sesión 18/05) ──
  // Override TODO (Tier 0 + LLM). Si gate forzado → respuesta directa needs_review.
  const alwaysManual = checkAlwaysManualGates(body)
  if (alwaysManual.forced) {
    return NextResponse.json({
      project_id: null,
      project_code: null,
      match_type: 'no_match',
      confidence: 0,
      action: 'needs_review',
      reasoning: `Always-manual gate forzado: ${alwaysManual.reason}. Sin clasificación automática — admin revisa manualmente.`,
      alternatives: [],
      _server_enforcement: {
        defensive_gate_applied: true,
        gate_met: null,
        downgrade_reason: `always_manual_${alwaysManual.reason}`,
        always_manual_details: alwaysManual.details,
        worker_source: (body.source || '').toLowerCase() === 'worker_portal',
        original_llm_action: null,
      },
      _meta: {
        skipped_llm: true,
        tier: -1,
        gate_met: null,
        always_manual_reason: alwaysManual.reason,
        candidates_considered: activeProjects.length,
        supplier_history_rows: supplierHistory.length,
      },
    })
  }

  // ── TIER 0 PRE-LLM SHORT-CIRCUIT (FrugalGPT pattern, David sesión 18/05) ──
  // Si literal code unique active + supplier history NOT contradice → auto_assign sin LLM
  // Si address exact unique no coerced + supplier history NOT contradice → auto_assign sin LLM
  // Ahorra ~$0.01 + 5-15s/call cuando señales determinísticas claras
  // Worker portal source ya filtrado arriba en always-manual.

  const t0_isWorkerSource = false  // Always-manual ya excluye worker_portal

  if (!t0_isWorkerSource) {
    const t0_allText = [
      body.direccion_obra || '',
      body.email_subject || '',
      body.email_body_excerpt || '',
      body.concept || '',
      (body.extracted_text || '').slice(0, 4000),
    ].join('\n')

    const t0_projectCodeRegex = /\b[A-Z]{2,4}-\d{4}-\d{3}\b/g
    const t0_shortCodeRegex = /\bCG-[A-Z0-9]{2,8}\b/g
    const t0_codesFound = Array.from(new Set([
      ...(t0_allText.match(t0_projectCodeRegex) || []),
      ...(t0_allText.match(t0_shortCodeRegex) || []),
    ]))
    const t0_activeCodeSet = new Set([
      ...activeProjects.map((p) => p.code),
      ...(activeProjects.map((p) => p.codigo_corto).filter(Boolean) as string[]),
    ])
    const t0_codesActive = t0_codesFound.filter((c) => t0_activeCodeSet.has(c))

    function supplierContradicts(targetProjectId: string): boolean {
      if (supplierHistory.length === 0) return false
      const top = [...supplierHistory].sort((a, b) => b.invoice_count - a.invoice_count)[0]
      return top.project_id !== targetProjectId && top.invoice_count >= 5
    }

    // Gate 1: Literal code unique → SUGGEST (David sesión 18/05: NUNCA auto, plantilla copiada riesgo)
    if (t0_codesActive.length === 1) {
      const code = t0_codesActive[0]
      const project = activeProjects.find((p) => p.code === code || p.codigo_corto === code)
      if (project && !supplierContradicts(project.id)) {
        return NextResponse.json({
          project_id: project.id,
          project_code: project.code,
          match_type: 'code_literal',
          confidence: 0.85,
          action: 'suggest',
          reasoning: `SUGERENCIA: Código literal "${code}" encontrado en texto, único proyecto activo coincidente (${project.code}). Historial proveedor no contradice. ⚠️ NO auto-asignado por riesgo plantilla copiada (proveedor pudo reusar template factura vieja). Admin valida 1-click.`,
          alternatives: [{
            project_id: project.id,
            project_code: project.code,
            confidence: 0.85,
            reason: 'Literal code match unique active (review template copy risk)',
          }],
          _server_enforcement: {
            defensive_gate_applied: false,
            gate_met: 'literal_code_suggest',
            downgrade_reason: null,
            literal_codes_in_text: t0_codesFound,
            literal_codes_active: t0_codesActive,
            worker_source: false,
            original_llm_action: null,
          },
          _meta: {
            skipped_llm: true,
            tier: 0,
            gate_met: 'literal_code',
            never_auto_assign: true,
            template_copy_risk_acknowledged: true,
            supplier_history_checked: true,
            contradiction_detected: false,
            candidates_considered: activeProjects.length,
            supplier_history_rows: supplierHistory.length,
          },
        })
      }
    }

    // Gate 2: Address parser unique exact, no coerced, single street
    const t0_parsedAddrs = parseSpanishAddress(t0_allText)
    const t0_distinctStreets = new Set(t0_parsedAddrs.map((p) => p.street))
    if (t0_distinctStreets.size === 1 && t0_parsedAddrs.length >= 1) {
      const t0_hints = t0_parsedAddrs
        .map((p) => matchAddressToProject(p, activeProjects))
        .filter((h): h is AddressMatchHint => h !== null)
      const t0_uniqueExact = t0_hints.filter((h) => h.matched_project_id !== null && !h.coerced && h.candidates_count === 1)
      if (t0_uniqueExact.length === 1) {
        const hint = t0_uniqueExact[0]
        const project = activeProjects.find((p) => p.id === hint.matched_project_id)
        if (project && !supplierContradicts(project.id)) {
          return NextResponse.json({
            project_id: project.id,
            project_code: project.code,
            match_type: 'address_match',
            confidence: 0.80,
            action: 'suggest',
            reasoning: `SUGERENCIA: Dirección "${hint.street} ${hint.effective_num}" único match activo (${project.code}). Sin typo coercion. Historial proveedor no contradice. ⚠️ NO auto-asignado por riesgo plantilla copiada. Admin valida 1-click.`,
            alternatives: [{
              project_id: project.id,
              project_code: project.code,
              confidence: 0.80,
              reason: 'Address exact unique active (review template copy risk)',
            }],
            _server_enforcement: {
              defensive_gate_applied: false,
              gate_met: 'address_match_suggest',
              downgrade_reason: null,
              literal_codes_in_text: t0_codesFound,
              literal_codes_active: t0_codesActive,
              address_hints: t0_hints,
              parsed_addresses_count: t0_parsedAddrs.length,
              distinct_streets_count: 1,
              worker_source: false,
              original_llm_action: null,
            },
            _meta: {
              skipped_llm: true,
              tier: 0,
              gate_met: 'address_match',
              never_auto_assign: true,
              template_copy_risk_acknowledged: true,
              supplier_history_checked: true,
              contradiction_detected: false,
              candidates_considered: activeProjects.length,
              supplier_history_rows: supplierHistory.length,
            },
          })
        }
      }
    }
  }

  // ── Fallthrough TIER 1+ LLM Sonnet 4.6 ──

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

  // ── Multi-source text search (David 18/05): buscar address en TODAS zonas ──
  const allTextSources = [
    body.direccion_obra || '',
    body.email_subject || '',
    body.email_body_excerpt || '',
    body.concept || '',
    (body.extracted_text || '').slice(0, 4000),
  ].join('\n')

  const parsedAddresses = parseSpanishAddress(allTextSources)
  const addressHints = parsedAddresses
    .map((p) => matchAddressToProject(p, activeProjects))
    .filter((h): h is AddressMatchHint => h !== null)

  const userMessage = JSON.stringify({
    document: {
      extracted_text: (body.extracted_text || '').slice(0, 4000),
      concept: body.concept,
      supplier_name: body.supplier_name,
      supplier_nif: body.supplier_nif,
      amount_total: body.amount_total,
      issue_date: body.issue_date,
      direccion_obra: body.direccion_obra,
      // Email metadata (David 18/05: gremios incluyen referencia obra en subject/body)
      email_subject: body.email_subject,
      email_body_excerpt: (body.email_body_excerpt || '').slice(0, 500),
      email_account: body.email_account,
      drive_folder_path: body.drive_folder_path,
      source: body.source,
    },
    // Hints pre-parseados server-side (LLM tiene contexto rico para suggest)
    address_match_hints: addressHints,
    parsed_addresses_count: parsedAddresses.length,
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

  // ── DEFENSIVE GATE (Cathedral SUPREMA + David 18/05 expand) ──
  // auto_assign permitido SOLO si:
  //   A) Código literal exact unique match con assigned (sin contradicciones)
  //   B) OR Address hint exact unique match con assigned + parsed sin ambigüedad + NOT coerced
  // Resto → forzar suggest (defensive bias).
  // Worker source siempre forzar suggest mínimo (escenario foto cruzada trabajador).

  const projectCodeRegex = /\b[A-Z]{2,4}-\d{4}-\d{3}\b/g
  const shortCodeRegex = /\bCG-[A-Z0-9]{2,8}\b/g
  const allTextForRegex = allTextSources
  const literalCodesFound = [
    ...(allTextForRegex.match(projectCodeRegex) || []),
    ...(allTextForRegex.match(shortCodeRegex) || []),
  ]
  const activeCodeSet = new Set([
    ...activeProjects.map((p) => p.code),
    ...(activeProjects.map((p) => p.codigo_corto).filter(Boolean) as string[]),
  ])
  const matchedActiveCodes = literalCodesFound.filter((c) => activeCodeSet.has(c))
  const literalExactMatchUnique = matchedActiveCodes.length === 1
  const literalMatchesAssigned = literalExactMatchUnique && matchedActiveCodes[0] === parsed.project_code

  // Address gate: hint exact unique + NOT coerced + parsed sin distinct street ambiguity
  const distinctParsedStreets = new Set(parsedAddresses.map((p) => p.street))
  const uniqueAddressHints = addressHints.filter((h) => h.matched_project_id !== null && !h.coerced && h.candidates_count === 1)
  const addressMatchesAssigned = uniqueAddressHints.length === 1
    && distinctParsedStreets.size === 1
    && uniqueAddressHints[0].matched_project_id === parsed.project_id

  const isWorkerSource = (body.source || '').toLowerCase() === 'worker_portal'

  // David SUPREMA sesión 18/05: auto_assign efectivamente DESACTIVADO.
  // Todas las clasificaciones (LLM + Tier 0) → suggest con project_id pre-rellenado.
  // Admin valida 1-click siempre. Riesgo plantilla copiada / OCR errors / supplier
  // multi-project nunca aceptado como auto sin revisión humana.
  let serverEnforcedAction = parsed.action as string
  let serverDowngradedReason = ''
  let gateMet: 'literal_code' | 'address_match' | null = null

  if (parsed.action === 'auto_assign') {
    // Downgrade siempre a suggest, preservar project_id como sugerencia
    serverEnforcedAction = 'suggest'
    if (isWorkerSource) {
      serverDowngradedReason = 'worker_portal_source_never_auto'
    } else if (literalMatchesAssigned) {
      gateMet = 'literal_code'
      serverDowngradedReason = 'never_auto_assign_template_copy_risk'
    } else if (addressMatchesAssigned) {
      gateMet = 'address_match'
      serverDowngradedReason = 'never_auto_assign_template_copy_risk'
    } else if (literalCodesFound.length === 0 && addressHints.length === 0) {
      serverDowngradedReason = 'no_literal_code_no_address_match'
    } else if (matchedActiveCodes.length > 1) {
      serverDowngradedReason = 'multiple_literal_codes_ambiguous'
    } else if (distinctParsedStreets.size > 1) {
      serverDowngradedReason = 'multiple_distinct_streets_in_text'
    } else if (addressHints.some((h) => h.coerced)) {
      serverDowngradedReason = 'address_coerced_typo_guard'
    } else if (addressHints.some((h) => h.candidates_count > 1)) {
      serverDowngradedReason = 'address_multiple_candidates'
    } else {
      serverDowngradedReason = 'never_auto_assign_default_policy'
    }
  }

  return NextResponse.json({
    ...parsed,
    action: serverEnforcedAction,
    _server_enforcement: {
      defensive_gate_applied: serverDowngradedReason !== '',
      gate_met: gateMet,
      downgrade_reason: serverDowngradedReason || null,
      literal_codes_in_text: literalCodesFound,
      literal_codes_active: matchedActiveCodes,
      address_hints: addressHints,
      parsed_addresses_count: parsedAddresses.length,
      distinct_streets_count: distinctParsedStreets.size,
      worker_source: isWorkerSource,
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
