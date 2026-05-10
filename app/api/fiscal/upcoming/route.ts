/**
 * GET /api/fiscal/upcoming
 *
 * Próximos vencimientos fiscales AEAT para Cathedral.
 * Auth: admin allow-list + AAL2.
 *
 * Query params:
 * - days_ahead (default 60)
 * - days_overdue (default 30)
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
  const isUser = await authCheckUser()
  const isCron = authCheckCron(request)
  if (!isUser && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const daysAhead = parseInt(searchParams.get('days_ahead') ?? '60', 10)
  const daysOverdue = parseInt(searchParams.get('days_overdue') ?? '30', 10)

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('upcoming_fiscal_deadlines', {
    p_days_ahead: Number.isFinite(daysAhead) && daysAhead >= 0 ? daysAhead : 60,
    p_days_overdue: Number.isFinite(daysOverdue) && daysOverdue >= 0 ? daysOverdue : 30,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Ordenar: vencidos primero, luego por días asc
  const sorted = (data ?? []).sort(
    (
      a: { is_overdue: boolean; days_until_deadline: number },
      b: { is_overdue: boolean; days_until_deadline: number },
    ) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1
      return a.days_until_deadline - b.days_until_deadline
    },
  )

  return NextResponse.json({ deadlines: sorted, count: sorted.length })
}

export const dynamic = 'force-dynamic'
