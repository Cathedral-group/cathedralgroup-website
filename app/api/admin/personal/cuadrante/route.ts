/**
 * Cuadrante semanal — roadmap libro_horas Fase 1
 *
 * GET    /api/admin/personal/cuadrante?desde=&hasta=
 *        Lista asignaciones trabajador→proyecto por día de la empresa activa.
 *
 * POST   /api/admin/personal/cuadrante
 *        Body: { employee_id, fecha, project_id?, jornada_esperada_horas?, notas? }
 *        UPSERT por (employee_id, fecha). Crea o actualiza la asignación del día.
 *
 * DELETE /api/admin/personal/cuadrante?id=...
 *        Soft-delete asignación.
 *
 * Auth: admin allow-list + AAL2 + acceso company activa.
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

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('worker_assignments')
    .select(
      `id, fecha, project_id, employee_id, jornada_esperada_horas, notas, created_at,
       employee:employee_id (id, nombre, nif),
       project:project_id (id, code, name)`,
    )
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)

  const { data, error } = await query.order('fecha', { ascending: true })
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
    fecha?: string
    project_id?: string | null
    jornada_esperada_horas?: number
    notas?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  if (!body.employee_id) return NextResponse.json({ error: 'employee_id requerido' }, { status: 400 })
  if (!body.fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  // Verificar empleado pertenece a la company
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('id', body.employee_id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Empleado no válido' }, { status: 400 })

  // Verificar proyecto si se da
  if (body.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('company_id', resolved.activeCompanyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!proj) return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })
  }

  // UPSERT por (employee_id, fecha)
  const { data: existing } = await supabase
    .from('worker_assignments')
    .select('id')
    .eq('employee_id', body.employee_id)
    .eq('fecha', body.fecha)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('worker_assignments')
      .update({
        project_id: body.project_id ?? null,
        jornada_esperada_horas: body.jornada_esperada_horas ?? 8,
        notas: body.notas ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'updated', row: data })
  }

  const { data, error } = await supabase
    .from('worker_assignments')
    .insert({
      company_id: resolved.activeCompanyId,
      employee_id: body.employee_id,
      project_id: body.project_id ?? null,
      fecha: body.fecha,
      jornada_esperada_horas: body.jornada_esperada_horas ?? 8,
      notas: body.notas ?? null,
      created_by_email: user.email ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'created', row: data })
}

export async function DELETE(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('worker_assignments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
