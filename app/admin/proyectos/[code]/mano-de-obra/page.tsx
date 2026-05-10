import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import LaborCostsView from './LaborCostsView'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function ProjectLaborCostsPage({ params }: PageProps) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const { code } = await params
  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, code, descripcion, status, company_id')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!project) notFound()

  const { data: laborCosts } = await supabase
    .from('project_labor_costs')
    .select(
      `id, anio, mes, horas_ordinarias, horas_extra, horas_nocturnas, horas_total,
       coste_hora_empresa, coste_imputado_total, source, payroll_id, calculado_at,
       employee:employee_id (id, nombre, apellidos, nif)`,
    )
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })

  const { data: timeRecords } = await supabase
    .from('time_records')
    .select(
      `id, fecha, employee_id, horas_ordinarias, horas_extra, horas_nocturnas, observaciones,
       fuente, employee:employee_id (id, nombre, apellidos)`,
    )
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(200)

  return (
    <LaborCostsView
      project={project}
      laborCosts={laborCosts ?? []}
      timeRecords={timeRecords ?? []}
    />
  )
}
