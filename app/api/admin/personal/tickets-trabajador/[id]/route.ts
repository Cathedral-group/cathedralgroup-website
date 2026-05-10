/**
 * Endpoints individuales para gestionar un ticket subido por trabajador.
 *
 * PATCH /api/admin/personal/tickets-trabajador/[id]
 *   Body: { status?, project_id?, reviewer_action? }
 *   Marca como confirmed/ignored, asigna proyecto si faltaba.
 *
 * DELETE /api/admin/personal/tickets-trabajador/[id]
 *   Soft-delete + borrar archivo del bucket.
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

  let body: {
    status?: string
    project_id?: string | null
    reviewer_action?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by_email: user.email ?? null,
  }
  if (body.status) update.status = body.status
  if ('project_id' in body) update.project_id = body.project_id
  if (body.reviewer_action) update.reviewer_action = body.reviewer_action

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('worker_attachments')
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

  // Cargar para obtener storage_path
  const { data: attachment } = await supabase
    .from('worker_attachments')
    .select('storage_path, storage_bucket')
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .maybeSingle()

  if (!attachment) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  // Soft-delete BD
  const { error } = await supabase
    .from('worker_attachments')
    .update({
      deleted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: user.email ?? null,
      reviewer_action: 'deleted',
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Borrar archivo storage (best-effort)
  await supabase.storage
    .from(attachment.storage_bucket || 'worker-receipts')
    .remove([attachment.storage_path])

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
