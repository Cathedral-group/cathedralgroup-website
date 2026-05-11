/**
 * Tareas del proyecto — endpoints admin.
 *
 * GET  /api/admin/personal/project-tasks?project_id=&fecha=&assigned_to=&estado=
 *   Lista tareas con filtros opcionales. Sin filtros: devuelve las pendientes
 *   de los últimos 90 días + futuras.
 *
 * POST /api/admin/personal/project-tasks
 *   Body: { project_id, texto, notas?, prioridad?, fecha_objetivo?, asignada_a? }
 *   Crea una tarea.
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import {
  resolveCompanyIdForRequest,
  getCompanyContextFromUser,
  CATHEDRAL_INVESTMENT_SL_ID,
} from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function resolveCompany(user: User, request: NextRequest) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 } as const
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }
  return { activeCompanyId } as const
}

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('project_id')
  const fecha = url.searchParams.get('fecha')
  const fechaDesde = url.searchParams.get('desde')
  const fechaHasta = url.searchParams.get('hasta')
  const assignedTo = url.searchParams.get('assigned_to')
  const estado = url.searchParams.get('estado')

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('project_tasks')
    .select(
      `id, project_id, texto, notas, estado, prioridad, fecha_objetivo, asignada_a,
       created_at, created_by_email, created_source, completed_at, completed_by_email,
       updated_at,
       project:project_id (id, code, name),
       assigned_employee:asignada_a (id, nombre),
       created_employee:created_by_employee_id (id, nombre)`,
    )
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)

  if (projectId) query = query.eq('project_id', projectId)
  if (fecha) query = query.eq('fecha_objetivo', fecha)
  if (fechaDesde) query = query.gte('fecha_objetivo', fechaDesde)
  if (fechaHasta) query = query.lte('fecha_objetivo', fechaHasta)
  if (assignedTo) query = query.eq('asignada_a', assignedTo)
  if (estado && ['pendiente', 'hecha'].includes(estado)) query = query.eq('estado', estado)

  const { data, error } = await query
    .order('estado', { ascending: true })
    .order('fecha_objetivo', { ascending: true, nullsFirst: false })
    .order('prioridad', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}

const ALLOWED_PRIORIDAD = ['baja', 'media', 'alta']

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: {
    project_id?: string
    texto?: string
    notas?: string
    prioridad?: string
    fecha_objetivo?: string | null
    asignada_a?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.project_id) return NextResponse.json({ error: 'project_id requerido' }, { status: 400 })
  const texto = (body.texto ?? '').trim()
  if (!texto) return NextResponse.json({ error: 'texto requerido' }, { status: 400 })
  if (texto.length > 500) return NextResponse.json({ error: 'texto demasiado largo (max 500)' }, { status: 400 })

  const prioridad = body.prioridad ?? 'media'
  if (!ALLOWED_PRIORIDAD.includes(prioridad)) {
    return NextResponse.json({ error: 'prioridad inválida' }, { status: 400 })
  }

  if (body.fecha_objetivo && !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_objetivo)) {
    return NextResponse.json({ error: 'fecha_objetivo formato YYYY-MM-DD' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Validar proyecto pertenece a la company
  const { data: proj } = await supabase
    .from('projects')
    .select('id')
    .eq('id', body.project_id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!proj) return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })

  // Validar empleado pertenece a la company
  if (body.asignada_a) {
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('id', body.asignada_a)
      .eq('company_id', resolved.activeCompanyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Trabajador no válido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('project_tasks')
    .insert({
      company_id: resolved.activeCompanyId,
      project_id: body.project_id,
      texto,
      notas: body.notas?.trim() || null,
      prioridad,
      fecha_objetivo: body.fecha_objetivo || null,
      asignada_a: body.asignada_a || null,
      created_by_email: user.email ?? null,
      created_source: 'admin',
    })
    .select(
      `id, project_id, texto, notas, estado, prioridad, fecha_objetivo, asignada_a,
       created_at, created_by_email, created_source,
       project:project_id (id, code, name),
       assigned_employee:asignada_a (id, nombre)`,
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, task: data })
}

export const dynamic = 'force-dynamic'
