import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import OperacionDetail from './OperacionDetail'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function OperacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const { id } = await params
  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // F3 completo: filtrar todas las queries por company activa.
  // La operación específica (id) DEBE pertenecer a la empresa activa,
  // si no notFound() (no se encuentra entre las accesibles).
  const [opRes, mortgagesRes, costsRes, projectsRes] = await Promise.all([
    supabase.from('flipping_operations').select('*').eq('id', id).eq('company_id', activeCompanyId).is('deleted_at', null).maybeSingle(),
    supabase.from('mortgages').select('*').eq('operation_id', id).eq('company_id', activeCompanyId).is('deleted_at', null),
    supabase.from('operation_costs').select('*').eq('operation_id', id).eq('company_id', activeCompanyId).is('deleted_at', null).order('date', { ascending: false }),
    supabase.from('projects').select('id, code, name').eq('company_id', activeCompanyId).is('deleted_at', null),
  ])

  if (!opRes.data) notFound()

  // Fetch invoices by project_id (main link) OR operation_id (direct link)
  const projectId = opRes.data.project_id
  const invoicesRes = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', activeCompanyId)
    .or(projectId ? `operation_id.eq.${id},project_id.eq.${projectId}` : `operation_id.eq.${id}`)
    .is('deleted_at', null)
    .order('issue_date', { ascending: false })

  return (
    <OperacionDetail
      op={opRes.data}
      mortgages={mortgagesRes.data ?? []}
      costs={costsRes.data ?? []}
      invoices={invoicesRes.data ?? []}
      projects={projectsRes.data ?? []}
    />
  )
}
