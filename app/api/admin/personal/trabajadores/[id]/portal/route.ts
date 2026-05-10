/**
 * Gestión token portal trabajador (admin only) — roadmap libro_horas Capa 1
 *
 * GET    /api/admin/personal/trabajadores/[id]/portal
 *        Estado actual: si tiene token activo, último uso, etc. NO devuelve el token plaintext.
 *
 * POST   /api/admin/personal/trabajadores/[id]/portal
 *        Body: { expires_at?, notes? }
 *        Genera nuevo token (revocando cualquier activo). Devuelve token plaintext UNA VEZ.
 *        El admin debe copiar el link y enviarlo al trabajador (whatsapp/email manual).
 *
 * DELETE /api/admin/personal/trabajadores/[id]/portal
 *        Body: { reason? }
 *        Revoca todos los tokens activos del empleado.
 *
 * Auth: admin allow-list + AAL2 + acceso a la company del empleado.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import {
  resolveCompanyIdForRequest,
  getCompanyContextFromUser,
  CATHEDRAL_INVESTMENT_SL_ID,
} from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function resolveCompany(user: User, request: NextRequest) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 } as const
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }
  return { activeCompanyId } as const
}

async function loadEmployee(activeCompanyId: string, employeeId: string) {
  const supabase = createAdminSupabaseClient()
  const { data: employee } = await supabase
    .from('employees')
    .select('id, nombre, nif, email, company_id')
    .eq('id', employeeId)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  return { supabase, employee }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params
  const { supabase, employee } = await loadEmployee(resolved.activeCompanyId, id)
  if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  const { data: tokens } = await supabase
    .from('worker_portal_access')
    .select(
      'id, expires_at, revoked_at, revoked_reason, created_at, created_by_email, last_used_at, last_used_ip, uses_count, notes',
    )
    .eq('employee_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const active = (tokens ?? []).find((t) => !t.revoked_at) ?? null

  return NextResponse.json({
    employee,
    active_token: active,
    history: tokens ?? [],
    has_active: Boolean(active),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params
  const { supabase, employee } = await loadEmployee(resolved.activeCompanyId, id)
  if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  let body: { expires_at?: string | null; notes?: string | null }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const { data, error } = await supabase.rpc('create_worker_portal_token', {
    p_employee_id: id,
    p_company_id: resolved.activeCompanyId,
    p_created_by_email: user.email ?? 'unknown',
    p_expires_at: body.expires_at ?? null,
    p_notes: body.notes ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const baseUrl = request.headers.get('x-forwarded-host')
    ? `https://${request.headers.get('x-forwarded-host')}`
    : 'https://cathedralgroup.es'
  const portalUrl = `${baseUrl}/portal/trabajador/${data.token}`

  return NextResponse.json({
    ok: true,
    token: data.token,
    portal_url: portalUrl,
    expires_at: data.expires_at,
    employee,
    warning: 'Este token solo se muestra una vez. Cópialo y compártelo con el trabajador. Si lo pierdes, regenera uno nuevo.',
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params
  const { supabase, employee } = await loadEmployee(resolved.activeCompanyId, id)
  if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  let body: { reason?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const { data, error } = await supabase.rpc('revoke_worker_portal_token', {
    p_employee_id: id,
    p_revoked_by_email: user.email ?? 'unknown',
    p_reason: body.reason ?? 'Revocación manual desde admin',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, result: data })
}

export const dynamic = 'force-dynamic'
