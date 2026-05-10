/**
 * POST /api/fiscal/mark-presented — Bloque 2 (gestión integral fiscal)
 *
 * Marca un modelo AEAT como presentado: crea fila en `tax_filings` con
 * estado='presentado'. Tras esto, `upcoming_fiscal_deadlines()` ya no
 * devolverá ese deadline como pendiente.
 *
 * Auth: admin allow-list + AAL2 + role admin/contable de la company activa.
 *
 * Body:
 * {
 *   modelo: string,                 // '303', '111', etc
 *   ejercicio: number,              // 2026
 *   periodo: string,                // '1T', '2T', '3T', '4T', 'A' (anual), '01'-'12' (mensual)
 *   fecha_presentacion?: string,    // ISO date, default hoy
 *   importe_a_ingresar?: number,
 *   importe_a_devolver?: number,
 *   base_total?: number,
 *   retencion_total?: number,
 *   csv_aeat?: string,
 *   justificante_aeat_url?: string,
 *   notes?: string
 * }
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

interface Body {
  modelo?: string
  ejercicio?: number
  periodo?: string
  fecha_presentacion?: string
  importe_a_ingresar?: number
  importe_a_devolver?: number
  base_total?: number
  retencion_total?: number
  csv_aeat?: string
  justificante_aeat_url?: string
  modelo_pdf_url?: string
  modelo_drive_id?: string
  notes?: string
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

  if (!body.modelo || !body.ejercicio || !body.periodo) {
    return NextResponse.json(
      { error: 'modelo, ejercicio y periodo son obligatorios' },
      { status: 400 },
    )
  }

  // Resolver company activa: header o default Cathedral
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
    // Fallback: primera company del user, o Cathedral
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }

  // Verificar que el user tiene rol admin/contable/owner en la empresa
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
      { error: 'Forbidden: requiere rol owner/admin/contable de la empresa' },
      { status: 403 },
    )
  }

  // Obtener CIF + nombre de la empresa para empresa_cif (NOT NULL en tax_filings)
  const { data: company, error: cErr } = await supabase
    .from('companies')
    .select('cif, razon_social')
    .eq('id', activeCompanyId)
    .single()
  if (cErr || !company) {
    return NextResponse.json({ error: 'Company no encontrada' }, { status: 404 })
  }

  const fechaPresentacion = body.fecha_presentacion ?? new Date().toISOString().slice(0, 10)

  try {
    const { data: created, error: insErr } = await supabase
      .from('tax_filings')
      .insert({
        company_id: activeCompanyId,
        empresa_cif: company.cif,
        empresa_nombre: company.razon_social,
        modelo: body.modelo,
        ejercicio: body.ejercicio,
        periodo: body.periodo,
        fecha_presentacion: fechaPresentacion,
        importe_a_ingresar: body.importe_a_ingresar ?? null,
        importe_a_devolver: body.importe_a_devolver ?? null,
        base_total: body.base_total ?? null,
        retencion_total: body.retencion_total ?? null,
        csv_aeat: body.csv_aeat ?? null,
        justificante_aeat_url: body.justificante_aeat_url ?? null,
        modelo_pdf_url: body.modelo_pdf_url ?? null,
        modelo_drive_id: body.modelo_drive_id ?? null,
        estado: 'presentado',
        notes: body.notes ?? `Marcado presentado por ${user.email} el ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
        source: 'admin_panel_mark_presented',
      })
      .select()
      .single()
    if (insErr) {
      // Si ya existe (UNIQUE constraint posible), actualizar
      if (insErr.code === '23505') {
        return NextResponse.json(
          { error: `Ya existe un filing para ${body.modelo} ${body.periodo} ${body.ejercicio}` },
          { status: 409 },
        )
      }
      throw new Error(insErr.message)
    }

    // Audit log chain
    await supabase.from('audit_log_chain').insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: 'AEAT_PRESENT',
      table_name: 'tax_filings',
      record_id: created.id,
      company_id: activeCompanyId,
      after_data: created,
      metadata: {
        source: 'mark_presented_endpoint',
        modelo: body.modelo,
        ejercicio: body.ejercicio,
        periodo: body.periodo,
      },
    })

    // Audit log admin (legacy)
    await supabase.from('admin_audit_log').insert({
      user_email: user.email,
      action: 'create',
      table_name: 'tax_filings',
      record_id: created.id,
    })

    // Resolver dedup_key para auto-dismiss notifications fiscal pendientes de ese modelo
    // (cuando F4 + cron fiscal-deadlines esté activo, las dedup_key serán algo como
    // 'fiscal_303_2026_T2'. Por ahora solo INSERT, dismiss vendrá después.)

    return NextResponse.json({ ok: true, filing: created }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
