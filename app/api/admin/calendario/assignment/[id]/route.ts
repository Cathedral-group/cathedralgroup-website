/**
 * PATCH/DELETE /api/admin/calendario/assignment/[id]
 *
 * PATCH: mueve asignación a otra fecha o cambia proyecto (drag-drop cuadrante).
 *   body: { fecha?: 'YYYY-MM-DD', project_id?: uuid | null }
 *
 * DELETE: borra asignación (X en celda cuadrante).
 *
 * Auth admin AAL2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  let body: { fecha?: string; project_id?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) patch.fecha = body.fecha
  if (body.project_id !== undefined) patch.project_id = body.project_id

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { error, data } = await supabase
    .from('time_records')
    .update(patch)
    .eq('id', id)
    .select('id, employee_id, fecha, project_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ ok: true, record: data })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from('time_records').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
