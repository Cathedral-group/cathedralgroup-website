import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import PortalTrabajadorView from './PortalTrabajadorView'

type Params = { params: Promise<{ token: string }> }

export default async function PortalTrabajadorPage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

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
  sieteAtras.setDate(sieteAtras.getDate() - 7)
  const desde = sieteAtras.toISOString().slice(0, 10)

  const [projectsRes, parteHoyRes, ultimosDiasRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name, description, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('code', { ascending: false })
      .limit(50),
    supabase
      .from('time_records')
      .select(
        'id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas, observaciones, fuente',
      )
      .eq('employee_id', employeeId)
      .eq('fecha', today)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas, observaciones,
         project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .is('deleted_at', null)
      .order('fecha', { ascending: false }),
  ])

  return (
    <PortalTrabajadorView
      token={token}
      employee={{
        nombre: validation.employee_nombre ?? '',
      }}
      today={today}
      projects={projectsRes.data ?? []}
      parteHoy={parteHoyRes.data ?? null}
      ultimosDias={ultimosDiasRes.data ?? []}
    />
  )
}
