import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ClientsView from './ClientsView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function ClientesPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  // F3 completo: filtrar por empresa activa
  const activeCompanyId = await getActiveCompanyForPage()

  const supabase = createAdminSupabaseClient()

  const [clientsRes, projectsRes, invoices, communicationsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, code, name, client_id, status').eq('company_id', activeCompanyId).is('deleted_at', null),
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('id, number, concept, direction, amount_base, vat_amount, amount_total, payment_status, proyecto_code, project_id, issue_date')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
    ),
    supabase.from('communications').select('*').eq('company_id', activeCompanyId).eq('entity_type', 'client').order('date', { ascending: false }),
  ])

  return (
    <ClientsView
      clients={clientsRes.data || []}
      projects={projectsRes.data || []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={invoices as any}
      communications={communicationsRes.data || []}
    />
  )
}
