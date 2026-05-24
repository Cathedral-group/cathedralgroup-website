/**
 * Equipo de la obra desde el Gantt (fuente principal de planificación).
 *
 * GET  ?project=<id>            → resource_ids asignados a la obra
 * POST { project_id, resource_id, action: 'add'|'remove' }
 *   add    → crea worker_assignments (resource_id+project_id+fecha) para cada día
 *            laborable (lun-vie) del rango planificado del Gantt → rellena el cuadrante.
 *   remove → soft-delete las asignaciones de ese recurso en esa obra.
 *
 * Auth: admin allow-list + AAL2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

// Rango planificado de la obra: gantt_inicio/fin_previsto, o min/max de segmentos de tareas.
async function planRange(supabase: ReturnType<typeof createAdminSupabaseClient>, projectId: string) {
  const { data: p } = await supabase.from('projects')
    .select('gantt_inicio_previsto, gantt_fin_previsto').eq('id', projectId).maybeSingle()
  let ini = p?.gantt_inicio_previsto ?? null
  let fin = p?.gantt_fin_previsto ?? null
  if (!ini || !fin) {
    const { data: tasks } = await supabase.from('project_tasks')
      .select('segmentos, fecha_inicio_plan, fecha_fin_plan').eq('project_id', projectId).is('deleted_at', null)
    for (const t of (tasks ?? [])) {
      const segs = Array.isArray(t.segmentos) && t.segmentos.length > 0
        ? (t.segmentos as Array<{ inicio: string; fin: string }>)
        : (t.fecha_inicio_plan && t.fecha_fin_plan ? [{ inicio: t.fecha_inicio_plan, fin: t.fecha_fin_plan }] : [])
      for (const s of segs) {
        if (!ini || s.inicio < ini) ini = s.inicio
        if (!fin || s.fin > fin) fin = s.fin
      }
    }
  }
  return { ini, fin }
}

function laborables(iniISO: string, finISO: string): string[] {
  const out: string[] = []
  const d = new Date(iniISO + 'T00:00:00'), end = new Date(finISO + 'T00:00:00')
  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const projectId = request.nextUrl.searchParams.get('project')
  if (!projectId || !UUID_RE.test(projectId)) return NextResponse.json({ error: 'project inválido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { data } = await supabase.from('worker_assignments')
    .select('resource_id').eq('project_id', projectId).is('deleted_at', null).not('resource_id', 'is', null)
  const ids = Array.from(new Set((data ?? []).map((r) => r.resource_id as string)))
  return NextResponse.json({ resource_ids: ids })
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { project_id?: string; resource_id?: string; action?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.project_id || !UUID_RE.test(body.project_id)) return NextResponse.json({ error: 'project_id inválido' }, { status: 400 })
  if (!body.resource_id || !UUID_RE.test(body.resource_id)) return NextResponse.json({ error: 'resource_id inválido' }, { status: 400 })
  const action = body.action === 'remove' ? 'remove' : 'add'

  const supabase = createAdminSupabaseClient()

  const { data: proj } = await supabase.from('projects')
    .select('id, company_id').eq('id', body.project_id).is('deleted_at', null).maybeSingle()
  if (!proj) return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })

  const { data: res } = await supabase.from('resources')
    .select('id, type, employee_id, company_id').eq('id', body.resource_id).is('deleted_at', null).maybeSingle()
  if (!res || res.company_id !== proj.company_id) return NextResponse.json({ error: 'Recurso no válido' }, { status: 400 })

  if (action === 'remove') {
    const { error } = await supabase.from('worker_assignments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', body.project_id).eq('resource_id', body.resource_id).is('deleted_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'removed' })
  }

  const { ini, fin } = await planRange(supabase, body.project_id)
  if (!ini || !fin) return NextResponse.json({ error: 'La obra no tiene planificación en el Gantt todavía' }, { status: 400 })

  const dias = laborables(ini, fin)
  // Solo crea los días que el recurso aún no tiene asignados (a cualquier obra): respeta el unique(resource_id,fecha).
  const { data: ocupados } = await supabase.from('worker_assignments')
    .select('fecha').eq('resource_id', body.resource_id).is('deleted_at', null).in('fecha', dias)
  const ocupadosSet = new Set((ocupados ?? []).map((r) => r.fecha as string))
  const rows = dias.filter((f) => !ocupadosSet.has(f)).map((fecha) => ({
    company_id: proj.company_id,
    resource_id: body.resource_id!,
    employee_id: res.type === 'empleado' ? res.employee_id : null,
    project_id: body.project_id!,
    fecha,
    jornada_esperada_horas: 8,
    created_by_email: user.email ?? null,
  }))
  if (rows.length > 0) {
    const { error } = await supabase.from('worker_assignments').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const conflictos = dias.length - rows.length
  return NextResponse.json({ ok: true, action: 'added', creados: rows.length, ya_ocupados: conflictos })
}
