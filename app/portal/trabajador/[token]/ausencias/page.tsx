import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import AusenciasView from './AusenciasView'

type Params = { params: Promise<{ token: string }> }

export default async function AusenciasPage({ params }: Params) {
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
  const anio = new Date().getFullYear()

  const [absencesRes, vacationRes] = await Promise.all([
    supabase
      .from('worker_absences')
      .select(
        `id, tipo, motivo_detalle, fecha_inicio, fecha_fin, dias_total, horas_total,
         solicitado_at, status, decided_at, decision_notes, justificante_attachment_id`,
      )
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order('fecha_inicio', { ascending: false })
      .limit(50),
    supabase.rpc('get_vacation_summary', {
      p_employee_id: employeeId,
      p_anio: anio,
    }),
  ])

  return (
    <AusenciasView
      token={token}
      initialAbsences={absencesRes.data ?? []}
      vacationSummary={vacationRes.data ?? null}
    />
  )
}
