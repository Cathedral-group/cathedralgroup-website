import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import PortalTrabajadorView from './PortalTrabajadorView'
import PinGate from './PinGate'

type Params = { params: Promise<{ token: string }> }

const CURRENT_CONSENT_VERSION = 'v1-2026-05'
const SESSION_COOKIE = 'cathedral_worker_session'

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

  // Comprobar cookie de sesión PIN. Si no hay o no coincide con el token, mostrar PinGate.
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value
  if (sessionToken !== token) {
    // Verificar si el PIN actual es default (mostrar aviso en PinGate)
    const { data: tokenInfo } = await supabase
      .from('worker_portal_access')
      .select('pin_set_at')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()

    return (
      <PinGate
        token={token}
        employeeName={validation.employee_nombre ?? ''}
        pinIsDefault={tokenInfo?.pin_set_at == null}
      />
    )
  }

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  const today = new Date().toISOString().slice(0, 10)
  const sieteAtras = new Date()
  sieteAtras.setDate(sieteAtras.getDate() - 7)
  const desde = sieteAtras.toISOString().slice(0, 10)

  const [
    projectsRes,
    parteHoyRes,
    ultimosDiasRes,
    assignmentRes,
    statsRes,
    tokenInfoRes,
    overtimeBalanceRes,
  ] = await Promise.all([
    // No exponer al trabajador proyectos cancelados/completados/finalizados:
    // ahí no debería fichar (info-disclosure + datos irrelevantes en el selector).
    supabase
      .from('projects')
      .select('id, code, name, description, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('status', 'in', '(cancelado,completado,finalizado)')
      .order('code', { ascending: false })
      .limit(50),
    supabase
      .from('time_records')
      .select(
        'id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas, horas_extra_modo, observaciones, fuente, worker_signed_at, hora_entrada, hora_salida',
      )
      .eq('employee_id', employeeId)
      .eq('fecha', today)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas, horas_extra_modo, observaciones,
         worker_signed_at, project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .is('deleted_at', null)
      .order('fecha', { ascending: false }),
    // Cargar asignaciones de los últimos 7 días (para que al cambiar día en selector
    // se pre-rellene el proyecto correcto)
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
    supabase
      .from('worker_portal_access')
      .select('consent_accepted_at, consent_text_version')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle(),
    supabase.rpc('get_worker_overtime_balance', { p_employee_id: employeeId }),
  ])

  const consent = {
    accepted_at: tokenInfoRes.data?.consent_accepted_at ?? null,
    text_version: tokenInfoRes.data?.consent_text_version ?? null,
    current_version: CURRENT_CONSENT_VERSION,
    needs_acceptance:
      !tokenInfoRes.data?.consent_accepted_at ||
      tokenInfoRes.data.consent_text_version !== CURRENT_CONSENT_VERSION,
  }

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
      assignments={assignmentRes.data ?? []}
      stats={statsRes.data ?? null}
      overtimeBalance={overtimeBalanceRes.data ?? null}
      consent={consent}
    />
  )
}
