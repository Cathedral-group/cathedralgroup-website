/**
 * POST /api/admin/proyectos/gantt/pausa
 *
 * Borra un corte (pausa) de una tarea del Gantt, por índice.
 * body: { task_id: uuid, index: number }
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

  let body: { task_id?: string; index?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.task_id || !UUID_RE.test(body.task_id)) return NextResponse.json({ error: 'task_id inválido' }, { status: 400 })
  const index = Number.parseInt(String(body.index), 10)
  if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: 'índice inválido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { data: t } = await supabase
    .from('project_tasks').select('pausas').eq('id', body.task_id).is('deleted_at', null).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const arr = Array.isArray(t.pausas) ? (t.pausas as Array<{ desde: string; hasta: string }>) : []
  if (index >= arr.length) return NextResponse.json({ error: 'índice fuera de rango' }, { status: 400 })
  const next = arr.filter((_, i) => i !== index)

  const { error } = await supabase.from('project_tasks').update({ pausas: next }).eq('id', body.task_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, pausas: next })
}
