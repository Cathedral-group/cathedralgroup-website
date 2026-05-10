/**
 * Dietario partes de horas — roadmap libro_horas Capa 2
 *
 * GET /api/admin/personal/dietario?desde=2026-05-01&hasta=2026-05-31&employee_id=&project_id=&imputable=true|false
 *     Lista time_records de la empresa activa con filtros.
 *
 * PATCH /api/admin/personal/dietario
 *     Body: { id, project_id?, horas_ordinarias?, horas_extra?, horas_nocturnas?, observaciones? }
 *     Actualiza un parte de horas (admin reasigna proyecto o corrige horas).
 *     El trigger BD recomputa hash_registro automáticamente si está configurado;
 *     en caso contrario solo se actualizan los campos.
 *
 * POST /api/admin/personal/dietario
 *     Body: { employee_id, fecha, project_id?, horas_ordinarias, horas_extra?, horas_nocturnas?, observaciones? }
 *     Crea un parte de horas manual (fuente='manual', registrado_por=email admin).
 *
 * Auth: admin allow-list + AAL2 + cualquier role en la company activa.
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
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { activeCompanyId } = resolved

  const url = new URL(request.url)
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  const employeeId = url.searchParams.get('employee_id')
  const projectId = url.searchParams.get('project_id')
  const imputable = url.searchParams.get('imputable')

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('time_records')
    .select(
      `id, fecha, project_id, employee_id, horas_ordinarias, horas_extra, horas_nocturnas,
       observaciones, fuente, hash_registro, registrado_por, created_at, modificado_at,
       employee:employee_id (id, nombre, nif),
       project:project_id (id, code, name)`,
    )
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (projectId) query = query.eq('project_id', projectId)
  if (imputable === 'true') query = query.not('project_id', 'is', null)
  if (imputable === 'false') query = query.is('project_id', null)

  const { data, error } = await query.order('fecha', { ascending: false }).limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sumHoras = (data ?? []).reduce(
    (acc: number, r: { horas_ordinarias: number | null; horas_extra: number | null; horas_nocturnas: number | null }) =>
      acc +
      Number(r.horas_ordinarias ?? 0) +
      Number(r.horas_extra ?? 0) +
      Number(r.horas_nocturnas ?? 0),
    0,
  )
  const sinProyecto = (data ?? []).filter(
    (r: { project_id: string | null }) => !r.project_id,
  ).length

  return NextResponse.json({
    rows: data ?? [],
    totales: {
      registros: (data ?? []).length,
      horas: sumHoras,
      sin_proyecto: sinProyecto,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = resolveCompany(user, request)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { activeCompanyId } = resolved

  let body: {
    id?: string
    project_id?: string | null
    horas_ordinarias?: number
    horas_extra?: number
    horas_nocturnas?: number
    observaciones?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  const update: Record<string, unknown> = {
    modificado_at: new Date().toISOString(),
    modificado_por: user.email ?? null,
    modificado_motivo: 'Edición desde admin dietario',
  }
  if ('project_id' in body) update.project_id = body.project_id
  if ('horas_ordinarias' in body) update.horas_ordinarias = body.horas_ordinarias
  if ('horas_extra' in body) update.horas_extra = body.horas_extra
  if ('horas_nocturnas' in body) update.horas_nocturnas = body.horas_nocturnas
  if ('observaciones' in body) update.observaciones = body.observaciones

  const { data, error } = await supabase
    .from('time_records')
    .update(update)
    .eq('id', body.id)
    .eq('company_id', activeCompanyId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ row: data })
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = resolveCompany(user, request)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { activeCompanyId } = resolved

  let body: {
    employee_id?: string
    fecha?: string
    project_id?: string | null
    horas_ordinarias?: number
    horas_extra?: number
    horas_nocturnas?: number
    observaciones?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!body.employee_id) return NextResponse.json({ error: 'employee_id requerido' }, { status: 400 })
  if (!body.fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('time_records')
    .insert({
      company_id: activeCompanyId,
      employee_id: body.employee_id,
      fecha: body.fecha,
      project_id: body.project_id ?? null,
      horas_ordinarias: body.horas_ordinarias ?? 0,
      horas_extra: body.horas_extra ?? 0,
      horas_nocturnas: body.horas_nocturnas ?? 0,
      observaciones: body.observaciones ?? null,
      fuente: 'manual',
      registrado_por: user.email ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ row: data })
}

export const dynamic = 'force-dynamic'
