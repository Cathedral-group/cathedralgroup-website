/**
 * GET /api/portal/trabajador/[token]/historial?anio=2026&mes=5
 *
 * Devuelve todos los partes del mes solicitado para el trabajador autenticado por token.
 * Cumplimiento art. 34.9 ET: el trabajador debe tener acceso a su registro horario.
 *
 * Aislamiento: NO usa Supabase Auth. Solo token UUID.
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

  const { data: validation, error: vErr } = await supabase.rpc(
    'validate_and_track_worker_token',
    { p_token: token, p_ip: ip, p_user_agent: ua },
  )
  if (vErr || !validation?.valid) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const today = new Date()
  const anio = parseInt(url.searchParams.get('anio') ?? String(today.getFullYear()), 10)
  const mes = parseInt(url.searchParams.get('mes') ?? String(today.getMonth() + 1), 10)

  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    return NextResponse.json({ error: 'anio inválido' }, { status: 400 })
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'mes inválido' }, { status: 400 })
  }

  const employeeId: string = validation.employee_id

  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay = new Date(anio, mes, 0).getDate()
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: rows, error } = await supabase
    .from('time_records')
    .select(
      `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas,
       observaciones, fuente, hash_registro, worker_signed_at, modificado_at, modificado_motivo,
       project:project_id (code, name)`,
    )
    .eq('employee_id', employeeId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .is('deleted_at', null)
    .order('fecha', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totalHoras = (rows ?? []).reduce((acc, r) => {
    return acc +
      Number(r.horas_ordinarias ?? 0) +
      Number(r.horas_extra ?? 0) +
      Number(r.horas_nocturnas ?? 0)
  }, 0)

  return NextResponse.json({
    employee: {
      nombre: validation.employee_nombre,
      nif: validation.employee_nif,
    },
    anio,
    mes,
    desde,
    hasta,
    rows: rows ?? [],
    total_horas: totalHoras,
    total_dias: (rows ?? []).length,
  })
}

export const dynamic = 'force-dynamic'
