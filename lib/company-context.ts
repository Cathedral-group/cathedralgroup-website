/**
 * lib/company-context.ts — Bloque 0 F3.2
 *
 * Helpers para el contexto multi-empresa Cathedral. Lee del JWT app_metadata
 * (poblado al INSERT en `company_members` via syncCompanyMetadataForUser).
 *
 * Patrón canónico Supabase: app_metadata es **server-side only** (el cliente
 * NO puede modificarlo), por tanto seguro para autorización. user_metadata
 * NO se usa para esto.
 *
 * Uso típico en endpoint:
 * ```ts
 * const user = await authCheck()  // existing AAL2 pattern
 * const ctx = getCompanyContextFromUser(user)
 * if (!ctx) return 401
 * const activeCompanyId = getActiveCompanyId(user, request.headers)
 * // queries con .eq('company_id', activeCompanyId) o .in('company_id', ctx.companies)
 * ```
 */

import type { User } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from './supabase-server'

export type CompanyId = string // UUID

export type CompanyRole =
  | 'owner'
  | 'admin'
  | 'contable'
  | 'rh'
  | 'dpo'
  | 'lectura'
  | 'operario'

export interface CompanyContext {
  companies: CompanyId[]
  active_company_id: CompanyId | null
  company_roles: Record<CompanyId, CompanyRole>
}

/**
 * Lee el contexto multi-empresa desde User.app_metadata.
 * Devuelve null si el user no tiene companies asignadas (caso onboarding pendiente).
 */
export function getCompanyContextFromUser(user: User | null): CompanyContext | null {
  if (!user?.app_metadata) return null
  const meta = user.app_metadata as Record<string, unknown>
  const companies = Array.isArray(meta.companies) ? (meta.companies as string[]) : []
  if (companies.length === 0) return null

  const active = typeof meta.active_company_id === 'string' ? meta.active_company_id : null
  const rolesRaw = (meta.company_roles ?? {}) as Record<string, string>
  const company_roles: Record<CompanyId, CompanyRole> = {}
  for (const [k, v] of Object.entries(rolesRaw)) {
    if (
      ['owner', 'admin', 'contable', 'rh', 'dpo', 'lectura', 'operario'].includes(v as string)
    ) {
      company_roles[k] = v as CompanyRole
    }
  }

  return {
    companies,
    active_company_id: active && companies.includes(active) ? active : (companies[0] ?? null),
    company_roles,
  }
}

/**
 * Verifica que el user tiene acceso a una company. Throws si no.
 * Útil para guard en endpoints que reciben company_id en path/body.
 */
export function requireCompanyAccess(user: User | null, companyId: CompanyId): void {
  const ctx = getCompanyContextFromUser(user)
  if (!ctx) {
    throw new Error('Unauthorized: usuario sin contexto multi-empresa')
  }
  if (!ctx.companies.includes(companyId)) {
    throw new Error(`Forbidden: usuario no tiene acceso a company ${companyId}`)
  }
}

/**
 * Verifica que el user tiene un rol mínimo en una company. Throws si no.
 * Jerarquía: owner > admin > contable/rh/dpo > lectura/operario.
 */
const ROLE_LEVEL: Record<CompanyRole, number> = {
  owner: 100,
  admin: 90,
  contable: 50,
  rh: 50,
  dpo: 50,
  lectura: 10,
  operario: 10,
}

export function requireCompanyRole(
  user: User | null,
  companyId: CompanyId,
  minRole: CompanyRole,
): void {
  requireCompanyAccess(user, companyId)
  const ctx = getCompanyContextFromUser(user)!
  const userRole = ctx.company_roles[companyId]
  if (!userRole) {
    throw new Error(`Forbidden: usuario sin rol en company ${companyId}`)
  }
  if (ROLE_LEVEL[userRole] < ROLE_LEVEL[minRole]) {
    throw new Error(
      `Forbidden: rol '${userRole}' insuficiente para acción que requiere '${minRole}'`,
    )
  }
}

/**
 * Devuelve la company activa: header X-Active-Company-Id si está y es válido,
 * sino el active_company_id del JWT, sino la primera de la lista.
 */
export function getActiveCompanyId(
  user: User | null,
  headers?: Headers,
): CompanyId | null {
  const ctx = getCompanyContextFromUser(user)
  if (!ctx) return null
  // UUIDs RFC 4122 son case-insensitive. JWT app_metadata.companies viene en
  // formato canónico lowercase desde Postgres. Normalizamos header igual antes
  // de comparar para evitar false-negative cuando frontend manda mixed-case.
  const headerVal = headers?.get('x-active-company-id')?.toLowerCase()
  if (headerVal && ctx.companies.includes(headerVal)) return headerVal
  return ctx.active_company_id
}

/**
 * Sincroniza el app_metadata.companies de un user desde la tabla company_members.
 * Llamar SIEMPRE tras INSERT/UPDATE/DELETE en company_members para mantener el
 * JWT al día. Si no se llama, el cliente no verá las nuevas companies hasta el
 * próximo refresh manual del token.
 *
 * Pattern: vive en lib/ porque se usa desde múltiples endpoints
 * (/api/admin/companies/[id]/members POST/DELETE).
 */
