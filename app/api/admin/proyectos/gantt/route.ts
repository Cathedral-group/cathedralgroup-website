/**
 * PATCH /api/admin/proyectos/gantt
 *
 * Actualiza planificación de una tarea desde el Gantt: fecha_inicio_plan,
 * fecha_fin_plan, orden. Auth admin AAL2.
 *
 * body: { id: uuid, fecha_inicio_plan?: 'YYYY-MM-DD'|null, fecha_fin_plan?: 'YYYY-MM-DD'|null, orden?: int }
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

export async function PATCH(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { id?: string; fecha_inicio_plan?: string | null; fecha_fin_plan?: string | null; orden?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.id || !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.fecha_inicio_plan === null) patch.fecha_inicio_plan = null
  else if (body.fecha_inicio_plan && DATE_RE.test(body.fecha_inicio_plan)) patch.fecha_inicio_plan = body.fecha_inicio_plan
  if (body.fecha_fin_plan === null) patch.fecha_fin_plan = null
  else if (body.fecha_fin_plan && DATE_RE.test(body.fecha_fin_plan)) patch.fecha_fin_plan = body.fecha_fin_plan
  if (typeof body.orden === 'number' && Number.isFinite(body.orden)) patch.orden = Math.trunc(body.orden)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { error, data } = await supabase
    .from('project_tasks')
    .update(patch)
    .eq('id', body.id)
    .select('id, fecha_inicio_plan, fecha_fin_plan, orden')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}
