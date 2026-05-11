/**
 * Ficha trabajador — pantalla todo-en-uno para gestionar UN empleado.
 *
 * David: 'el apartado de administración para ver lo que hacen trabajadores
 * es confuso, debería ser vista persona-céntrica con ficha trabajador y tabs'.
 *
 * Pestañas: Datos · Partes (con ubicación) · Banco horas · Ausencias · Tickets · Gastos · Portal/PIN
 *
 * Sustituye al patrón de "ir saltando entre 6 secciones". Todo se carga en
 * paralelo (Promise.all) y se pinta en el cliente con tabs.
 */

import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import WorkerDetailView from './WorkerDetailView'

type Params = { params: Promise<{ id: string }> }

export default async function WorkerDetailPage({ params }: Params) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const { id } = await params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // Datos personales (validamos que pertenece a la company activa)
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!employee) notFound()

  // Ventana 60 días por defecto para histórico
  const today = new Date()
  const desdeIso = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 10)
  const todayIso = today.toISOString().slice(0, 10)

  const [
    timeRecordsRes,
    overtimeBalanceRes,
    redemptionsRes,
    absencesRes,
    attachmentsRes,
    expensesRes,
    portalRes,
    projectsRes,
    vacationSummaryRes,
  ] = await Promise.all([
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, hora_entrada, hora_salida,
         horas_ordinarias, horas_extra, horas_nocturnas, horas_extra_modo,
         observaciones, fuente, worker_signed_at,
         device_geo_lat, device_geo_lng, device_geo_accuracy_m,
         geofence_status, geofence_distance_m,
         entrada_geo_lat, entrada_geo_lng, entrada_geo_accuracy_m, entrada_geofence_status,
         salida_geo_lat, salida_geo_lng, salida_geo_accuracy_m, salida_geofence_status,
         project:project_id (id, code, name)`,
      )
      .eq('employee_id', id)
      .gte('fecha', desdeIso)
      .lte('fecha', todayIso)
      .is('deleted_at', null)
      .order('fecha', { ascending: false }),

    supabase.rpc('get_worker_overtime_balance', { p_employee_id: id }),

    supabase
      .from('worker_overtime_redemptions')
      .select('id, fecha, horas_descontadas, motivo, created_at, created_by_email')
      .eq('employee_id', id)
      .is('deleted_at', null)
      .order('fecha', { ascending: false })
      .limit(50),

    supabase
      .from('worker_absences')
      .select(
        `id, tipo, motivo_detalle, fecha_inicio, fecha_fin, dias_total, horas_total,
         solicitado_at, solicitud_fuente, status, decided_at, decided_by_email, decision_notes,
         cancellation_requested_at, cancellation_requested_motivo, cancellation_decision`,
      )
      .eq('employee_id', id)
      .is('deleted_at', null)
      .order('fecha_inicio', { ascending: false })
      .limit(50),

    supabase
      .from('worker_attachments')
      .select(
        `id, storage_path, storage_bucket, mime_type, original_filename, doc_type,
         status, worker_notas, created_at, reviewed_at, reviewer_action,
         project:project_id (code, name)`,
      )
      .eq('employee_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('worker_expense_items')
      .select(
        `id, fecha, tipo, medio_pago, project_id, importe, km_recorridos, km_origen, km_destino,
         material_descripcion, material_cantidad, observaciones, status, reviewed_at, created_at,
         project:project_id (code, name)`,
      )
      .eq('employee_id', id)
      .gte('fecha', desdeIso)
      .is('deleted_at', null)
      .order('fecha', { ascending: false })
      .limit(50),

    supabase
      .from('worker_portal_access')
      .select(
        'id, token, expires_at, revoked_at, revoked_reason, last_used_at, last_used_ip, uses_count, pin_set_at, pin_locked_until, pin_attempts, created_at',
      )
      .eq('employee_id', id)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('projects')
      .select('id, code, name, status')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .not('status', 'in', '(cancelado)')
      .order('code', { ascending: false })
      .limit(100),

    supabase.rpc('get_vacation_summary', {
      p_employee_id: id,
      p_anio: new Date().getFullYear(),
    }),
  ])

  // Generar signed URLs para los attachments (best-effort)
  const attachments = await Promise.all(
    (attachmentsRes.data ?? []).map(async (a) => {
      try {
        const { data: signed } = await supabase.storage
          .from(a.storage_bucket || 'worker-receipts')
          .createSignedUrl(a.storage_path, 3600)
        return { ...a, preview_url: signed?.signedUrl ?? null }
      } catch {
        return { ...a, preview_url: null }
      }
    }),
  )

  return (
    <WorkerDetailView
      employee={employee}
      timeRecords={timeRecordsRes.data ?? []}
      overtimeBalance={overtimeBalanceRes.data ?? null}
      redemptions={redemptionsRes.data ?? []}
      absences={absencesRes.data ?? []}
      attachments={attachments}
      expenses={expensesRes.data ?? []}
      portalAccess={portalRes.data ?? []}
      projects={projectsRes.data ?? []}
      vacationSummary={vacationSummaryRes.data ?? null}
      desde={desdeIso}
      hasta={todayIso}
    />
  )
}
