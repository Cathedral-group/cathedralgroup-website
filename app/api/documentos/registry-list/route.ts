import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { resolveCompanyIdForRequest } from '@/lib/company-context'

/**
 * GET /api/documentos/registry-list
 *
 * Endpoint paginado + filtrado sobre `documents_registry` (matview cross-doc-type).
 *
 * Query params:
 *   - doc_type=factura|nomina|contrato|escritura|...|otro    (csv permitido: factura,ticket)
 *   - project_id=<uuid>
 *   - property_id=<uuid>
 *   - project_filter=with|without   (project_id IS NOT NULL | IS NULL — overridable por project_id)
 *   - property_filter=with|without  (property_id IS NOT NULL | IS NULL)
 *   - review_status=pending|approved|...                     (csv permitido)
 *   - from=YYYY-MM-DD              (fecha_relevante >=)
 *   - to=YYYY-MM-DD                (fecha_relevante <=)
 *   - min_amount=<number>          (importe_principal >=)
 *   - max_amount=<number>          (importe_principal <=)
 *   - vencimiento_dias=30|60|90    (fecha_vencimiento entre hoy y hoy+N)
 *   - search=<texto>               (busca en contraparte_principal, contraparte_nif, original_filename)
 *   - include_deleted=true|false   (default false)
 *   - cursor=<created_at_iso>|<uuid>   pagination cursor
 *   - limit=<n>                    (default 50, max 200)
 *   - sort=fecha_relevante|importe_principal|created_at     (default fecha_relevante)
 *   - order=desc|asc               (default desc)
 *   - with_facets=true|false       (default false — solo primera página normalmente)
 *
 * Auth: sesión admin allow-list + AAL2 (igual que /api/db).
 * Bearer interno opcional para server-to-server: header `X-Internal-Token`
 * comparado en tiempo constante con env `INTERNAL_API_TOKEN`.
 *
 * Multi-empresa: siempre filtra por `company_id` activa (header
 * X-Active-Company-Id o JWT app_metadata). Sin override posible.
 *
 * Response JSON:
 *   {
 *     data: Array<DocumentRegistryRow>,
 *     next_cursor: string | null,
 *     total_count: number,            // count exacto con filtros aplicados
 *     facets?: { doc_type: {...}, review_status: {...} }  // solo si with_facets=true
 *   }
 */

const VALID_SORT = new Set(['fecha_relevante', 'importe_principal', 'created_at'])
const VALID_ORDER = new Set(['asc', 'desc'])
const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

type AuthOutcome =
  | { ok: true; userEmail: string | null; companyId: string | null; internal: false }
  | { ok: true; userEmail: null; companyId: string | null; internal: true }
  | { ok: false; status: number; error: string }

