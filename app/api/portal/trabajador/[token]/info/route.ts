/**
 * GET /api/portal/trabajador/[token]/info
 *
 * Endpoint público (NO requiere sesión Supabase) — autentica solo por token.
 * Devuelve datos básicos del trabajador + parte de hoy + resumen últimos 7 días.
 *
 * Aislamiento: NO usa createServerSupabaseClient (que lee cookie auth admin).
 * Solo createAdminSupabaseClient (service_role para queries específicas).
 * Token validado vía RPC validate_and_track_worker_token (idempotente).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = request.headers.get('user-agent') ?? null

  const { data: validation, error: validationError } = await supabase.rpc(
    'validate_and_track_worker_token',
    { p_token: token, p_ip: ip, p_user_agent: ua },
  )

  if (validationError || !validation?.valid) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  // Proyectos disponibles para el trabajador (de su empresa)
  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name, description, status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('code', { ascending: false })
    .limit(50)

  // Parte de hoy
  const today = new Date().toISOString().slice(0, 10)
  const { data: parteHoy } = await supabase
    .from('time_records')
    .select(
      'id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas, observaciones, fuente',
    )
    .eq('employee_id', employeeId)
    .eq('fecha', today)
    .is('deleted_at', null)
    .maybeSingle()

  // Últimos 7 días
  const sieteAtras = new Date()
  sieteAtras.setDate(sieteAtras.getDate() - 7)
  const desde = sieteAtras.toISOString().slice(0, 10)

  const { data: ultimosDias } = await supabase
    .from('time_records')
    .select(
      `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas, observaciones,
       project:project_id (code, name)`,
    )
    .eq('employee_id', employeeId)
    .gte('fecha', desde)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })

  return NextResponse.json({
    employee: {
      nombre: validation.employee_nombre,
    },
    today,
    parte_hoy: parteHoy ?? null,
    ultimos_dias: ultimosDias ?? [],
    projects: projects ?? [],
  })
}

export const dynamic = 'force-dynamic'
