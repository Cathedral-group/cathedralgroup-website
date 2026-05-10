/**
 * GET /api/eval/cost-summary
 *
 * Resumen de coste IA del mes actual + histórico mes/provider.
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

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') ?? '6', 10)
  const window = Number.isFinite(months) && months > 0 && months <= 24 ? months : 6

  const supabase = createAdminSupabaseClient()

  const [currentRes, monthlyRes] = await Promise.all([
    supabase.rpc('cost_summary_current_month'),
    supabase.rpc('cost_summary_by_month_provider', { p_months: window }),
  ])

  if (currentRes.error || monthlyRes.error) {
    return NextResponse.json(
      {
        error: 'RPC failed',
        current_error: currentRes.error?.message,
        monthly_error: monthlyRes.error?.message,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    current_month: currentRes.data,
    monthly_by_provider: monthlyRes.data ?? [],
  })
}

export const dynamic = 'force-dynamic'
