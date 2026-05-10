/**
 * POST /api/admin/companies/active — F3 completo MVP
 *
 * Cambia la empresa activa del usuario. Actualiza app_metadata.active_company_id
 * en auth.users (reflejado en JWT en próximo refresh).
 *
 * Auth: admin allow-list + AAL2.
 *
 * Body: { company_id: string }
 *
 * Tras éxito, el cliente debe llamar a `supabase.auth.refreshSession()` para
 * que el nuevo JWT incluya el active_company_id actualizado y los page
 * server components empiecen a verlo en la próxima navegación.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { company_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.company_id || !/^[0-9a-f-]{36}$/i.test(body.company_id)) {
    return NextResponse.json({ error: 'company_id requerido (UUID)' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Verificar que el user tiene acceso a la company solicitada
  const { data: membership, error: memErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', body.company_id)
    .is('revoked_at', null)
    .maybeSingle()
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 })
  }
  if (!membership) {
    return NextResponse.json(
      { error: `Forbidden: no tienes acceso a esa company` },
      { status: 403 },
    )
  }

  // Actualizar app_metadata.active_company_id (preservando lo demás)
  const currentMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...currentMeta,
      active_company_id: body.company_id,
    },
  })
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Audit log chain
  await supabase.from('audit_log_chain').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action: 'UPDATE',
    table_name: 'auth.users.app_metadata',
    record_id: user.id,
    company_id: body.company_id,
    after_data: { active_company_id: body.company_id },
    metadata: { source: 'admin_panel_active_company_change' },
  })

  return NextResponse.json({
    ok: true,
    active_company_id: body.company_id,
    role: membership.role,
    note: 'JWT se actualizará en próximo refresh. Cliente debe llamar supabase.auth.refreshSession() para forzarlo.',
  })
}

export const dynamic = 'force-dynamic'
