/**
 * GET /api/admin/personal/alerts
 *
 * Devuelve alertas operativas del módulo personal:
 *   - Trabajadores sin parte ayer (si ayer era laborable según calendario)
 *   - Solicitudes de ausencia pendientes
 *   - Tickets/albaranes pendientes de revisión
 *   - Gastos pendientes de reembolso
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

  const supabase = createAdminSupabaseClient()

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  // 1. Comprobar si ayer era laborable
  const { data: jornadaAyer } = await supabase.rpc('get_jornada_esperada_horas', {
    p_fecha: yesterdayStr,
    p_company_id: resolved.activeCompanyId,
  })
  const ayerLaborable = Number(jornadaAyer ?? 0) > 0

  // Trabajadores activos sin parte ayer (solo si ayer laborable)
  let sinParteAyer: { id: string; nombre: string | null; nif: string | null }[] = []
  if (ayerLaborable) {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, nombre, nif, fecha_baja')
      .eq('company_id', resolved.activeCompanyId)
      .is('deleted_at', null)
    const activos = (employees ?? []).filter((e) => !e.fecha_baja)

    // Quienes apuntaron parte ayer
    const { data: partesAyer } = await supabase
      .from('time_records')
      .select('employee_id')
      .eq('company_id', resolved.activeCompanyId)
      .eq('fecha', yesterdayStr)
      .is('deleted_at', null)

    const apuntaronIds = new Set((partesAyer ?? []).map((p) => p.employee_id))

    // Quienes tenían ausencia aprobada ayer (vacaciones/baja/permiso)
    const { data: ausencias } = await supabase
      .from('worker_absences')
      .select('employee_id')
      .eq('company_id', resolved.activeCompanyId)
      .eq('status', 'approved')
      .lte('fecha_inicio', yesterdayStr)
      .gte('fecha_fin', yesterdayStr)
      .is('deleted_at', null)

    const ausentesIds = new Set((ausencias ?? []).map((a) => a.employee_id))

    sinParteAyer = activos
      .filter((e) => !apuntaronIds.has(e.id) && !ausentesIds.has(e.id))
      .map((e) => ({ id: e.id, nombre: e.nombre, nif: e.nif }))
  }

  // 2. Solicitudes ausencia pendientes
  const { data: ausenciasPendientes } = await supabase
    .from('worker_absences')
    .select('id, tipo, fecha_inicio, fecha_fin, employee:employee_id (nombre)')
    .eq('company_id', resolved.activeCompanyId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('fecha_inicio', { ascending: true })
    .limit(10)

  // 3. Tickets pendientes (uploaded + extracted sin confirmar)
  const { data: ticketsPendientes, count: ticketsCount } = await supabase
    .from('worker_attachments')
    .select('id, doc_type, status, created_at, employee:employee_id (nombre)', { count: 'exact' })
    .eq('company_id', resolved.activeCompanyId)
    .in('status', ['uploaded', 'extracted', 'processing'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  // 4. Gastos por reembolsar (medio=bolsillo + status=confirmed)
  const { data: gastosPorReembolsar, count: gastosCount } = await supabase
    .from('worker_expense_items')
    .select(
      'id, fecha, tipo, importe, km_recorridos, employee:employee_id (nombre)',
      { count: 'exact' },
    )
    .eq('company_id', resolved.activeCompanyId)
    .eq('medio_pago', 'bolsillo_personal')
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(10)

  return NextResponse.json({
    today,
    yesterday: yesterdayStr,
    ayer_laborable: ayerLaborable,
    sin_parte_ayer: sinParteAyer,
    ausencias_pendientes: {
      count: (ausenciasPendientes ?? []).length,
      sample: ausenciasPendientes ?? [],
    },
    tickets_pendientes: {
      count: ticketsCount ?? 0,
      sample: ticketsPendientes ?? [],
    },
    gastos_por_reembolsar: {
      count: gastosCount ?? 0,
      sample: gastosPorReembolsar ?? [],
    },
  })
}

export const dynamic = 'force-dynamic'
