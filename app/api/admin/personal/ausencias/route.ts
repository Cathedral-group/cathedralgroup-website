/**
 * Admin gestión solicitudes de ausencia.
 *
 * GET  /api/admin/personal/ausencias?status=
 *      Lista solicitudes de la company activa.
 *
 * POST /api/admin/personal/ausencias
 *      Body: { employee_id, tipo, fecha_inicio, fecha_fin, motivo_detalle?, status? }
 *      Crea ausencia directa desde admin (típicamente status='approved').
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

const ALLOWED_TIPOS = [
  'vacaciones',
  'baja_medica',
  'permiso_retribuido',
  'asuntos_propios',
  'ausencia_no_justificada',
  'banco_horas',
]

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
  const status = url.searchParams.get('status')

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('worker_absences')
    .select(
      `id, tipo, motivo_detalle, fecha_inicio, fecha_fin, dias_total, horas_total,
       solicitado_at, solicitado_por, solicitud_fuente, status, decided_at,
       decided_by_email, decision_notes, justificante_attachment_id, created_at,
       employee:employee_id (id, nombre, nif)`,
    )
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)

  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('fecha_inicio', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: {
    employee_id?: string
    tipo?: string
    motivo_detalle?: string
    fecha_inicio?: string
    fecha_fin?: string
    horas_total?: number
    status?: 'pending' | 'approved' | 'rejected'
    decision_notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.employee_id) return NextResponse.json({ error: 'employee_id requerido' }, { status: 400 })
  if (!body.tipo || !ALLOWED_TIPOS.includes(body.tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }
  if (!body.fecha_inicio || !body.fecha_fin) {
    return NextResponse.json({ error: 'fecha_inicio y fecha_fin requeridas' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('id', body.employee_id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Empleado no válido' }, { status: 400 })

  const status = body.status ?? 'approved' // admin crea típicamente aprobada
  const isApproved = status === 'approved'

  const { data, error } = await supabase
    .from('worker_absences')
    .insert({
      company_id: resolved.activeCompanyId,
      employee_id: body.employee_id,
      tipo: body.tipo,
      motivo_detalle: body.motivo_detalle ?? null,
      fecha_inicio: body.fecha_inicio,
      fecha_fin: body.fecha_fin,
      horas_total: body.horas_total ?? null,
      solicitado_por: `admin:${user.email}`,
      solicitud_fuente: 'admin',
      status,
      decided_at: isApproved || status === 'rejected' ? new Date().toISOString() : null,
      decided_by_email: isApproved || status === 'rejected' ? user.email : null,
      decision_notes: body.decision_notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}

export const dynamic = 'force-dynamic'
