import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import CalendarioView from './CalendarioView'

type Params = { params: Promise<{ token: string }> }
type SP = { anio?: string; mes?: string }

export default async function CalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<SP>
}) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const sp = await searchParams
  const today = new Date()
  const anio = parseInt(sp.anio ?? String(today.getFullYear()), 10)
  const mes = parseInt(sp.mes ?? String(today.getMonth() + 1), 10)

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay = new Date(anio, mes, 0).getDate()
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [holidaysRes, assignmentsRes, absencesRes, partesRes, jornadasRes] = await Promise.all([
    supabase
      .from('holidays')
      .select('fecha, nombre, ambito')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .or(
        'ambito.eq.nacional,and(ambito.eq.autonomico,comunidad_autonoma.eq.MADRID),' +
          `and(ambito.eq.local,municipio.eq.Madrid),and(ambito.eq.convenio,comunidad_autonoma.eq.MADRID),` +
          `and(ambito.eq.no_laborable,comunidad_autonoma.eq.MADRID),and(ambito.eq.empresa,company_id.eq.${companyId})`,
      ),
    supabase
      .from('worker_assignments')
      .select(
        `id, fecha, project_id, jornada_esperada_horas, notas,
         project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null),
    supabase
      .from('worker_absences')
      .select('id, tipo, motivo_detalle, fecha_inicio, fecha_fin, status')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .lte('fecha_inicio', hasta)
      .gte('fecha_fin', desde)
      .is('deleted_at', null),
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas,
         observaciones, worker_signed_at, project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null),
    Promise.all(
      Array.from({ length: lastDay }, (_, i) => {
        const d = `${anio}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return supabase
          .rpc('get_jornada_esperada_horas', { p_fecha: d, p_company_id: companyId })
          .then((r) => ({ fecha: d, horas: Number(r.data ?? 0) }))
      }),
    ),
  ])

  return (
    <CalendarioView
      token={token}
      anio={anio}
      mes={mes}
      lastDay={lastDay}
      holidays={holidaysRes.data ?? []}
      assignments={assignmentsRes.data ?? []}
      absences={absencesRes.data ?? []}
      partes={partesRes.data ?? []}
      jornadas={jornadasRes}
    />
  )
}
