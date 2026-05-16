/**
 * GET  /api/portal/trabajador/[token]/ausencias
 *      Lista ausencias del trabajador (solicitadas + aprobadas + rechazadas).
 *
 * POST /api/portal/trabajador/[token]/ausencias
 *      Body: { tipo, fecha_inicio, fecha_fin, motivo_detalle?, horas_total?,
 *              justificante_attachment_id? }
 *      Crea una solicitud (status='pending'). Para baja_medica, justificante recomendado.
 *
 * Aislamiento: NO usa Supabase Auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { notifyAdmins } from '@/lib/admin-notify'
import { enforce, getClientIp } from '@/lib/rate-limit-portal'

const ALLOWED_TIPOS = [
  'vacaciones',
  'baja_medica',
  'permiso_retribuido',
  'asuntos_propios',
  'banco_horas',
]

async function validateToken(supabase: ReturnType<typeof createAdminSupabaseClient>, token: string) {
  const { data, error } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (error || !data?.valid) return null
  return {
    employeeId: data.employee_id as string,
    companyId: data.company_id as string,
    nombre: data.employee_nombre as string | null,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const validation = await validateToken(supabase, token)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  const { data, error } = await supabase
    .from('worker_absences')
    .select(
      `id, tipo, motivo_detalle, fecha_inicio, fecha_fin, dias_total, horas_total,
       solicitado_at, status, decided_at, decision_notes, justificante_attachment_id,
       cancellation_requested_at, cancellation_requested_motivo, cancellation_decided_at, cancellation_decision`,
    )
    .eq('employee_id', validation.employeeId)
    .is('deleted_at', null)
    .order('fecha_inicio', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date().toISOString().slice(0, 10)
  const anio = new Date().getFullYear()

  const { data: vacationSummary } = await supabase.rpc('get_vacation_summary', {
    p_employee_id: validation.employeeId,
    p_anio: anio,
  })

  return NextResponse.json({
    rows: data ?? [],
    today,
    vacation_summary: vacationSummary ?? null,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  // Rate limit: máx 10 solicitudes ausencia/min/IP+token (legítimo: 1-2 al mes)
  const rl = enforce({
    category: 'ausencia-write',
    max: 10,
    windowMs: 60_000,
    key: `${getClientIp(request)}|${token.slice(0, 8)}`,
  })
  if (rl) return rl

  const supabase = createAdminSupabaseClient()
  const validation = await validateToken(supabase, token)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  let body: {
    tipo?: string
    motivo_detalle?: string
    fecha_inicio?: string
    fecha_fin?: string
    horas_total?: number
    justificante_attachment_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.tipo || !ALLOWED_TIPOS.includes(body.tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }
  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json({ error: 'fecha_inicio y fecha_fin requeridas' }, { status: 400 })
  }
  // Audit 16/05: validar formato YYYY-MM-DD estricto. Antes solo presence check
  // → strings malformadas slipped through ("hoy", "31/12/2025") generaban
  // errores SQL downstream confusos al cliente.
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
  if (!DATE_REGEX.test(body.fecha_inicio) || !DATE_REGEX.test(body.fecha_fin)) {
    return NextResponse.json({ error: 'Fechas deben tener formato YYYY-MM-DD' }, { status: 400 })
  }
  if (body.fecha_fin < body.fecha_inicio) {
    return NextResponse.json({ error: 'fecha_fin debe ser >= fecha_inicio' }, { status: 400 })
  }

  // Validar attachment si se proporciona
  if (body.justificante_attachment_id) {
    const { data: att } = await supabase
      .from('worker_attachments')
      .select('id')
      .eq('id', body.justificante_attachment_id)
      .eq('employee_id', validation.employeeId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!att) {
      return NextResponse.json({ error: 'Justificante no válido' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('worker_absences')
    .insert({
      company_id: validation.companyId,
      employee_id: validation.employeeId,
      tipo: body.tipo,
      motivo_detalle: body.motivo_detalle ?? null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin: body.fecha_fin,
      horas_total: body.horas_total ?? null,
      justificante_attachment_id: body.justificante_attachment_id ?? null,
      solicitado_por: `portal:${validation.nombre ?? validation.employeeId}`,
      solicitud_fuente: 'portal',
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar admins (banner + email opcional via Resend + push opcional). No bloquea
  // la respuesta: si la notificación falla, el trabajador igual recibe success.
  const TIPO_LABELS: Record<string, string> = {
    vacaciones: 'vacaciones',
    baja_medica: 'baja médica',
    permiso_retribuido: 'permiso retribuido',
    asuntos_propios: 'asuntos propios',
    banco_horas: 'banco de horas',
  }
  const tipoLabel = TIPO_LABELS[body.tipo as string] ?? body.tipo
  const dias = data.dias_total ?? 1
  notifyAdmins({
    severity: 'warning',
    title: `${validation.nombre ?? 'Trabajador'} solicita ${tipoLabel}`,
    message:
      `${validation.nombre ?? validation.employeeId} ha solicitado ${tipoLabel} del ` +
      `${body.fecha_inicio} al ${body.fecha_fin} (${dias} día${dias === 1 ? '' : 's'}).` +
      (body.motivo_detalle ? `\nMotivo: ${body.motivo_detalle}` : '') +
      '\nApruébalo o recházalo en el panel.',
    source: 'portal_trabajador',
    dedupKey: `absence:${data.id}`,
    actionUrl: '/admin/personal/ausencias',
    actionLabel: 'Revisar solicitud',
    metadata: {
      absence_id: data.id,
      employee_id: validation.employeeId,
      tipo: body.tipo,
      fecha_inicio: body.fecha_inicio,
      fecha_fin: body.fecha_fin,
      dias_total: dias,
    },
  }).catch((e) => {
    console.warn('[ausencias] notifyAdmins failed:', e)
  })

  return NextResponse.json({ ok: true, row: data })
}

/**
 * PATCH /api/portal/trabajador/[token]/ausencias
 *   Body: { id, action: 'cancel' | 'request_cancellation' | 'cancel_request', motivo? }
 *
 * Acciones:
 *   - cancel: solo permitido si status='pending' (solicitud aún no aprobada).
 *     El trabajador cancela su propia solicitud directamente → status='cancelled'.
 *   - request_cancellation: solo si status='approved'. El trabajador solicita
 *     cancelar una ausencia ya aprobada → set cancellation_requested_at + motivo.
 *     El admin la decide después.
 *   - cancel_request: trabajador retira una petición de cancelación pendiente
 *     de aprobar (resetea los flags si admin aún no ha decidido).
 *
 * Aislamiento: NO usa Supabase Auth. Token + ownership (employee_id matching).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  // Rate limit
  const rl = enforce({
    category: 'ausencia-patch',
    max: 20,
    windowMs: 60_000,
    key: `${getClientIp(request)}|${token.slice(0, 8)}`,
  })
  if (rl) return rl

  const supabase = createAdminSupabaseClient()
  const validation = await validateToken(supabase, token)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  let body: { id?: string; action?: string; motivo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const id = (body.id ?? '').trim()
  const action = body.action
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (!['cancel', 'request_cancellation', 'cancel_request'].includes(action ?? '')) {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  }

  // Cargar ausencia + validar ownership
  const { data: absence } = await supabase
    .from('worker_absences')
    .select(
      'id, status, tipo, fecha_inicio, fecha_fin, dias_total, employee_id, cancellation_requested_at, cancellation_decided_at',
    )
    .eq('id', id)
    .eq('employee_id', validation.employeeId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!absence) return NextResponse.json({ error: 'Ausencia no encontrada' }, { status: 404 })

  const nowIso = new Date().toISOString()
  const who = `portal:${validation.nombre ?? validation.employeeId}`

  if (action === 'cancel') {
    if (absence.status !== 'pending') {
      return NextResponse.json(
        { error: 'Solo puedes cancelar directamente las solicitudes pendientes. Para una aprobada, pide cancelación al admin.' },
        { status: 400 },
      )
    }
    const { error } = await supabase
      .from('worker_absences')
      .update({
        status: 'cancelled',
        decided_at: nowIso,
        decided_by_email: who,
        decision_notes: body.motivo?.trim() || 'Cancelada por el trabajador (pendiente)',
        updated_at: nowIso,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-dismiss notif si estaba activa
    try {
      const { dismissNotificationByDedup } = await import('@/lib/admin-notify')
      await dismissNotificationByDedup('portal_trabajador', `absence:${id}`, who)
    } catch {
      /* silent */
    }
    return NextResponse.json({ ok: true, action: 'cancelled' })
  }

  if (action === 'request_cancellation') {
    if (absence.status !== 'approved') {
      return NextResponse.json(
        { error: 'Solo se puede pedir cancelación de una ausencia ya aprobada.' },
        { status: 400 },
      )
    }
    if (absence.cancellation_requested_at && !absence.cancellation_decided_at) {
      return NextResponse.json({ error: 'Ya tienes una petición de cancelación pendiente.' }, { status: 400 })
    }
    const { error } = await supabase
      .from('worker_absences')
      .update({
        cancellation_requested_at: nowIso,
        cancellation_requested_motivo: body.motivo?.trim() || null,
        cancellation_decided_at: null,
        cancellation_decided_by_email: null,
        cancellation_decision: null,
        updated_at: nowIso,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notificar admins de la nueva petición de cancelación
    try {
      const { notifyAdmins } = await import('@/lib/admin-notify')
      const dias = absence.dias_total ?? 1
      notifyAdmins({
        severity: 'warning',
        title: `${validation.nombre ?? 'Trabajador'} pide cancelar su ${absence.tipo}`,
        message:
          `Solicitó cancelar la ausencia del ${absence.fecha_inicio} al ${absence.fecha_fin} ` +
          `(${dias} día${dias === 1 ? '' : 's'}).` +
          (body.motivo?.trim() ? `\nMotivo: ${body.motivo.trim()}` : '') +
          '\nAprueba o rechaza la cancelación en el panel.',
        source: 'portal_trabajador',
        dedupKey: `absence_cancel:${id}`,
        actionUrl: '/admin/personal/ausencias',
        actionLabel: 'Revisar',
        metadata: { absence_id: id, employee_id: validation.employeeId, kind: 'cancellation_request' },
      }).catch(() => {})
    } catch { /* silent */ }

    return NextResponse.json({ ok: true, action: 'cancellation_requested' })
  }

  // action === 'cancel_request'
  if (!absence.cancellation_requested_at) {
    return NextResponse.json({ error: 'No hay petición de cancelación que retirar.' }, { status: 400 })
  }
  if (absence.cancellation_decided_at) {
    return NextResponse.json({ error: 'El admin ya decidió, no se puede retirar.' }, { status: 400 })
  }
  const { error } = await supabase
    .from('worker_absences')
    .update({
      cancellation_requested_at: null,
      cancellation_requested_motivo: null,
      updated_at: nowIso,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const { dismissNotificationByDedup } = await import('@/lib/admin-notify')
    await dismissNotificationByDedup('portal_trabajador', `absence_cancel:${id}`, who)
  } catch { /* silent */ }

  return NextResponse.json({ ok: true, action: 'request_withdrawn' })
}

export const dynamic = 'force-dynamic'
