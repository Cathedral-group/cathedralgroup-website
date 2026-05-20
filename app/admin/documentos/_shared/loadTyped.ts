import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import { redirect } from 'next/navigation'
import type { TypedDocsConfig } from './TypedDocsConfig'

/**
 * Helper compartido por los 8 pages tipados.
 *
 * - Auth con allow-list + AAL2 (idéntico al patrón de /admin/documentos/page.tsx).
 * - Filtra por company_id activa (multi-empresa F3).
 * - Devuelve la primera página (50 rows) ordenada según defaultSort.
 *
 * Lanza `redirect('/admin/login')` si auth falla.
 */
export async function loadTypedInitialData(config: TypedDocsConfig): Promise<{
  initialData: Array<Record<string, unknown>>
  activeCompanyId: string
  total: number
}> {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user?.email) redirect('/admin/login')
  if (!isAdminEmail(userData.user.email)) redirect('/admin/login')

  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const PAGE_SIZE = 50
  const sortCol = config.defaultSort?.column ?? 'created_at'
  const sortAsc = (config.defaultSort?.order ?? 'desc') === 'asc'

  const [pageRes, countRes] = await Promise.all([
    supabase
      .from(config.table)
      .select('*')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order(sortCol, { ascending: sortAsc, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from(config.table)
      .select('*', { count: 'exact', head: true })
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null),
  ])

  return {
    initialData: (pageRes.data ?? []) as Array<Record<string, unknown>>,
    activeCompanyId,
    total: countRes.count ?? 0,
  }
}
