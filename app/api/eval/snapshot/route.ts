/**
 * GET /api/eval/snapshot?days=30
 * POST /api/eval/snapshot (persiste el snapshot en eval_runs)
 *
 * Endpoint del framework eval estructural.
 * GET: devuelve métricas en tiempo real (no persiste).
 * POST: ejecuta + persiste en `eval_runs` para histórico (cron diario).
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheckUser() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function authCheckCron(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (auth.length !== expectedHeader.length) return false
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expectedHeader))
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const user = await authCheckUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)
  const window = Number.isFinite(days) && days > 0 && days <= 3650 ? days : 30

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('eval_structural_snapshot', { p_window_days: window })
  if (error) {
    return NextResponse.json({ error: 'RPC failed', detail: error.message }, { status: 500 })
  }
  return NextResponse.json({ snapshot: data })
}

export async function POST(request: NextRequest) {
  const isUser = await authCheckUser()
  const isCron = authCheckCron(request)
  if (!isUser && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { days?: number; notes?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* body opcional */
  }
  const days = Number.isFinite(body.days) && body.days! > 0 ? body.days! : 30

  const supabase = createAdminSupabaseClient()
  const { data: snapshot, error: snapErr } = await supabase.rpc('eval_structural_snapshot', { p_window_days: days })
  if (snapErr) {
    return NextResponse.json({ error: 'snapshot failed', detail: snapErr.message }, { status: 500 })
  }

  const { data: insertResult, error: insErr } = await supabase
    .from('eval_runs')
    .insert({
      run_type: isCron ? 'cron' : 'manual',
      scope: 'invoices',
      metrics: snapshot,
      notes: body.notes ?? null,
    })
    .select('id, run_at')
    .single()
  if (insErr) {
    return NextResponse.json({ error: 'persist failed', detail: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, run_id: insertResult.id, run_at: insertResult.run_at, snapshot })
}

export const dynamic = 'force-dynamic'
