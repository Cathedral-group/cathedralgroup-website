/**
 * POST /api/admin/proyectos/gantt/confirmar
 *
 * Confirma la planificación actual como línea base: guarda inicio/fin previstos
 * (min/max de los segmentos de todas las tareas) + horas previstas (del
 * presupuesto) + nº de trabajadores. A partir de aquí se mide la desviación.
 *
 * body: { project_id: uuid, num_trabajadores?: int }
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

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { project_id?: string; num_trabajadores?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.project_id || !UUID_RE.test(body.project_id)) return NextResponse.json({ error: 'project_id inválido' }, { status: 400 })
  const numTrab = Math.max(1, Math.trunc(body.num_trabajadores ?? 2))

  const supabase = createAdminSupabaseClient()

  // min/max de los segmentos de todas las tareas del proyecto
  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('segmentos, fecha_inicio_plan, fecha_fin_plan')
    .eq('project_id', body.project_id).is('deleted_at', null)
  let ini: string | null = null, fin: string | null = null
  for (const t of (tasks ?? [])) {
    const segs = Array.isArray(t.segmentos) && t.segmentos.length > 0
      ? (t.segmentos as Array<{ inicio: string; fin: string }>)
      : (t.fecha_inicio_plan && t.fecha_fin_plan ? [{ inicio: t.fecha_inicio_plan, fin: t.fecha_fin_plan }] : [])
    for (const s of segs) {
      if (!ini || s.inicio < ini) ini = s.inicio
      if (!fin || s.fin > fin) fin = s.fin
    }
  }
  if (!ini || !fin) return NextResponse.json({ error: 'No hay tareas planificadas que confirmar' }, { status: 400 })

  // horas previstas: del presupuesto más reciente del proyecto
  const { data: quote } = await supabase
    .from('quotes').select('items').eq('project_id', body.project_id).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  let horas = 0
  for (const it of ((quote?.items ?? []) as Array<{ quantity?: number; horas_por_unidad?: number | null }>)) {
    horas += (Number(it.quantity) || 0) * (Number(it.horas_por_unidad) || 0)
  }

  const { error } = await supabase.from('projects').update({
    gantt_inicio_previsto: ini,
    gantt_fin_previsto: fin,
    gantt_horas_previstas: horas > 0 ? Math.round(horas) : null,
    gantt_trabajadores_previstos: numTrab,
  }).eq('id', body.project_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inicio: ini, fin })
}
