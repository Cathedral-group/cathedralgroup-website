/**
 * POST /api/admin/proyectos/gantt/dia-extra
 *
 * Activa/desactiva un día extra de trabajo (sábado/domingo/festivo) para una
 * tarea. Toggle: si ya está, lo quita; si no, lo añade.
 *
 * body: { task_id: uuid, fecha: 'YYYY-MM-DD' }
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

  let body: { task_id?: string; fecha?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.task_id || !UUID_RE.test(body.task_id)) return NextResponse.json({ error: 'task_id inválido' }, { status: 400 })
  if (!body.fecha || !DATE_RE.test(body.fecha)) return NextResponse.json({ error: 'fecha inválida' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { data: t } = await supabase
    .from('project_tasks').select('dias_extra').eq('id', body.task_id).is('deleted_at', null).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const arr: string[] = Array.isArray(t.dias_extra) ? (t.dias_extra as string[]) : []
  const activo = arr.includes(body.fecha)
  const next = activo ? arr.filter((f) => f !== body.fecha) : [...arr, body.fecha]

  const { error } = await supabase.from('project_tasks').update({ dias_extra: next }).eq('id', body.task_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, activo: !activo, dias_extra: next })
}
