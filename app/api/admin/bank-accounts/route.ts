/**
 * GET /api/admin/bank-accounts — lista cuentas bancarias de la empresa activa
 *
 * Útil para selectores SEPA (debtor account).
 *
 * Auth: admin allow-list + AAL2 + cualquier role en la company.
 */

import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Forbidden' },
      { status: 403 },
    )
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, iban, bic_swift, bank_name, account_alias, account_holder_nombre, status')
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('account_alias', { nullsFirst: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ accounts: data ?? [] })
}

export const dynamic = 'force-dynamic'
