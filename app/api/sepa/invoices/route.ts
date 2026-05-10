/**
 * POST /api/sepa/invoices — B11
 *
 * Genera XML SEPA Pain.001.001.03 para pago masivo de facturas seleccionadas
 * a proveedores. Devuelve el XML como descarga.
 *
 * Body: { invoice_ids: ['uuid', ...], debtor_account_id: 'uuid', execution_date?: 'YYYY-MM-DD' }
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
  invoice_ids?: string[]
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

  if (!Array.isArray(body.invoice_ids) || body.invoice_ids.length === 0) {
    return NextResponse.json({ error: 'invoice_ids[] requerido (no vacío)' }, { status: 400 })
  }
  if (body.invoice_ids.length > 200) {
    return NextResponse.json(
      { error: 'Máximo 200 facturas por batch SEPA' },
      { status: 400 },
    )
  }
  if (!body.debtor_account_id) {
    return NextResponse.json({ error: 'debtor_account_id requerido' }, { status: 400 })
  }
  // Validar UUIDs
  for (const id of body.invoice_ids) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: `invoice_id inválido: ${id}` }, { status: 400 })
    }
  }

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
    const { data, error } = await supabase.rpc('prepare_sepa_invoices_data', {
      p_company_id: activeCompanyId,
      p_invoice_ids: body.invoice_ids,
      p_debtor_account_id: body.debtor_account_id,
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
          error: 'Ninguna factura del lote es elegible para SEPA',
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
      message_id_prefix: 'FACT',
    })

    // Audit log chain
    await supabase.from('audit_log_chain').insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: 'EXPORT',
      table_name: 'invoices',
      company_id: activeCompanyId,
      after_data: {
        type: 'sepa_invoices_xml',
        count: dataObj.count,
        total_amount: dataObj.total_amount,
        invoice_ids: body.invoice_ids,
      },
      metadata: { source: 'admin_panel_sepa_invoices' },
    })

    const today = new Date().toISOString().slice(0, 10)
    const filename = `cathedral_facturas_${today}.xml`
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
