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
       solicitado_at, status, decided_at, decision_notes, justificante_attachment_id`,
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

  // Notificar admins (banner + email opcional via Resend). No bloquea la respuesta:
  // si la notificación falla, el trabajador igual recibe success.
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

export const dynamic = 'force-dynamic'
