/**
 * POST /api/admin/personal/tickets-trabajador/[id]/create-invoice
 *
 * Body: datos editados por el admin (override de extracted_data) + project_id
 * Crea fila en `invoices` con direction='recibida' y review_status='pendiente'.
 * Vincula el worker_attachment al invoice creado y marca status='confirmed'.
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

  let body: {
    proveedor_nombre?: string
    proveedor_nif?: string
    numero_factura?: string
    fecha_emision?: string
    importe_base?: number
    iva_pct?: number
    iva_importe?: number
    importe_total?: number
    categoria_gasto?: string
    project_id?: string | null
    concepto?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: attachment } = await supabase
    .from('worker_attachments')
    .select('id, storage_path, storage_bucket, employee_id, project_id')
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!attachment) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  // Validaciones mínimas
  if (!body.fecha_emision) {
    return NextResponse.json({ error: 'fecha_emision requerida' }, { status: 400 })
  }
  if (!body.importe_total || body.importe_total <= 0) {
    return NextResponse.json({ error: 'importe_total requerido (>0)' }, { status: 400 })
  }

  const projectId = body.project_id ?? attachment.project_id ?? null

  // INSERT en invoices
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      company_id: resolved.activeCompanyId,
      direction: 'recibida',
      doc_type: 'factura',
      number: body.numero_factura ?? null,
      issue_date: body.fecha_emision,
      supplier_nif: body.proveedor_nif ?? null,
      empresa: body.proveedor_nombre ?? null,
      concept: body.concepto ?? `Ticket subido por trabajador`,
      amount_base: body.importe_base ?? null,
      vat_amount: body.iva_importe ?? null,
      amount_total: body.importe_total,
      categoria_gasto: body.categoria_gasto ?? null,
      project_id: projectId,
      payment_status: 'pendiente',
      review_status: 'pendiente',
      needs_review: true,
      source: 'worker_portal',
      ai_confidence: 0.7,
    })
    .select('id, number')
    .single()

  if (invError) {
    return NextResponse.json({ error: `Error creando factura: ${invError.message}` }, { status: 500 })
  }

  // Vincular attachment + marcar confirmed
  await supabase
    .from('worker_attachments')
    .update({
      invoice_id: invoice.id,
      status: 'confirmed',
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: user.email ?? null,
      reviewer_action: 'confirmed_to_invoice',
      project_id: projectId,
    })
    .eq('id', id)

  return NextResponse.json({
    ok: true,
    invoice_id: invoice.id,
    invoice_number: invoice.number,
  })
}

export const dynamic = 'force-dynamic'
