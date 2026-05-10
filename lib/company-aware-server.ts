/**
 * lib/company-aware-server.ts — F3 completo MVP
 *
 * Helpers para server components y server actions que necesitan filtrar por
 * empresa activa. Lee el JWT app_metadata o el header X-Active-Company-Id
 * (ambos opcionales — fallback Cathedral SL DEFAULT).
 *
 * Patrón uso en page server component:
 * ```ts
 * import { getActiveCompanyForPage } from '@/lib/company-aware-server'
 *
 * export default async function MiPage() {
 *   const activeCompanyId = await getActiveCompanyForPage()
 *   const supabase = createAdminSupabaseClient()
 *   const { data } = await supabase.from('invoices')
 *     .select('*')
 *     .eq('company_id', activeCompanyId)
 *     .is('deleted_at', null)
 *   ...
 * }
 * ```
 *
 * Hoy con 1 SL (Cathedral) → siempre devuelve Cathedral UUID. F3 completo
 * empieza a discriminar cuando aparezca 2ª SL en companies + el usuario
 * cambie active_company_id desde el selector.
 */

import { headers } from 'next/headers'
import { createServerSupabaseClient } from './supabase-server'
import {
  getActiveCompanyId,
  CATHEDRAL_INVESTMENT_SL_ID,
  type CompanyId,
} from './company-context'

/**
 * Devuelve la company_id activa del usuario logueado en el page server component.
 * Resolución en orden:
 *   1. Header `X-Active-Company-Id` (si lo envía un cliente que ya cambió empresa)
 *   2. JWT app_metadata.active_company_id
 *   3. Primera company de app_metadata.companies[]
 *   4. Fallback: Cathedral House Investment SL (UUID fija F1)
 *
 * El fallback existe para asegurar que el sistema NUNCA queda sin company_id
 * activa — el peor caso es "ver datos Cathedral" que es exactamente el
 * comportamiento legacy.
 */
export async function getActiveCompanyForPage(): Promise<CompanyId> {
  try {
    const authClient = await createServerSupabaseClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    const reqHeaders = await headers()
    return getActiveCompanyId(user, reqHeaders) ?? CATHEDRAL_INVESTMENT_SL_ID
  } catch {
    return CATHEDRAL_INVESTMENT_SL_ID
  }
}

/**
 * Variante que devuelve también la lista completa de companies del usuario
 * (útil para mostrar selector en topbar o para queries de consolidado).
 */
export async function getCompanyContextForPage(): Promise<{
  active: CompanyId
  available: CompanyId[]
}> {
  try {
    const authClient = await createServerSupabaseClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    const reqHeaders = await headers()
    const active = getActiveCompanyId(user, reqHeaders) ?? CATHEDRAL_INVESTMENT_SL_ID
    const available =
      (user?.app_metadata?.companies as string[] | undefined) ?? [active]
    return { active, available }
  } catch {
    return { active: CATHEDRAL_INVESTMENT_SL_ID, available: [CATHEDRAL_INVESTMENT_SL_ID] }
  }
}
