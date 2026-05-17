/**
 * GET /api/agents/diagnoses
 *
 * Lista agent_diagnoses status='pending' AND is_test=false. Banner admin Op 2.
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

export async function GET(_request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('agent_diagnoses')
    .select(
      'id, dispatch_id, agent_name, diagnosis, proposed_fix, confidence, citations, model_version, tokens_used, cost_usd, status, is_test, created_at',
    )
    .eq('status', 'pending')
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ diagnoses: data ?? [] })
}

export const dynamic = 'force-dynamic'
