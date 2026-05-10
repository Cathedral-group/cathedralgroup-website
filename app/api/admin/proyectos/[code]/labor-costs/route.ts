/**
 * Labor costs por proyecto — roadmap libro_horas Capa 2
 *
 * GET  /api/admin/proyectos/[code]/labor-costs?anio=2026&mes=5
 *      Lista imputaciones laborales del proyecto (filtro mes/año opcional).
 *
 * POST /api/admin/proyectos/[code]/labor-costs
 *      Body: { anio, mes }
 *      Recalcula imputación del mes vía RPC compute_project_labor_costs (idempotente).
 *
 * Auth: admin allow-list + AAL2 + acceso a la company del proyecto.
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

async function resolveCompanyAndProject(
  user: User,
  request: NextRequest,
  code: string,
) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 }
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }

  const supabase = createAdminSupabaseClient()
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, code, company_id')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .single()

  if (projectError || !project) {
    return { error: 'Proyecto no encontrado', status: 404 }
  }

  return { activeCompanyId, project, supabase }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const resolved = await resolveCompanyAndProject(user, request, code)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { project, supabase } = resolved

  const url = new URL(request.url)
  const anio = url.searchParams.get('anio')
  const mes = url.searchParams.get('mes')

  let query = supabase
    .from('project_labor_costs')
    .select(
      `id, anio, mes, horas_ordinarias, horas_extra, horas_nocturnas, horas_total,
       coste_hora_empresa, coste_imputado_total, source, payroll_id, calculado_at,
       employee:employee_id (id, nombre, nif)`,
    )
    .eq('project_id', project.id)
    .is('deleted_at', null)

  if (anio) query = query.eq('anio', parseInt(anio, 10))
  if (mes) query = query.eq('mes', parseInt(mes, 10))

  const { data, error } = await query.order('anio', { ascending: false }).order('mes', {
    ascending: false,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalImputado = (data ?? []).reduce(
    (acc: number, row: { coste_imputado_total: number | null }) =>
      acc + Number(row.coste_imputado_total ?? 0),
    0,
  )
  const totalHoras = (data ?? []).reduce(
    (acc: number, row: { horas_total: number | null }) => acc + Number(row.horas_total ?? 0),
    0,
  )

  return NextResponse.json({
    project: { id: project.id, code: project.code },
    rows: data ?? [],
    totales: {
      coste_imputado: totalImputado,
      horas: totalHoras,
      registros: (data ?? []).length,
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const resolved = await resolveCompanyAndProject(user, request, code)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { activeCompanyId, supabase } = resolved

  let body: { anio?: number; mes?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  const anio = Number(body.anio)
  const mes = Number(body.mes)
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    return NextResponse.json({ error: 'anio inválido (2020-2100)' }, { status: 400 })
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'mes inválido (1-12)' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('compute_project_labor_costs', {
    p_company_id: activeCompanyId,
    p_anio: anio,
    p_mes: mes,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ result: data })
}

export const dynamic = 'force-dynamic'
