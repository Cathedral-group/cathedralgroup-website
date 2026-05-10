/**
 * Endpoints /api/admin/companies/[id]/members — Bloque 0 F3.3
 *
 * GET    → lista miembros activos de la company
 * POST   → añadir miembro (user_id existente o email a invitar) con role
 * DELETE → revocar miembro (revoked_at = NOW())
 *
 * Auth: admin allow-list + AAL2 + role owner/admin en la company.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { syncCompanyMetadataForUser } from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

async function checkCompanyManagePermission(
  userId: string,
  companyId: string,
): Promise<boolean> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .maybeSingle()
  if (error || !data) return false
  return ['owner', 'admin'].includes(data.role as string)
}

const VALID_ROLES = ['owner', 'admin', 'contable', 'rh', 'dpo', 'lectura', 'operario'] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: companyId } = await params

  if (!(await checkCompanyManagePermission(user.id, companyId))) {
    return NextResponse.json({ error: 'Forbidden: requires owner/admin role' }, { status: 403 })
  }

  const supabase = createAdminSupabaseClient()
  const { data: members, error } = await supabase
    .from('company_members')
    .select('id, user_id, role, granted_by, granted_at, revoked_at, permissions')
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .order('granted_at')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer con email del user
  const userIds = (members ?? []).map((m) => m.user_id as string)
  let usersById: Record<string, { email: string }> = {}
  if (userIds.length > 0) {
    const { data: usersResp } = await supabase.auth.admin.listUsers()
    for (const u of usersResp?.users ?? []) {
      if (userIds.includes(u.id)) usersById[u.id] = { email: u.email ?? '' }
    }
  }

  const enriched = (members ?? []).map((m) => ({
    ...m,
    email: usersById[m.user_id as string]?.email ?? null,
  }))

  return NextResponse.json({ members: enriched })
}

interface AddBody {
  user_id?: string
  email?: string
  role?: string
  permissions?: Record<string, unknown>
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: companyId } = await params

  if (!(await checkCompanyManagePermission(user.id, companyId))) {
    return NextResponse.json({ error: 'Forbidden: requires owner/admin role' }, { status: 403 })
  }

  let body: AddBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.role || !VALID_ROLES.includes(body.role as (typeof VALID_ROLES)[number])) {
    return NextResponse.json(
      { error: `role inválido. Permitidos: ${VALID_ROLES.join(', ')}` },
      { status: 400 },
    )
  }

  if (!body.user_id && !body.email) {
    return NextResponse.json({ error: 'user_id o email requerido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Resolver user_id desde email si solo viene email
  let targetUserId = body.user_id
  if (!targetUserId && body.email) {
    const { data: usersResp, error: lstErr } = await supabase.auth.admin.listUsers()
    if (lstErr) {
      return NextResponse.json({ error: lstErr.message }, { status: 500 })
    }
    const found = usersResp?.users?.find(
      (u) => u.email?.toLowerCase() === body.email!.toLowerCase(),
    )
    if (!found) {
      return NextResponse.json(
        { error: `User con email ${body.email} no existe (debe registrarse primero)` },
        { status: 404 },
      )
    }
    targetUserId = found.id
  }

  try {
    const { data: created, error: insErr } = await supabase
      .from('company_members')
      .insert({
        user_id: targetUserId,
        company_id: companyId,
        role: body.role,
        permissions: body.permissions ?? {},
        granted_by: user.id,
      })
      .select()
      .single()
    if (insErr) {
      if (insErr.code === '23505') {
        return NextResponse.json(
          { error: `User ya tiene rol '${body.role}' en esta company` },
          { status: 409 },
        )
      }
      throw new Error(insErr.message)
    }

    await syncCompanyMetadataForUser(targetUserId!)

    // Audit log
    await supabase.from('audit_log_chain').insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: 'INSERT',
      table_name: 'company_members',
      record_id: created.id,
      company_id: companyId,
      after_data: created,
      metadata: { source: 'admin_panel_add_member' },
    })

    return NextResponse.json({ ok: true, member: created }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: companyId } = await params
  const url = new URL(request.url)
  const memberId = url.searchParams.get('member_id')
  if (!memberId) {
    return NextResponse.json({ error: 'member_id query param requerido' }, { status: 400 })
  }

  if (!(await checkCompanyManagePermission(user.id, companyId))) {
    return NextResponse.json({ error: 'Forbidden: requires owner/admin role' }, { status: 403 })
  }

  const supabase = createAdminSupabaseClient()

  // Obtener el member antes para audit log y sync
  const { data: existingMember } = await supabase
    .from('company_members')
    .select('user_id, role')
    .eq('id', memberId)
    .eq('company_id', companyId)
    .single()

  if (!existingMember) {
    return NextResponse.json({ error: 'member no encontrado' }, { status: 404 })
  }

  // No permitir auto-revocación si eres el último owner
  if (existingMember.user_id === user.id && existingMember.role === 'owner') {
    const { count } = await supabase
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('role', 'owner')
      .is('revoked_at', null)
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'No puedes revocarte si eres el último owner. Asigna otro owner primero.' },
        { status: 400 },
      )
    }
  }

  const { data: revoked, error } = await supabase
    .from('company_members')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', memberId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await syncCompanyMetadataForUser(existingMember.user_id as string)

  // Audit log
  await supabase.from('audit_log_chain').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action: 'SOFT_DELETE',
    table_name: 'company_members',
    record_id: memberId,
    company_id: companyId,
    before_data: existingMember,
    after_data: revoked,
    metadata: { source: 'admin_panel_revoke_member' },
  })

  return NextResponse.json({ ok: true, revoked })
}

export const dynamic = 'force-dynamic'
