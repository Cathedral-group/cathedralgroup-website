import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import DietarioView from './DietarioView'

export default async function DietarioPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const today = new Date()
  const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const finMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [employeesRes, projectsRes, timeRecordsRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, nombre, nif')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('nombre'),
    supabase
      .from('projects')
      .select('id, code, name, description, status')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('code', { ascending: false }),
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, employee_id, horas_ordinarias, horas_extra, horas_nocturnas,
         observaciones, fuente, registrado_por,
         employee:employee_id (id, nombre),
         project:project_id (id, code, name)`,
      )
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false })
      .limit(500),
  ])

  return (
    <DietarioView
      employees={employeesRes.data ?? []}
      projects={projectsRes.data ?? []}
      timeRecords={timeRecordsRes.data ?? []}
      defaultDesde={inicioMes}
      defaultHasta={finMes}
    />
  )
}
