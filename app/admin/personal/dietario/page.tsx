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
         observaciones, fuente, registrado_por, foto_avance_path, foto_avance_bucket,
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

  // Generar signed URLs para fotos avance (paralelo)
  const records = timeRecordsRes.data ?? []
  const recordsWithFoto = await Promise.all(
    records.map(async (r) => {
      if (!r.foto_avance_path) return { ...r, foto_avance_url: null }
      const bucket = r.foto_avance_bucket ?? 'worker-receipts'
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(r.foto_avance_path, 3600)
      return { ...r, foto_avance_url: signed?.signedUrl ?? null }
    }),
  )

  return (
    <DietarioView
      employees={employeesRes.data ?? []}
      projects={projectsRes.data ?? []}
      timeRecords={recordsWithFoto}
      defaultDesde={inicioMes}
      defaultHasta={finMes}
    />
  )
}
