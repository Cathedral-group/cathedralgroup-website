/**
 * GET /api/portal/trabajador/[token]/calendario?anio=2026&mes=5
 *
 * Devuelve el mes completo combinando: festivos + asignaciones cuadrante
 * + ausencias aprobadas + partes apuntados + jornada esperada por día.
 *
 * Aislamiento: NO usa Supabase Auth.
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

  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

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

  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
  const lastDay = new Date(anio, mes, 0).getDate()
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Cargar todo en paralelo
  const [holidaysRes, assignmentsRes, absencesRes, partesRes, jornadasRes] = await Promise.all([
    supabase
      .from('holidays')
      .select('fecha, nombre, ambito')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .or(
        'ambito.eq.nacional,and(ambito.eq.autonomico,comunidad_autonoma.eq.MADRID),' +
          `and(ambito.eq.local,municipio.eq.Madrid),and(ambito.eq.convenio,comunidad_autonoma.eq.MADRID),` +
          `and(ambito.eq.no_laborable,comunidad_autonoma.eq.MADRID),and(ambito.eq.empresa,company_id.eq.${companyId})`,
      ),
    supabase
      .from('worker_assignments')
      .select(
        `id, fecha, project_id, jornada_esperada_horas, notas,
         project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null),
    supabase
      .from('worker_absences')
      .select('id, tipo, motivo_detalle, fecha_inicio, fecha_fin, status')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .lte('fecha_inicio', hasta)
      .gte('fecha_fin', desde)
      .is('deleted_at', null),
    supabase
      .from('time_records')
      .select(
        `id, fecha, project_id, horas_ordinarias, horas_extra, horas_nocturnas,
         observaciones, worker_signed_at, project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null),
    // Jornadas esperadas: 1 por día del mes (paralelo)
    Promise.all(
      Array.from({ length: lastDay }, (_, i) => {
        const d = `${anio}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
        return supabase
          .rpc('get_jornada_esperada_horas', { p_fecha: d, p_company_id: companyId })
          .then((r) => ({ fecha: d, horas: Number(r.data ?? 0) }))
      }),
    ),
  ])

  return NextResponse.json({
    anio,
    mes,
    desde,
    hasta,
    holidays: holidaysRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    absences: absencesRes.data ?? [],
    partes: partesRes.data ?? [],
    jornadas: jornadasRes,
  })
}

export const dynamic = 'force-dynamic'
