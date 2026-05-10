import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ProjectsView from './ProjectsView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function ProyectosPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // project_financials no tiene company_id (allowlist) — proyectos sí filtran
  const [projectsRes, clientsRes, financialsRes, invoices, phasesRes, locationsRes] = await Promise.all([
    supabase.from('projects').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').eq('company_id', activeCompanyId).is('deleted_at', null).order('name'),
    supabase.from('project_financials').select('*').eq('company_id', activeCompanyId),
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('id, number, concept, direction, amount_base, vat_amount, amount_total, payment_status, proyecto_code, project_id')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
    ),
    supabase.from('project_phases').select('*').eq('company_id', activeCompanyId).order('start_date', { ascending: true }),
    supabase.from('project_locations').select('project_id, lat, lng, radio_m, direccion').eq('company_id', activeCompanyId).is('deleted_at', null),
  ])

  return (
    <ProjectsView
      projects={projectsRes.data || []}
      clients={clientsRes.data || []}
      financials={financialsRes.data || []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={invoices as any}
      phases={phasesRes.data || []}
      locations={locationsRes.data || []}
    />
  )
}
