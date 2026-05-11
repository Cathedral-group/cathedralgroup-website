/**
 * Solicitudes de canje de horas extras del trabajador.
 *
 * GET /api/portal/trabajador/[token]/canjes
 *   Lista los canjes del trabajador (pending + approved + rejected).
 *
 * POST /api/portal/trabajador/[token]/canjes
 *   Body: { modo_canje, fecha, horas?, motivo? }
 *   Crea una solicitud status='pending'. Admin la decide después.
 *
 * PATCH /api/portal/trabajador/[token]/canjes
 *   Body: { id, action: 'cancel' }
 *   El trabajador retira su solicitud si aún no está decidida.
 *
 * Aislamiento: NO usa Supabase Auth. Solo token UUID + ownership.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { enforce, getClientIp } from '@/lib/rate-limit-portal'

const ALLOWED_MODOS = ['descanso_dia', 'descanso_medio_dia', 'descanso_horas', 'pago_nomina']

async function validateToken(supabase: ReturnType<typeof createAdminSupabaseClient>, token: string) {
  const { data, error } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token, p_ip: null, p_user_agent: null,
  })
  if (error || !data?.valid) return null
  return {
    employeeId: data.employee_id as string,
    companyId: data.company_id as string,
    nombre: (data.employee_nombre as string | null) ?? null,
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

  const [{ data: redemptions }, { data: balance }] = await Promise.all([
    supabase
      .from('worker_overtime_redemptions')
      .select('id, fecha, horas_descontadas, motivo, modo_canje, status, requested_at, requested_motivo, decided_at, decision_notes, created_at')
      .eq('employee_id', validation.employeeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('get_worker_overtime_balance', { p_employee_id: validation.employeeId }),
  ])

  return NextResponse.json({
    redemptions: redemptions ?? [],
    balance: balance ?? null,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const rl = enforce({
    category: 'canje-write',
    max: 10,
    windowMs: 60_000,
    key: `${getClientIp(request)}|${token.slice(0, 8)}`,
  })
  if (rl) return rl

  const supabase = createAdminSupabaseClient()
  const validation = await validateToken(supabase, token)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  let body: { modo_canje?: string; fecha?: string; horas?: number; motivo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.modo_canje || !ALLOWED_MODOS.includes(body.modo_canje)) {
    return NextResponse.json({ error: 'modo_canje inválido' }, { status: 400 })
  }
  if (!body.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
    return NextResponse.json({ error: 'fecha requerida (YYYY-MM-DD)' }, { status: 400 })
  }

  // Calcular horas automáticamente según modo
  let horas: number
  if (body.modo_canje === 'descanso_dia') horas = 8
  else if (body.modo_canje === 'descanso_medio_dia') horas = 4
  else {
    horas = Number(body.horas ?? 0)
    if (!Number.isFinite(horas) || horas <= 0 || horas > 80) {
      return NextResponse.json({ error: 'horas inválidas (>0 y <=80)' }, { status: 400 })
    }
  }

  // Verificar saldo disponible
  const { data: balance } = await supabase.rpc('get_worker_overtime_balance', {
    p_employee_id: validation.employeeId,
  })
  const disponibles = Number(balance?.horas_disponibles ?? 0)
  if (horas > disponibles) {
    return NextResponse.json(
      { error: `No tienes suficientes horas. Disponibles: ${disponibles.toFixed(2)}h (pediste ${horas}h).` },
      { status: 400 },
    )
  }

  const nowIso = new Date().toISOString()
  const requester = `portal:${validation.nombre ?? validation.employeeId}`

  const { data: created, error } = await supabase
    .from('worker_overtime_redemptions')
    .insert({
      company_id: validation.companyId,
      employee_id: validation.employeeId,
      fecha: body.fecha,
      horas_descontadas: horas,
      modo_canje: body.modo_canje,
      motivo: body.motivo?.trim() || null,
      requested_motivo: body.motivo?.trim() || null,
      requested_at: nowIso,
      requested_by: requester,
      status: 'pending',
      created_by_email: requester,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar admins
  try {
    const { notifyAdmins } = await import('@/lib/admin-notify')
    const MODO_LABELS: Record<string, string> = {
      descanso_dia: 'un día de descanso',
      descanso_medio_dia: 'medio día de descanso',
      descanso_horas: 'horas sueltas de descanso',
      pago_nomina: 'pago en nómina',
    }
    notifyAdmins({
      severity: 'warning',
      title: `${validation.nombre ?? 'Trabajador'} pide canje banco horas`,
      message:
        `Solicita ${MODO_LABELS[body.modo_canje] ?? body.modo_canje} (${horas}h) ` +
        `para el ${body.fecha}.` +
        (body.motivo?.trim() ? `\nMotivo: ${body.motivo.trim()}` : '') +
        '\nAprueba o rechaza en el banco horas del panel.',
      source: 'portal_trabajador',
      dedupKey: `canje:${created.id}`,
      actionUrl: '/admin/personal/banco-horas',
      actionLabel: 'Decidir canje',
      metadata: {
        redemption_id: created.id,
        employee_id: validation.employeeId,
        modo_canje: body.modo_canje,
        horas,
        fecha: body.fecha,
      },
    }).catch(() => {})
  } catch { /* silent */ }

  return NextResponse.json({ ok: true, row: created })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const rl = enforce({
    category: 'canje-patch',
    max: 20,
    windowMs: 60_000,
    key: `${getClientIp(request)}|${token.slice(0, 8)}`,
  })
  if (rl) return rl

  const supabase = createAdminSupabaseClient()
  const validation = await validateToken(supabase, token)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  let body: { id?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const id = (body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (body.action !== 'cancel') return NextResponse.json({ error: 'action inválida' }, { status: 400 })

  // Solo se pueden cancelar las propias que estén pending
  const { data: red } = await supabase
    .from('worker_overtime_redemptions')
    .select('id, status, employee_id')
    .eq('id', id)
    .eq('employee_id', validation.employeeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!red) return NextResponse.json({ error: 'Canje no encontrado' }, { status: 404 })
  if (red.status !== 'pending') {
    return NextResponse.json({ error: 'Solo se pueden retirar solicitudes pendientes.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('worker_overtime_redemptions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('employee_id', validation.employeeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dismiss notif si la habíamos creado
  try {
    const { dismissNotificationByDedup } = await import('@/lib/admin-notify')
    await dismissNotificationByDedup('portal_trabajador', `canje:${id}`, `portal:${validation.nombre ?? validation.employeeId}`)
  } catch { /* silent */ }

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
