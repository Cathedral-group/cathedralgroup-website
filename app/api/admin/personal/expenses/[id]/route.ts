/**
 * PATCH /api/admin/personal/expenses/[id]
 *   Body: { status?, project_id? }
 *   Confirmar/ignorar/marcar reembolsado.
 *
 * DELETE /api/admin/personal/expenses/[id]
 *   Soft-delete admin (siempre permitido).
 *
 * Auth: admin allow-list + AAL2.
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params

  let body: { status?: string; project_id?: string | null; medio_pago?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const ALLOWED_STATUS = ['pending', 'confirmed', 'ignored', 'reimbursed']
  const ALLOWED_MEDIOS = ['bolsillo_personal', 'tarjeta_empresa', 'coche_empresa', 'efectivo_caja_obra']
  if (body.status && !ALLOWED_STATUS.includes(body.status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }
  if (body.medio_pago && !ALLOWED_MEDIOS.includes(body.medio_pago)) {
    return NextResponse.json({ error: 'medio_pago inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by_email: user.email ?? null,
  }
  if (body.status) update.status = body.status
  if ('project_id' in body) update.project_id = body.project_id
  if (body.medio_pago) update.medio_pago = body.medio_pago

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('worker_expense_items')
    .update(update)
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
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

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('worker_expense_items')
    .update({
      deleted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: user.email ?? null,
    })
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
