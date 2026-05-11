/**
 * Decidir un canje de banco horas pendiente.
 *
 * PATCH /api/admin/personal/canjes/[id]
 *   Body: { action: 'approve' | 'reject', notes? }
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { dismissNotificationByDedup } from '@/lib/admin-notify'
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params

  let body: { action?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action debe ser approve o reject' }, { status: 400 })
  }

  const newStatus = body.action === 'approve' ? 'approved' : 'rejected'
  const supabase = createAdminSupabaseClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('worker_overtime_redemptions')
    .update({
      status: newStatus,
      decided_at: nowIso,
      decided_by_email: user.email ?? null,
      decision_notes: body.notes?.trim() || null,
      updated_at: nowIso,
    })
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .eq('status', 'pending')
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Canje no encontrado o ya decidido' }, { status: 404 })

  dismissNotificationByDedup('portal_trabajador', `canje:${id}`, user.email ?? undefined)
    .catch((e) => console.warn('[canjes dismiss]', e))

  return NextResponse.json({ ok: true, row: data })
}

export const dynamic = 'force-dynamic'
