/**
 * POST /api/admin/proyectos/gantt/segmentos
 *
 * Reemplaza los segmentos de trabajo de una tarea. Toda edición del Gantt
 * (mover, redimensionar, partir, fusionar) construye el array completo en el
 * cliente y lo manda aquí. El RPC recalcula fecha_inicio_plan/fin (min/max).
 *
 * body: { task_id: uuid, segmentos: [{ inicio: 'YYYY-MM-DD', fin: 'YYYY-MM-DD' }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

  let body: { task_id?: string; segmentos?: Array<{ inicio?: string; fin?: string }> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.task_id || !UUID_RE.test(body.task_id)) return NextResponse.json({ error: 'task_id inválido' }, { status: 400 })
  if (!Array.isArray(body.segmentos) || body.segmentos.length === 0) {
    return NextResponse.json({ error: 'Se requiere al menos un segmento' }, { status: 400 })
  }

  // Validar y normalizar: fechas correctas, inicio<=fin, ordenar por inicio
  const segs: { inicio: string; fin: string }[] = []
  for (const s of body.segmentos) {
    if (!s.inicio || !s.fin || !DATE_RE.test(s.inicio) || !DATE_RE.test(s.fin)) {
      return NextResponse.json({ error: 'Segmento con fechas inválidas' }, { status: 400 })
    }
    if (s.fin < s.inicio) return NextResponse.json({ error: 'Un segmento tiene fin anterior al inicio' }, { status: 400 })
    segs.push({ inicio: s.inicio, fin: s.fin })
  }
  segs.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.rpc('update_task_segments', { p_task_id: body.task_id, p_segmentos: segs })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, segmentos: segs })
}
