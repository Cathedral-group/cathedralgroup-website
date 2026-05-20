/**
 * POST /api/documentos/bulk
 *
 * Acciones masivas sobre múltiples documentos seleccionados en el hub
 * /admin/documentos. Operaciones soportadas:
 *   - reclassify: cambia project_id (requiere project_id en body, o null para "general")
 *   - set-party : cambia la party_* asociada (depende de la tabla destino)
 *   - confirm   : review_status='confirmado', needs_review=false (si existe)
 *   - reject    : review_status='rechazado'
 *   - trash     : soft delete (deleted_at=now())
 *   - restore   : reverte soft delete (deleted_at=null)
 *
 * Auth: allow-list + AAL2. Multi-empresa via header X-Active-Company-Id o JWT.
 *
 * Semántica per-item: NO transacción. Si un item falla, se continúa con el
 * resto. Se devuelve detalle por item para que el cliente pinte "8 OK, 2 fallaron".
 *
 * Defensa contra DoS: máx 100 items por request.
 * Defensa contra SQL-injection: source_table contra whitelist estricto +
 * source_id contra regex UUID.
 *
 * Audit log: 1 row por item exitoso (action='bulk_<action>') en admin_audit_log.
 * Si la acción NO modifica ninguna fila (count=0, p.ej. ya en papelera) se
 * reporta como failure pero no se loggea (no hubo cambio real).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { resolveCompanyIdForRequest, getCompanyContextFromUser } from '@/lib/company-context'
import type { User } from '@supabase/supabase-js'

/* ─── Constantes de validación ─────────────────────────────────────────── */

const VALID_ACTIONS = new Set([
  'reclassify',
  'set-party',
  'confirm',
  'reject',
  'trash',
  'restore',
] as const)
type BulkAction = 'reclassify' | 'set-party' | 'confirm' | 'reject' | 'trash' | 'restore'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ITEMS = 100

/**
 * Whitelist de source_tables válidas. Coincide con la matview documents_registry
 * (migración 20260520000000_multidoctype_schema_cathedral.sql).
 * También incluimos metadatos por tabla:
 *   - partyCol: columna FK que usa set-party (null = no soporta set-party)
 *   - reviewedByIsText: true si reviewed_by es TEXT (email) en lugar de UUID
 *   - needsReviewCol: true si la tabla tiene la columna needs_review
 */
const TABLE_META: Record<
  string,
  { partyCol: string | null; reviewedByIsText: boolean; needsReviewCol: boolean; projectIdCol: boolean }
