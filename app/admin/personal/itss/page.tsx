import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import ItssAdminView from './ItssAdminView'

export default async function ItssAdminPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [tokensRes, employeesRes] = await Promise.all([
    supabase
      .from('itss_access_tokens')
      .select(
        `id, inspector_nombre, inspector_dni, inspeccion_referencia,
         scope_employee_id, scope_desde, scope_hasta,
         expires_at, revoked_at, revoked_reason, created_at, created_by_email,
         last_used_at, last_used_ip, uses_count`,
      )
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('employees')
      .select('id, nombre, nif')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('nombre'),
  ])

  return (
    <ItssAdminView
      initialTokens={tokensRes.data ?? []}
      employees={employeesRes.data ?? []}
    />
  )
}
