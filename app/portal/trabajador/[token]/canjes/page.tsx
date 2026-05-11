import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import CanjesView from './CanjesView'

type Params = { params: Promise<{ token: string }> }
const SESSION_COOKIE = 'cathedral_worker_session'

export default async function CanjesPage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token, p_ip: null, p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const cookieStore = await cookies()
  if (cookieStore.get(SESSION_COOKIE)?.value !== token) notFound()

  const employeeId: string = validation.employee_id

  const [{ data: redemptions }, { data: balance }] = await Promise.all([
    supabase
      .from('worker_overtime_redemptions')
      .select('id, fecha, horas_descontadas, motivo, modo_canje, status, requested_at, requested_motivo, decided_at, decision_notes, created_at')
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('get_worker_overtime_balance', { p_employee_id: employeeId }),
  ])

  return (
    <CanjesView
      token={token}
      employeeName={validation.employee_nombre ?? ''}
      initialRedemptions={redemptions ?? []}
      initialBalance={balance ?? null}
    />
  )
}