> = {
  invoices:              { partyCol: null,                 reviewedByIsText: true,  needsReviewCol: true,  projectIdCol: true  },
  payrolls:              { partyCol: null,                 reviewedByIsText: true,  needsReviewCol: true,  projectIdCol: false },
  contratos:             { partyCol: 'party_id',           reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  notas_simples:         { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: false },
  escrituras:            { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: false },
  licencias:             { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  certificaciones_obra:  { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  certificados:          { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  informes:              { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  seguros:               { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  modelos_fiscales:      { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: false },
  justificantes_pago:    { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: false },
  albaranes:             { partyCol: 'party_proveedor_id', reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  presupuestos:          { partyCol: 'party_emisor_id',    reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
  documentos_otros:      { partyCol: null,                 reviewedByIsText: false, needsReviewCol: false, projectIdCol: true  },
}

/* ─── Auth ─────────────────────────────────────────────────────────────── */

async function authCheck(): Promise<User | null> {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) {
    console.warn('[bulk authCheck] email NOT in allow-list:', data.user.email)
    return null
  }
  const { data: aal, error: aalErr } =
    await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalErr || !aal || aal.currentLevel !== 'aal2') {
    console.warn('[bulk authCheck] AAL2 not satisfied:', {
      email: data.user.email,
      currentLevel: aal?.currentLevel,
    })
    return null
  }
  return data.user
}

/* ─── Tipos ────────────────────────────────────────────────────────────── */

interface BulkItem {
  source_table: string
  source_id: string
}

interface ItemResult {
  source_table: string
  source_id: string
  success: boolean
  error?: string
}

/* ─── Body parsing — acepta dos formatos ───────────────────────────────── */

/**
 * Acepta dos formatos de body por compatibilidad con el cliente actual:
 *
 *   A) Formato spec (recomendado, nuevo):
 *      { action, items: [{ source_table, source_id }, ...], project_id?, party_id?, reason? }
 *
 *   B) Formato legacy del hub (DocumentsHubView.tsx línea 568 actual):
 *      { action, ids: ["<source_table>:<source_id>", ...], project?, party? }
 *
 * Para B) parseamos los ids `"<table>:<id>"` a items. Si `project` es "general"
 * o vacío → project_id = null. Si `project` parece un UUID se usa tal cual;
 * si parece un código de proyecto → se resuelve contra projects.code.
 */
async function parseBody(
  raw: Record<string, unknown>,
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  companyId: string,
): Promise<
  | {
      ok: true
      action: BulkAction
      items: BulkItem[]
      project_id: string | null | undefined // undefined = no se proporcionó
      party_id: string | null | undefined
      reason: string | null
    }
  | { ok: false; error: string; status: number }
> {
  const action = raw.action
  if (typeof action !== 'string' || !VALID_ACTIONS.has(action as BulkAction)) {
    return { ok: false, error: `action inválida (debe ser uno de: ${[...VALID_ACTIONS].join(', ')})`, status: 400 }
  }

  // Parseo de items: aceptar `items` (spec) o `ids` (legacy)
  let items: BulkItem[] = []
  if (Array.isArray(raw.items)) {
    for (const it of raw.items as unknown[]) {
      if (!it || typeof it !== 'object') continue
      const obj = it as Record<string, unknown>
      const st = typeof obj.source_table === 'string' ? obj.source_table : ''
      const sid = typeof obj.source_id === 'string' ? obj.source_id : ''
      if (st && sid) items.push({ source_table: st, source_id: sid })
    }
  } else if (Array.isArray(raw.ids)) {
    for (const idRaw of raw.ids as unknown[]) {
      if (typeof idRaw !== 'string') continue
      const idx = idRaw.indexOf(':')
      if (idx <= 0 || idx >= idRaw.length - 1) continue
      items.push({
        source_table: idRaw.slice(0, idx),
        source_id: idRaw.slice(idx + 1),
      })
    }
  } else {
    return { ok: false, error: 'items o ids requerido', status: 400 }
  }

  if (items.length === 0) {
    return { ok: false, error: 'Sin items', status: 400 }
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `Máx ${MAX_ITEMS} items por request`, status: 413 }
  }

  // Validar source_table + source_id de cada item
  for (const it of items) {
    if (!TABLE_META[it.source_table]) {
      return { ok: false, error: `source_table no permitida: ${it.source_table}`, status: 400 }
    }
    if (!UUID_RE.test(it.source_id)) {
      return { ok: false, error: `source_id no es UUID válido: ${it.source_id}`, status: 400 }
    }
  }

  // project_id (solo relevante para reclassify)
  let project_id: string | null | undefined = undefined
  if (action === 'reclassify') {
    const projectIdRaw = raw.project_id
    const projectLegacy = raw.project // formato legacy del hub
    if (projectIdRaw === null || projectIdRaw === undefined) {
      // Resolver desde formato legacy
      if (projectLegacy === null || projectLegacy === undefined || projectLegacy === '' || projectLegacy === 'general') {
        project_id = null
      } else if (typeof projectLegacy === 'string') {
        if (UUID_RE.test(projectLegacy)) {
          project_id = projectLegacy
        } else {
          // Asumir código de proyecto → resolver
          const { data: proj, error } = await supabase
            .from('projects')
            .select('id')
            .eq('code', projectLegacy)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .maybeSingle()
          if (error) {
            console.error('[bulk parseBody] project lookup error:', error.message)
            return { ok: false, error: 'Error al resolver proyecto', status: 500 }
          }
          if (!proj) {
            return { ok: false, error: `Proyecto no encontrado: ${projectLegacy}`, status: 404 }
          }
          project_id = proj.id as string
        }
      } else {
        return { ok: false, error: 'project_id o project requerido para reclassify', status: 400 }
      }
    } else if (projectIdRaw === null) {
      project_id = null
    } else if (typeof projectIdRaw === 'string' && UUID_RE.test(projectIdRaw)) {
      project_id = projectIdRaw
    } else {
      return { ok: false, error: 'project_id debe ser UUID o null', status: 400 }
    }

    // Si project_id no es null, verificar pertenencia a la company activa (IDOR check)
    if (project_id !== null) {
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .select('id, company_id')
        .eq('id', project_id)
        .maybeSingle()
      if (projErr) {
        console.error('[bulk parseBody] project verify error:', projErr.message)
        return { ok: false, error: 'Error al verificar proyecto', status: 500 }
      }
      if (!proj) return { ok: false, error: 'Proyecto no encontrado', status: 404 }
      if (proj.company_id !== companyId) {
        return { ok: false, error: 'Forbidden: proyecto de otra empresa', status: 403 }
      }
    }
  }

  // party_id (solo relevante para set-party)
  let party_id: string | null | undefined = undefined
  if (action === 'set-party') {
    const partyIdRaw = raw.party_id
    const partyLegacy = raw.party
    if (partyIdRaw === null) {
      party_id = null
    } else if (typeof partyIdRaw === 'string' && UUID_RE.test(partyIdRaw)) {
      party_id = partyIdRaw
    } else if (typeof partyLegacy === 'string' && partyLegacy.trim()) {
      // Resolver el party por nombre o NIF (legacy del hub)
      const search = partyLegacy.trim()
      const { data: parties, error } = await supabase
        .from('parties')
        .select('id')
        .or(`nif.eq.${search},name.ilike.${search}`)
        .limit(2)
      if (error) {
        console.error('[bulk parseBody] party lookup error:', error.message)
        return { ok: false, error: 'Error al resolver contraparte', status: 500 }
      }
      if (!parties || parties.length === 0) {
        return { ok: false, error: `Contraparte no encontrada: ${search}`, status: 404 }
      }
      if (parties.length > 1) {
        return { ok: false, error: `Contraparte ambigua: ${search} (multiples coincidencias)`, status: 400 }
      }
      party_id = parties[0].id as string
    } else {
      return { ok: false, error: 'party_id o party requerido para set-party', status: 400 }
    }

    // Verificar party existe (las parties son globales — no tienen company_id;
    // ver TABLES_WITHOUT_COMPANY_ID en company-context.ts)
    if (party_id !== null) {
      const { data: p, error: pErr } = await supabase
        .from('parties')
        .select('id')
        .eq('id', party_id)
        .maybeSingle()
      if (pErr) {
        console.error('[bulk parseBody] party verify error:', pErr.message)
        return { ok: false, error: 'Error al verificar contraparte', status: 500 }
      }
      if (!p) return { ok: false, error: 'Contraparte no encontrada', status: 404 }
    }
  }

  const reason = typeof raw.reason === 'string' ? raw.reason.slice(0, 500) : null

  return { ok: true, action: action as BulkAction, items, project_id, party_id, reason }
}

/* ─── Per-item dispatch ────────────────────────────────────────────────── */

async function applyItem(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  item: BulkItem,
  action: BulkAction,
  user: User,
  companyId: string,
  project_id: string | null | undefined,
  party_id: string | null | undefined,
): Promise<ItemResult> {
  const meta = TABLE_META[item.source_table]
  // Imposible llegar aquí sin meta válido — parseBody ya validó. Defensivo:
  if (!meta) {
    return { ...item, success: false, error: 'source_table no permitida' }
  }

  const userEmail = (user.email ?? '').toLowerCase()
  const userId = user.id
  const nowIso = new Date().toISOString()

  // Construir el patch según action
  let patch: Record<string, unknown> = {}
  switch (action) {
    case 'reclassify': {
      if (!meta.projectIdCol) {
        return { ...item, success: false, error: `tabla ${item.source_table} no soporta reclassify (sin project_id)` }
      }
      patch = {
        project_id: project_id ?? null,
        reviewed_by: meta.reviewedByIsText ? userEmail : userId,
        reviewed_at: nowIso,
      }
      break
    }
    case 'set-party': {
      if (!meta.partyCol) {
        return { ...item, success: false, error: `tabla ${item.source_table} no soporta set-party` }
      }
      patch = {
        [meta.partyCol]: party_id ?? null,
        reviewed_by: meta.reviewedByIsText ? userEmail : userId,
        reviewed_at: nowIso,
      }
      break
    }
    case 'confirm': {
      patch = {
        review_status: 'confirmado',
        reviewed_at: nowIso,
        reviewed_by: meta.reviewedByIsText ? userEmail : userId,
      }
      if (meta.needsReviewCol) patch.needs_review = false
      break
    }
    case 'reject': {
      patch = {
        review_status: 'rechazado',
        reviewed_at: nowIso,
        reviewed_by: meta.reviewedByIsText ? userEmail : userId,
      }
      break
    }
    case 'trash': {
      patch = { deleted_at: nowIso }
      break
    }
    case 'restore': {
      patch = { deleted_at: null }
      break
    }
  }

  // UPDATE con guard de company_id para defensa en profundidad (IDOR)
  let query = supabase
    .from(item.source_table)
    .update(patch, { count: 'exact' })
    .eq('id', item.source_id)
    .eq('company_id', companyId)

  // Para trash debe estar activo; para restore debe estar en papelera.
  // Para el resto NO restringimos por deleted_at — el caller puede querer
  // confirmar también docs ya en papelera si los lista.
  if (action === 'trash') {
    query = query.is('deleted_at', null)
  } else if (action === 'restore') {
    query = query.not('deleted_at', 'is', null)
  }

  const { error, count } = await query
  if (error) {
    console.error(
      `[bulk applyItem] UPDATE ${item.source_table} ${item.source_id} action=${action}:`,
      error.message, error.details, error.hint, error.code,
    )
    return { ...item, success: false, error: 'Error al actualizar' }
  }
  if ((count ?? 0) === 0) {
    return { ...item, success: false, error: 'No encontrado o no aplicable' }
  }
  return { ...item, success: true }
}

/* ─── Audit log batch ──────────────────────────────────────────────────── */

async function auditLogBatch(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  userEmail: string,
  action: BulkAction,
  successful: ItemResult[],
  ip: string,
): Promise<void> {
  if (successful.length === 0) return
  const actionCode = `bulk_${action.replace('-', '_')}` // bulk_set_party
  const rows = successful.map((it) => ({
    user_email: userEmail,
    action: actionCode,
    table_name: it.source_table,
    record_id: it.source_id,
    ip,
  }))
  const { error } = await supabase.from('admin_audit_log').insert(rows)
  if (error) {
    console.error('[bulk auditLogBatch] insert error:', error.message, error.details, error.hint)
  }
}

/* ─── POST handler ─────────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Resolver company activa
  let companyId: string | null
  try {
    companyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Forbidden company' },
      { status: 403 },
    )
  }
  if (!companyId) {
    const ctx = getCompanyContextFromUser(user)
    if (!ctx || !ctx.active_company_id) {
      return NextResponse.json({ error: 'Sin empresa activa' }, { status: 400 })
    }
    companyId = ctx.active_company_id
  }

  let raw: Record<string, unknown>
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const parsed = await parseBody(raw, supabase, companyId)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }
  const { action, items, project_id, party_id } = parsed

  // Procesar items secuencialmente (no en paralelo — evita race conditions
  // sobre la misma fila y simplifica el rate limit hacia Postgres).
  const results: ItemResult[] = []
  for (const item of items) {
    try {
      const r = await applyItem(supabase, item, action, user, companyId, project_id, party_id)
      results.push(r)
    } catch (e) {
      console.error('[bulk applyItem] unexpected:', e instanceof Error ? e.message : String(e), item)
      results.push({ ...item, success: false, error: 'Excepción interna' })
    }
  }

  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  // Audit log batch (1 fila por item exitoso)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  await auditLogBatch(supabase, user.email ?? user.id, action, successful, ip)

  return NextResponse.json({
    ok: failed.length === 0,
    results,
    total_success: successful.length,
    total_failed: failed.length,
  })
}
