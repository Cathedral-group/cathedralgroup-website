import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import FichajeView from './FichajeView'

type Params = { params: Promise<{ token: string }> }
const SESSION_COOKIE = 'cathedral_worker_session'

export default async function FichajePage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  // Misma protección PIN que pantalla principal
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value
  if (sessionToken !== token) {
    notFound() // sin sesión PIN → 404 (oculta existencia, fuerza login desde home)
  }

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  const today = new Date().toISOString().slice(0, 10)
  const sieteAtras = new Date()
  sieteAtras.setDate(sieteAtras.getDate() - 6)
  const desde = sieteAtras.toISOString().slice(0, 10)

  const [projectsRes, partesRes, assignmentsRes, statsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('code', { ascending: false })
      .limit(50),
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas,
         horas_extra_modo, observaciones, fuente, worker_signed_at, hora_entrada, hora_salida,
         foto_avance_path, foto_avance_bucket,
         project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .lte('fecha', today)
      .is('deleted_at', null)
      .order('fecha', { ascending: false }),
    supabase
      .from('worker_assignments')
      .select(
        `id, fecha, project_id, jornada_esperada_horas, notas,
         project:project_id (id, code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .lte('fecha', today)
      .is('deleted_at', null),
    supabase.rpc('get_worker_dashboard_stats', { p_employee_id: employeeId }),
  ])

  return (
    <FichajeView
      token={token}
      employeeName={validation.employee_nombre ?? ''}
      today={today}
      projects={projectsRes.data ?? []}
      partes={partesRes.data ?? []}
      assignments={assignmentsRes.data ?? []}
      jornadaEsperadaHoy={Number(statsRes.data?.jornada_esperada_hoy ?? 9)}
    />
  )
}