export async function syncCompanyMetadataForUser(userId: string): Promise<{
  companies: CompanyId[]
  active_company_id: CompanyId | null
  company_roles: Record<CompanyId, CompanyRole>
}> {
  const admin = createAdminSupabaseClient()

  // 1. Leer company_members activos del user
  const { data: members, error } = await admin
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .is('revoked_at', null)
  if (error) throw new Error(`syncCompanyMetadata: ${error.message}`)

  const companies: string[] = (members ?? []).map((m) => m.company_id as string)
  const company_roles: Record<string, CompanyRole> = {}
  for (const m of members ?? []) {
    company_roles[m.company_id as string] = m.role as CompanyRole
  }

  // 2. Leer app_metadata actual para preservar otras claves
  const { data: userResp, error: getErr } = await admin.auth.admin.getUserById(userId)
  if (getErr || !userResp?.user) {
    throw new Error(`syncCompanyMetadata getUser: ${getErr?.message ?? 'no user'}`)
  }
  const currentMeta = (userResp.user.app_metadata ?? {}) as Record<string, unknown>

  // Mantener active_company_id si sigue siendo válido, sino primera company
  const activeCurrent = currentMeta.active_company_id as string | undefined
  const active_company_id =
    activeCurrent && companies.includes(activeCurrent)
      ? activeCurrent
      : (companies[0] ?? null)

  // 3. Actualizar
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...currentMeta,
      companies,
      active_company_id,
      company_roles,
    },
  })
  if (updErr) throw new Error(`syncCompanyMetadata update: ${updErr.message}`)

  return {
    companies,
    active_company_id,
    company_roles: company_roles as Record<CompanyId, CompanyRole>,
  }
}

/**
 * UUID fija de Cathedral House Investment SL (insertada en F1).
 * Usar como referencia hasta que multi-empresa esté completo.
 */
export const CATHEDRAL_INVESTMENT_SL_ID: CompanyId =
  '00000000-0000-0000-0000-cca7ed1a1000'

/**
 * Tablas que NO llevan `company_id` (allowlist explícito).
 * Sincronizado con la migración 20260510141500_bloque_0_f2_company_id_alter.sql.
 *
 * Categorías:
 *   - Entidades globales del grupo (F1)
 *   - Auditoría global y logs
 *   - Catálogos compartidos por todas las SL
 *   - Sistema interno
 */
export const TABLES_WITHOUT_COMPANY_ID = new Set<string>([
  // Entidades globales (F1)
  'companies',
  'parties',
  'properties',
  'company_members',
  'party_company_relationships',
  'property_ownership_history',
  'intragroup_transactions',
  'intercompany_loans',
  // Auditoría global
  'audit_log_chain',
  'admin_audit_log',
  '_backfill_log',
  'login_attempts',
  'email_audit_attempts',
  'gdpr_processing_log',
  // Catálogos compartidos
  'fiscal_models',
  'ai_pricing_table',
  'quality_coefficients',
  'collective_agreements',
  'quote_items_catalog',
  'supplier_email_whitelist',
  'project_subfolders',
  // Sistema
  'webhook_idempotency',
  'eval_runs',
  'ai_usage_log',
  'system_notifications',
  'backup_runs',
])

/**
 * Devuelve true si la tabla tiene `company_id` (es discriminator multi-empresa).
 * F2 añadió `company_id` a 55 tablas operativas. Las del allowlist no lo tienen
 * por diseño (entidades globales, catálogos, auditoría).
 */
export function tableHasCompanyId(tableName: string): boolean {
  return !TABLES_WITHOUT_COMPANY_ID.has(tableName)
}

/**
 * Resuelve la company_id para aplicar a un request /api/db/[resource]/*.
 * Patrón "opt-in F3 core":
 *   - Si header X-Active-Company-Id presente y es uno de los del usuario → usarla
 *   - Si no, devuelve null (= comportamiento legacy: sin filtro company_id, lo
 *     que para SQL con RLS+FORCE significa que solo service_role lo verá)
 *
 * En F3 completo (post 2ª SL real), el frontend admin enviará SIEMPRE el
 * header X-Active-Company-Id. Mientras tanto, omitir = filtro Cathedral por
 * DEFAULT que viene de la migración F2.
 */
export function resolveCompanyIdForRequest(
  user: User | null,
  headers: Headers,
): CompanyId | null {
  const ctx = getCompanyContextFromUser(user)
  if (!ctx) return null
  // UUIDs case-insensitive RFC 4122 — normalizar lowercase para match consistente.
  const headerVal = headers.get('x-active-company-id')?.toLowerCase()
  if (!headerVal) return null
  if (!ctx.companies.includes(headerVal)) {
    throw new Error(
      `Forbidden: header X-Active-Company-Id=${headerVal} no es de tu grupo`,
    )
  }
  return headerVal
}
