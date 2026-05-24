/**
 * POST /api/admin/proyectos/gantt/partir
 *
 * Parte una tarea del Gantt en dos: la original se acorta hasta la mitad y se
 * crea una tarea "(cont.)" con los días restantes, tras un hueco de días
 * laborables (p. ej. los días que los trabajadores se van a otra obra).
 *
 * body: { task_id: uuid, hueco_dias?: int }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isWeekend(d: Date) { const x = d.getDay(); return x === 0 || x === 6 }
function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start); let a = 0
  while (a < n) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) a++ }
  return d
}
function businessDaysBetween(a: Date, b: Date): number {
  let n = 0; const d = new Date(a)
  while (d < b) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) n++ }
  return n + 1
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { task_id?: string; hueco_dias?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.task_id || !UUID_RE.test(body.task_id)) return NextResponse.json({ error: 'task_id inválido' }, { status: 400 })
  const hueco = Math.max(1, Math.trunc(body.hueco_dias ?? 2))

  const supabase = createAdminSupabaseClient()
  const { data: task } = await supabase
    .from('project_tasks')
    .select('id, fecha_inicio_plan, fecha_fin_plan')
    .eq('id', body.task_id).is('deleted_at', null).maybeSingle()
  if (!task || !task.fecha_inicio_plan || !task.fecha_fin_plan) {
    return NextResponse.json({ error: 'La tarea no tiene fechas planificadas' }, { status: 400 })
  }

  const ini = new Date(task.fecha_inicio_plan + 'T00:00:00')
  const fin = new Date(task.fecha_fin_plan + 'T00:00:00')
  const D = businessDaysBetween(ini, fin)
  if (D < 2) return NextResponse.json({ error: 'La tarea dura 1 día; no se puede partir' }, { status: 400 })

  const corte = Math.floor(D / 2)
  const finPrimera = addBusinessDays(ini, corte - 1)
  const iniNueva = addBusinessDays(finPrimera, 1 + hueco)
  const finNueva = addBusinessDays(iniNueva, (D - corte) - 1)

  const { data: newId, error } = await supabase.rpc('split_task', {
    p_task_id: body.task_id,
    p_fin_primera: toISO(finPrimera),
    p_ini_nueva: toISO(iniNueva),
    p_fin_nueva: toISO(finNueva),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, nueva_tarea_id: newId, hueco_dias: hueco })
}
