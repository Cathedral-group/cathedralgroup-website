/**
 * GET  /api/admin/personal/banco-horas
 *      Lista trabajadores con su saldo de banco horas extras.
 *
 * POST /api/admin/personal/banco-horas
 *      Body: { employee_id, fecha, horas_descontadas, motivo? }
 *      Crea un canje: descuenta horas del banco (cuando trabajador toma día/medio día libre).
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

  const { data: employees } = await supabase
    .from('employees')
    .select('id, nombre, nif, fecha_baja')
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .order('nombre')

  const activos = (employees ?? []).filter((e) => !e.fecha_baja)

  const balances = await Promise.all(
    activos.map(async (e) => {
      const { data: balance } = await supabase.rpc('get_worker_overtime_balance', {
        p_employee_id: e.id,
      })
      return { employee: e, balance }
    }),
  )

  // Cargar últimos canjes
  const { data: redemptions } = await supabase
    .from('worker_overtime_redemptions')
    .select(
      `id, employee_id, fecha, horas_descontadas, motivo, created_at, created_by_email,
       employee:employee_id (id, nombre)`,
    )
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(50)

  return NextResponse.json({
    balances,
    redemptions: redemptions ?? [],
  })
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: {
    employee_id?: string
    fecha?: string
    horas_descontadas?: number
    motivo?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!body.employee_id) return NextResponse.json({ error: 'employee_id requerido' }, { status: 400 })
  if (!body.fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 })
  const horas = Number(body.horas_descontadas)
  if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
    return NextResponse.json({ error: 'horas_descontadas inválidas (1-24)' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Verificar empleado de la company
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('id', body.employee_id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Empleado no válido' }, { status: 400 })

  // Comprobar saldo suficiente
  const { data: balance } = await supabase.rpc('get_worker_overtime_balance', {
    p_employee_id: body.employee_id,
  })
  const saldo = Number(balance?.saldo_horas ?? 0)
  if (saldo < horas) {
    return NextResponse.json(
      { error: `Saldo insuficiente: ${saldo}h disponibles, ${horas}h solicitadas` },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('worker_overtime_redemptions')
    .insert({
      company_id: resolved.activeCompanyId,
      employee_id: body.employee_id,
      fecha: body.fecha,
      horas_descontadas: horas,
      motivo: body.motivo ?? null,
      created_by_email: user.email ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}

export const dynamic = 'force-dynamic'
