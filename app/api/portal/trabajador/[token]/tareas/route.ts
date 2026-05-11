/**
 * Tareas del trabajador — endpoint portal.
 *
 * GET  /api/portal/trabajador/[token]/tareas
 *   Devuelve las tareas que VEDE el trabajador:
 *   - Asignadas a él (cualquier proyecto, tipo obra_*)
 *   - Sin asignar pero de un proyecto donde tiene asignación HOY (puede cogerlas)
 *   NUNCA tareas tipo='interna_socio'.
 *
 * POST /api/portal/trabajador/[token]/tareas
 *   Body: { texto, project_id, fecha_objetivo?, notas? }
 *   Crea una tarea tipo='obra_remate' atada al proyecto. created_source='portal'.
 *   Notifica admin.
 *
 * PATCH /api/portal/trabajador/[token]/tareas
 *   Body: { id, action: 'toggle' | 'take' | 'release' }
 *   - toggle: cicla estado pendiente → en_curso → hecha → pendiente. Solo si suya o sin asignar.
 *   - take: asigna a sí mismo una tarea sin asignar (de su proyecto del día)
 *   - release: deja una tarea SUYA como sin asignar (otro la coja)
 *
 * Aislamiento: NO usa Supabase Auth. Solo token UUID + ownership.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { enforce, getClientIp } from '@/lib/rate-limit-portal'

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

async function loadTodayProjectIds(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: string,
): Promise<string[]> {
  // Proyectos donde el trabajador tiene asignación entre ayer y mañana
  // (un poco de margen para que las tareas sin asignar le aparezcan también
  // cuando llega temprano o tarde a la obra)
  const today = new Date()
  const ayer = new Date(today); ayer.setDate(ayer.getDate() - 1)
  const manana = new Date(today); manana.setDate(manana.getDate() + 1)
  const { data } = await supabase
    .from('worker_assignments')
    .select('project_id')
    .eq('employee_id', employeeId)
    .gte('fecha', ayer.toISOString().slice(0, 10))
    .lte('fecha', manana.toISOString().slice(0, 10))
    .is('deleted_at', null)
  return Array.from(new Set((data ?? []).map((r) => r.project_id).filter(Boolean) as string[]))
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

  // 1. Las MÍAS (asignadas a mí)
  const { data: misTareas, error: e1 } = await supabase
    .from('project_tasks')
    .select(
      `id, project_id, texto, notas, estado, prioridad, tipo, fecha_objetivo, asignada_a,
       created_at, created_source, completed_at,
       project:project_id (id, code, name)`,
    )
    .eq('asignada_a', validation.employeeId)
    .in('tipo', ['obra_presupuesto', 'obra_remate'])
    .is('deleted_at', null)
    .order('fecha_objetivo', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  // 2. Las del EQUIPO (sin asignar) de proyectos donde estoy hoy
  const todayProjectIds = await loadTodayProjectIds(supabase, validation.employeeId)
  let delEquipo: typeof misTareas = []
  if (todayProjectIds.length > 0) {
    const { data, error: e2 } = await supabase
      .from('project_tasks')
      .select(
        `id, project_id, texto, notas, estado, prioridad, tipo, fecha_objetivo, asignada_a,
         created_at, created_source, completed_at,
         project:project_id (id, code, name)`,
      )
      .in('project_id', todayProjectIds)
      .is('asignada_a', null)
      .in('tipo', ['obra_presupuesto', 'obra_remate'])
      .is('deleted_at', null)
      .order('fecha_objetivo', { ascending: true, nullsFirst: false })
      .limit(100)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    delEquipo = data ?? []
  }

  return NextResponse.json({
    mias: misTareas ?? [],
    equipo: delEquipo,
    today_project_ids: todayProjectIds,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const rl = enforce({
    category: 'task-write',
    max: 30,
    windowMs: 60_000,
    key: `${getClientIp(request)}|${token.slice(0, 8)}`,
  })
  if (rl) return rl

  const supabase = createAdminSupabaseClient()
  const validation = await validateToken(supabase, token)
  if (!validation) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })

  let body: { texto?: string; project_id?: string; fecha_objetivo?: string; notas?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const texto = (body.texto ?? '').trim()
  if (!texto) return NextResponse.json({ error: 'texto requerido' }, { status: 400 })
  if (texto.length > 500) return NextResponse.json({ error: 'texto demasiado largo (max 500)' }, { status: 400 })
  if (!body.project_id) return NextResponse.json({ error: 'project_id requerido' }, { status: 400 })

  // Validar que el proyecto es de la company y el trabajador tiene asignación reciente (o ningún filtro?)
  // Para simplicidad: solo validar company.
  const { data: proj } = await supabase
    .from('projects')
    .select('id')
    .eq('id', body.project_id)
    .eq('company_id', validation.companyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!proj) return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })

  if (body.fecha_objetivo && !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_objetivo)) {
    return NextResponse.json({ error: 'fecha_objetivo formato YYYY-MM-DD' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('project_tasks')
    .insert({
      company_id: validation.companyId,
      project_id: body.project_id,
      texto,
      notas: body.notas?.trim() || null,
      tipo: 'obra_remate', // trabajador solo puede crear tareas de remate
      estado: 'pendiente',
      fecha_objetivo: body.fecha_objetivo || null,
      asignada_a: validation.employeeId, // se la asigna a sí mismo por defecto
      created_by_employee_id: validation.employeeId,
      created_by_email: null,
      created_source: 'portal',
    })
    .select(
      `id, project_id, texto, notas, estado, prioridad, tipo, fecha_objetivo, asignada_a,
       created_at, created_source, completed_at,
       project:project_id (id, code, name)`,
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif admin: trabajador apuntó tarea nueva
  try {
    const { notifyAdmins } = await import('@/lib/admin-notify')
    const proj = Array.isArray(data.project) ? data.project[0] : data.project
    notifyAdmins({
      severity: 'info',
      title: `${validation.nombre ?? 'Trabajador'} apuntó tarea: ${texto.slice(0, 60)}`,
      message:
        `${validation.nombre ?? validation.employeeId} ha añadido una tarea desde el portal:\n` +
        `Obra: ${proj?.code ?? '—'} ${proj?.name ?? ''}\n` +
        `Tarea: ${texto}` +
        (body.fecha_objetivo ? `\nPara el día: ${body.fecha_objetivo}` : '') +
        (body.notas?.trim() ? `\nNotas: ${body.notas.trim()}` : ''),
      source: 'portal_trabajador',
      dedupKey: `task:${data.id}`,
      actionUrl: `/admin/proyectos/${proj?.code ?? ''}`,
      actionLabel: 'Ver en proyecto',
      metadata: { task_id: data.id, project_id: body.project_id, employee_id: validation.employeeId },
    }).catch(() => {})
  } catch { /* silent */ }

  return NextResponse.json({ ok: true, task: data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const rl = enforce({
    category: 'task-patch',
    max: 60,
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
  if (!['toggle', 'take', 'release'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  }

  // Cargar tarea + verificar permiso
  const { data: task } = await supabase
    .from('project_tasks')
    .select('id, estado, tipo, asignada_a, project_id')
    .eq('id', id)
    .eq('company_id', validation.companyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  if (task.tipo === 'interna_socio') {
    return NextResponse.json({ error: 'No tienes acceso a esta tarea' }, { status: 403 })
  }

  const isMine = task.asignada_a === validation.employeeId
  const isUnassigned = task.asignada_a === null
  if (!isMine && !isUnassigned) {
    return NextResponse.json({ error: 'Esta tarea está asignada a otro trabajador' }, { status: 403 })
  }

  // Si sin asignar y action=toggle/release, primero verificar que el trabajador tiene asignación reciente
  // al mismo proyecto (para que solo pueda tocar tareas de su obra)
  if (isUnassigned) {
    const todayIds = await loadTodayProjectIds(supabase, validation.employeeId)
    if (!todayIds.includes(task.project_id!)) {
      return NextResponse.json({ error: 'No estás asignado a este proyecto ahora' }, { status: 403 })
    }
  }

  const nowIso = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: nowIso }

  if (body.action === 'take') {
    if (!isUnassigned) {
      return NextResponse.json({ error: 'Ya tiene asignación' }, { status: 400 })
    }
    update.asignada_a = validation.employeeId
  } else if (body.action === 'release') {
    if (!isMine) {
      return NextResponse.json({ error: 'No es tuya' }, { status: 400 })
    }
    update.asignada_a = null
  } else if (body.action === 'toggle') {
    const next =
      task.estado === 'pendiente' ? 'en_curso' :
      task.estado === 'en_curso' ? 'hecha' :
      'pendiente'
    update.estado = next
    if (next === 'hecha') {
      update.completed_at = nowIso
      update.completed_by_employee_id = validation.employeeId
      // Si la coge desde sin-asignar al tachar, asignársela a sí mismo
      if (isUnassigned) update.asignada_a = validation.employeeId
    } else {
      update.completed_at = null
      update.completed_by_employee_id = null
      update.completed_by_email = null
    }
  }

  const { data, error } = await supabase
    .from('project_tasks')
    .update(update)
    .eq('id', id)
    .select(
      `id, project_id, texto, notas, estado, prioridad, tipo, fecha_objetivo, asignada_a,
       created_at, created_source, completed_at,
       project:project_id (id, code, name)`,
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif admin si el trabajador marcó como hecha
  if (update.estado === 'hecha') {
    try {
      const { notifyAdmins } = await import('@/lib/admin-notify')
      const proj = Array.isArray(data.project) ? data.project[0] : data.project
      notifyAdmins({
        severity: 'info',
        title: `${validation.nombre ?? 'Trabajador'} marcó tarea hecha: ${data.texto.slice(0, 60)}`,
        message:
          `${validation.nombre ?? validation.employeeId} ha completado:\n` +
          `Obra: ${proj?.code ?? '—'}\n` +
          `Tarea: ${data.texto}\n` +
          'Revísala para certificar la fase correspondiente.',
        source: 'portal_trabajador',
        dedupKey: `task_done:${data.id}`,
        actionUrl: `/admin/proyectos/${proj?.code ?? ''}`,
        actionLabel: 'Ver proyecto',
        metadata: { task_id: data.id, project_id: data.project_id, employee_id: validation.employeeId },
      }).catch(() => {})
    } catch { /* silent */ }
  }

  return NextResponse.json({ ok: true, task: data })
}

export const dynamic = 'force-dynamic'
