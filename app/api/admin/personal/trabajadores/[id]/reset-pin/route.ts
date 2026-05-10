/**
 * POST /api/admin/personal/trabajadores/[id]/reset-pin
 *
 * Resetea el PIN del trabajador a '0000'. Útil cuando el trabajador lo olvida.
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params

  const supabase = createAdminSupabaseClient()
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  const { data, error } = await supabase.rpc('reset_worker_pin', {
    p_employee_id: id,
    p_admin_email: user.email ?? 'unknown',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, result: data })
}

export const dynamic = 'force-dynamic'