/** Comparación en tiempo constante para tokens (evita timing attacks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function authOrInternal(req: NextRequest): Promise<AuthOutcome> {
  // 1. Bearer interno server-to-server
  const internalToken = req.headers.get('x-internal-token')
  if (internalToken && process.env.INTERNAL_API_TOKEN) {
    if (timingSafeEqual(internalToken, process.env.INTERNAL_API_TOKEN)) {
      // Internal callers DEBEN proveer company_id explícito en query string
      const companyId = req.nextUrl.searchParams.get('company_id')
      if (!companyId) {
        return { ok: false, status: 400, error: 'company_id requerido para llamada interna' }
      }
      return { ok: true, userEmail: null, companyId, internal: true }
    }
    // Token presente pero inválido: no caer a sesión, rechazar duro.
    return { ok: false, status: 401, error: 'Token interno inválido' }
  }

  // 2. Sesión admin (allow-list + AAL2)
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return { ok: false, status: 401, error: 'No autorizado' }
  if (!isAdminEmail(data.user.email)) {
    console.warn('[registry-list] email NOT in allow-list:', data.user.email)
    return { ok: false, status: 401, error: 'No autorizado' }
  }
  const { data: aal, error: aalErr } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalErr || !aal || aal.currentLevel !== 'aal2') {
    return { ok: false, status: 401, error: 'MFA requerido' }
  }

  // Resolver empresa activa (header X-Active-Company-Id o JWT, fallback DEFAULT)
  let companyId: string | null = null
  try {
    companyId = resolveCompanyIdForRequest(data.user, req.headers)
  } catch (e) {
    return { ok: false, status: 403, error: e instanceof Error ? e.message : 'Forbidden company' }
  }
  return { ok: true, userEmail: data.user.email ?? null, companyId, internal: false }
}

function parseCsvParam(v: string | null): string[] | null {
  if (!v) return null
  const arr = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return arr.length > 0 ? arr : null
}

function clampInt(v: string | null, def: number, min: number, max: number): number {
  if (!v) return def
  const n = parseInt(v, 10)
  if (isNaN(n)) return def
  return Math.max(min, Math.min(max, n))
}

function parseNum(v: string | null): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function isIsoDate(s: string | null): boolean {
  if (!s) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function GET(req: NextRequest) {
  const auth = await authOrInternal(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Sin empresa activa' }, { status: 400 })
  }
  // TS narrowing: extraer a const local para que closure applyFilters lo vea
  const companyId: string = auth.companyId

  const sp = req.nextUrl.searchParams

  // ─── Parse params ───────────────────────────────────────────────────────
  const docTypes = parseCsvParam(sp.get('doc_type'))
  const projectId = sp.get('project_id')
  const propertyId = sp.get('property_id')
  const projectFilterRaw = sp.get('project_filter')
  const projectFilter: 'with' | 'without' | null =
    projectFilterRaw === 'with' || projectFilterRaw === 'without' ? projectFilterRaw : null
  const propertyFilterRaw = sp.get('property_filter')
  const propertyFilter: 'with' | 'without' | null =
    propertyFilterRaw === 'with' || propertyFilterRaw === 'without' ? propertyFilterRaw : null
  const reviewStatuses = parseCsvParam(sp.get('review_status'))
  const from = sp.get('from')
  const to = sp.get('to')
  const minAmount = parseNum(sp.get('min_amount'))
  const maxAmount = parseNum(sp.get('max_amount'))
  const vencimientoDiasRaw = parseNum(sp.get('vencimiento_dias'))
  const vencimientoDias =
    vencimientoDiasRaw != null && vencimientoDiasRaw > 0 && vencimientoDiasRaw <= 3650
      ? Math.floor(vencimientoDiasRaw)
      : null
  const search = sp.get('search')?.trim() || null
  const includeDeleted = sp.get('include_deleted') === 'true'
  const cursor = sp.get('cursor')
  const limit = clampInt(sp.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const sortRaw = sp.get('sort') ?? 'fecha_relevante'
  const orderRaw = sp.get('order') ?? 'desc'
  const withFacets = sp.get('with_facets') === 'true'

  const sort = VALID_SORT.has(sortRaw) ? sortRaw : 'fecha_relevante'
  const order = VALID_ORDER.has(orderRaw) ? orderRaw : 'desc'
  const ascending = order === 'asc'

  if (from && !isIsoDate(from)) {
    return NextResponse.json({ error: 'Parametro from inválido (YYYY-MM-DD)' }, { status: 400 })
  }
  if (to && !isIsoDate(to)) {
    return NextResponse.json({ error: 'Parametro to inválido (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // ─── Builder común de filtros ───────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any): any {
    q = q.eq('company_id', companyId)
    if (!includeDeleted) q = q.is('deleted_at', null)
    if (docTypes && docTypes.length > 0) q = q.in('doc_type', docTypes)
    if (projectId) {
      q = q.eq('project_id', projectId)
    } else if (projectFilter === 'with') {
      q = q.not('project_id', 'is', null)
    } else if (projectFilter === 'without') {
      q = q.is('project_id', null)
    }
    if (propertyId) {
      q = q.eq('property_id', propertyId)
    } else if (propertyFilter === 'with') {
      q = q.not('property_id', 'is', null)
    } else if (propertyFilter === 'without') {
      q = q.is('property_id', null)
    }
    if (reviewStatuses && reviewStatuses.length > 0) q = q.in('review_status', reviewStatuses)
    if (from) q = q.gte('fecha_relevante', from)
    if (to) q = q.lte('fecha_relevante', to)
    if (minAmount != null) q = q.gte('importe_principal', minAmount)
    if (maxAmount != null) q = q.lte('importe_principal', maxAmount)
    if (vencimientoDias != null) {
      const today = new Date()
      const todayIso = today.toISOString().slice(0, 10)
      const limitDate = new Date()
      limitDate.setDate(limitDate.getDate() + vencimientoDias)
      const limitIso = limitDate.toISOString().slice(0, 10)
      q = q.gte('fecha_vencimiento', todayIso).lte('fecha_vencimiento', limitIso)
    }
    if (search) {
      // Escape % y , para PostgREST .or() — comas son separador y % es wildcard
      const safe = search.replace(/[%,()]/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        q = q.or(
          `contraparte_principal.ilike.${pattern},contraparte_nif.ilike.${pattern},original_filename.ilike.${pattern}`,
        )
      }
    }
    return q
  }

  // ─── Total count con filtros ─────────────────────────────────────────────
  let countQ = supabase
    .from('documents_registry')
    .select('source_id', { count: 'exact', head: true })
  countQ = applyFilters(countQ)
  const { count: totalCount, error: countErr } = await countQ
  if (countErr) {
    console.error('[registry-list] count error:', countErr.message, countErr.details)
    return NextResponse.json({ error: 'Error al contar' }, { status: 500 })
  }

  // ─── Query principal (data page) ────────────────────────────────────────
  // Cursor pagination: cursor = `<sortValue>|<source_id>`
  // donde sortValue es el valor de la columna sort de la última fila previa.
  // Para evitar duplicados con ties en sort, usamos source_id como tiebreaker.
  let dataQ = supabase.from('documents_registry').select('*')
  dataQ = applyFilters(dataQ)

  if (cursor) {
    const [cursorSortVal, cursorId] = cursor.split('|')
    if (cursorSortVal && cursorId) {
      // (sort, source_id) lexicographic comparison
      const op = ascending ? 'gt' : 'lt'
      // PostgREST no soporta tuple compare directo. Aproximación:
      //   ((sort > cursorSortVal) OR (sort = cursorSortVal AND source_id > cursorId))
      dataQ = dataQ.or(
        `${sort}.${op}.${encodeURIComponent(cursorSortVal)},` +
          `and(${sort}.eq.${encodeURIComponent(cursorSortVal)},source_id.${op}.${cursorId})`,
      )
    }
  }

  dataQ = dataQ
    .order(sort, { ascending, nullsFirst: false })
    .order('source_id', { ascending })
    .limit(limit + 1) // pedimos uno extra para saber si hay next_cursor

  const { data, error } = await dataQ
  if (error) {
    console.error('[registry-list] query error:', error.message, error.details, error.hint)
    return NextResponse.json({ error: 'Error al consultar' }, { status: 500 })
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  let nextCursor: string | null = null
  if (rows.length > limit) {
    const last = rows[limit - 1] as Record<string, unknown>
    const sortVal = last[sort]
    const sourceId = last['source_id']
    if (sortVal != null && sourceId != null) {
      nextCursor = `${String(sortVal)}|${String(sourceId)}`
    }
    rows.pop() // descartar el extra
  }

  // ─── Facets opcionales (solo si with_facets=true, p.ej. primera carga) ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let facets: { doc_type: Record<string, number>; review_status: Record<string, number> } | undefined
  if (withFacets) {
    let facetQ = supabase.from('documents_registry').select('doc_type, review_status')
    facetQ = applyFilters(facetQ).limit(10000) // sample defensivo
    const { data: facetData, error: facetErr } = await facetQ
    if (!facetErr && facetData) {
      const docTypeCounts: Record<string, number> = {}
      const reviewCounts: Record<string, number> = {}
      for (const r of facetData as Array<{ doc_type: string; review_status: string | null }>) {
        const dt = r.doc_type ?? 'otro'
        docTypeCounts[dt] = (docTypeCounts[dt] ?? 0) + 1
        const rs = r.review_status ?? 'sin_estado'
        reviewCounts[rs] = (reviewCounts[rs] ?? 0) + 1
      }
      facets = { doc_type: docTypeCounts, review_status: reviewCounts }
    }
  }

  return NextResponse.json({
    data: rows,
    next_cursor: nextCursor,
    total_count: totalCount ?? 0,
    ...(facets ? { facets } : {}),
  })
}
