/**
 * GET /api/itss/[token]?desde=&hasta=&employee_id=
 *
 * Endpoint read-only para Inspección de Trabajo. Token validado vía RPC.
 * Devuelve registro horario de la empresa (con scope opcional limitado al token).
 *
 * Cumplimiento nuevo RD registro horario digital: ITSS debe poder consultar
 * SIN intervención del empresario. Audit log en cada acceso.
 *
 * Aislamiento: NO usa Supabase Auth. Solo el token ITSS.
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

  const { data: validation, error: vErr } = await supabase.rpc('validate_itss_token', {
    p_token: token,
    p_ip: ip,
  })

  if (vErr || !validation?.valid) {
    return NextResponse.json(
      { error: 'Token ITSS inválido o expirado', reason: validation?.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const desde = url.searchParams.get('desde') ?? validation.scope_desde
  const hasta = url.searchParams.get('hasta') ?? validation.scope_hasta
  const employeeIdFilter = validation.scope_employee_id ?? url.searchParams.get('employee_id')

  let query = supabase
    .from('vw_itss_time_records')
    .select('*')
    .eq('company_id', validation.company_id)

  if (desde) query = query.gte('fecha', desde)
  if (hasta) query = query.lte('fecha', hasta)
  if (employeeIdFilter) query = query.eq('employee_id', employeeIdFilter)

  const { data: records, error } = await query
    .order('fecha', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resumen por empleado
  const byEmployee = new Map<
    string,
    { nombre: string; nif: string; total_horas: number; dias: number }
  >()
  for (const r of records ?? []) {
    const key = r.employee_id
    if (!byEmployee.has(key)) {
      byEmployee.set(key, {
        nombre: r.employee_nombre ?? '',
        nif: r.employee_nif ?? '',
        total_horas: 0,
        dias: 0,
      })
    }
    const stats = byEmployee.get(key)!
    stats.total_horas += Number(r.horas_total ?? 0)
    stats.dias += 1
  }

  return NextResponse.json({
    company: {
      razon_social: validation.company_razon_social,
      cif: validation.company_cif,
    },
    inspector: validation.inspector_nombre,
    scope: {
      desde,
      hasta,
      employee_id: employeeIdFilter,
    },
    expires_at: validation.expires_at,
    summary_by_employee: Array.from(byEmployee.entries()).map(([id, s]) => ({
      employee_id: id,
      ...s,
    })),
    total_records: (records ?? []).length,
    records: records ?? [],
    cumplimiento_nota:
      'Datos extraídos del registro horario art. 34.9 ET. Cada parte lleva hash SHA-256 ' +
      'y firma digital del trabajador (worker_signed_at). Modificaciones registradas en ' +
      'modificado_at + modificado_motivo.',
  })
}

export const dynamic = 'force-dynamic'
