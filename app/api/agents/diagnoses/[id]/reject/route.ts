/**
 * POST /api/agents/diagnoses/[id]/reject
 *
 * Admin rechaza diagnóstico agente Op 2. Estado: pending → rejected.
 * Body: { reason?: string } (max 500 chars). rejection_reason guardado en trigger_context.
 * Auth: admin allow-list + AAL2.
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

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const reason =
    typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('reject_diagnosis', {
    p_diagnosis_id: id,
    p_admin_email: user.email ?? '',
    p_reason: reason,
  })
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: error.message }, { status: 404 })
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ diagnosis: data })
}

export const dynamic = 'force-dynamic'
