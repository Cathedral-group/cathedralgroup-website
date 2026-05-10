/**
 * GET /api/admin/personal/expenses?desde=&hasta=&employee_id=&status=
 *   Lista todos los gastos apuntados por trabajadores de la empresa activa.
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

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const url = new URL(request.url)
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const employeeId = url.searchParams.get('employee_id')
  const status = url.searchParams.get('status')

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('worker_expense_items')
    .select(
      `id, fecha, tipo, project_id, importe, km_recorridos, km_origen, km_destino,
       material_descripcion, material_cantidad, material_unidad, observaciones,
       fuente, status, reviewed_at, reviewed_by_email, created_at,
       employee:employee_id (id, nombre, nif),
       project:project_id (id, code, name)`,
    )
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('fecha', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export const dynamic = 'force-dynamic'
