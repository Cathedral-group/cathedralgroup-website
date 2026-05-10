/**
 * POST /api/sepa/payroll — B11
 *
 * Genera XML SEPA Pain.001.001.03 para pago masivo de nóminas del mes.
 * Devuelve el XML como descarga lista para subir al portal del banco.
 *
 * Auth: admin allow-list + AAL2 + role owner/admin/contable de la company activa.
 *
 * Body: { year: 2026, month: 5, debtor_account_id: 'uuid', execution_date?: 'YYYY-MM-DD' }
 *
 * Response 200 (XML como text):
 *   Content-Type: application/xml
 *   Content-Disposition: attachment; filename="cathedral_nominas_2026-05.xml"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import {
  resolveCompanyIdForRequest,
  getCompanyContextFromUser,
  CATHEDRAL_INVESTMENT_SL_ID,
} from '@/lib/company-context'
import { buildPain001Xml } from '@/lib/sepa-pain001'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

interface Body {
  year?: number
  month?: number
  debtor_account_id?: string
  execution_date?: string
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const year = body.year
  const month = body.month
  const debtorAccountId = body.debtor_account_id
  if (
    !Number.isInteger(year) || year! < 2020 || year! > 2100 ||
    !Number.isInteger(month) || month! < 1 || month! > 12 ||
    !debtorAccountId
  ) {
    return NextResponse.json(
      { error: 'year (2020-2100), month (1-12) y debtor_account_id requeridos' },
      { status: 400 },
    )
  }

  // Resolver company activa
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

  // Verificar role
  const supabase = createAdminSupabaseClient()
  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', activeCompanyId)
    .is('revoked_at', null)
    .maybeSingle()
  if (!membership || !['owner', 'admin', 'contable'].includes(membership.role as string)) {
    return NextResponse.json(
      { error: 'Forbidden: requiere rol owner/admin/contable' },
      { status: 403 },
    )
  }

  try {
    const { data, error } = await supabase.rpc('prepare_sepa_payroll_data', {
      p_company_id: activeCompanyId,
      p_year: year,
      p_month: month,
      p_debtor_account_id: debtorAccountId,
    })
    if (error) throw new Error(error.message)

    const dataObj = data as {
      company: { cif: string; razon_social: string }
      debtor: { iban: string; bic?: string | null; titular?: string | null }
      payments: Array<{
        end_to_end_id: string
        amount: number
        iban: string
        creditor_name: string
        creditor_nif?: string
        concept: string
      }>
      count: number
      total_amount: number
    }

    if (dataObj.count === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Sin nóminas elegibles para el periodo',
          details: data,
        },
        { status: 400 },
      )
    }

    const xml = buildPain001Xml({
      company: dataObj.company,
      debtor: dataObj.debtor,
      payments: dataObj.payments,
      count: dataObj.count,
      total_amount: dataObj.total_amount,
      execution_date: body.execution_date,
      message_id_prefix: 'NOMINA',
    })

    // Audit log chain
    await supabase.from('audit_log_chain').insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: 'EXPORT',
      table_name: 'payrolls',
      company_id: activeCompanyId,
      after_data: {
        type: 'sepa_payroll_xml',
        year,
        month,
        count: dataObj.count,
        total_amount: dataObj.total_amount,
      },
      metadata: { source: 'admin_panel_sepa_payroll' },
    })

    const filename = `cathedral_nominas_${year}-${String(month).padStart(2, '0')}.xml`
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-SEPA-Count': String(dataObj.count),
        'X-SEPA-Total-Amount': String(dataObj.total_amount),
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
