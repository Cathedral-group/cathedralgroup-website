/**
 * POST /api/portal/trabajador/[token]/fichaje
 *
 * Body: {
 *   tipo: 'entrada' | 'salida',
 *   geo_lat?, geo_lng?, geo_accuracy?,
 *   project_id?: para entrada — proyecto donde está
 * }
 *
 * Modelo:
 *   - 'entrada': UPSERT time_record con hora_entrada = NOW(), entrada_geo_*
 *   - 'salida': UPDATE time_record con hora_salida = NOW(), salida_geo_*
 *     + calcula horas_ordinarias automáticamente (salida - entrada - descanso según jornada esperada)
 *
 * Aislamiento: NO usa Supabase Auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(
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

  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: ip,
    p_user_agent: ua,
  })
  if (!validation?.valid) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id
  const employeeNombre: string = validation.employee_nombre ?? employeeId

  let body: {
    tipo?: 'entrada' | 'salida'
    geo_lat?: number
    geo_lng?: number
    geo_accuracy?: number
    project_id?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (body.tipo !== 'entrada' && body.tipo !== 'salida') {
    return NextResponse.json({ error: 'tipo debe ser "entrada" o "salida"' }, { status: 400 })
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const horaActual = now.toTimeString().slice(0, 8) // HH:MM:SS

  const geoLat = Number(body.geo_lat)
  const geoLng = Number(body.geo_lng)
  const geoAcc = body.geo_accuracy ? Math.round(Number(body.geo_accuracy)) : null
  const geoOk = Number.isFinite(geoLat) && Number.isFinite(geoLng)

  // Geofence si entrada con proyecto
  let geofenceStatus: string | null = null
  if (geoOk && body.project_id) {
    const { data: gf } = await supabase.rpc('check_geofence', {
      p_project_id: body.project_id,
      p_lat: geoLat,
      p_lng: geoLng,
      p_accuracy_m: geoAcc,
    })
    geofenceStatus = gf?.status ?? null
  } else if (geoOk) {
    geofenceStatus = 'no_data'
  }

  // Buscar parte de hoy
  const { data: existing } = await supabase
    .from('time_records')
    .select('id, hora_entrada, hora_salida, project_id')
    .eq('employee_id', employeeId)
    .eq('fecha', today)
    .is('deleted_at', null)
    .maybeSingle()

  const registradoPor = `portal:${employeeNombre}`

  if (body.tipo === 'entrada') {
    if (existing?.hora_entrada) {
      return NextResponse.json(
        {
          error: `Ya tienes fichaje de entrada hoy a las ${existing.hora_entrada.slice(0, 5)}. Si quieres cambiarlo, edítalo a mano.`,
        },
        { status: 400 },
      )
    }

    if (existing) {
      const { error } = await supabase
        .from('time_records')
        .update({
          hora_entrada: horaActual,
          project_id: body.project_id ?? existing.project_id ?? null,
          entrada_geo_lat: geoOk ? geoLat : null,
          entrada_geo_lng: geoOk ? geoLng : null,
          entrada_geo_accuracy_m: geoAcc,
          entrada_geofence_status: geofenceStatus,
        })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        ok: true,
        action: 'entrada',
        hora: horaActual,
        geofence_status: geofenceStatus,
      })
    }

    const { data, error } = await supabase
      .from('time_records')
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        fecha: today,
        hora_entrada: horaActual,
        project_id: body.project_id ?? null,
        entrada_geo_lat: geoOk ? geoLat : null,
        entrada_geo_lng: geoOk ? geoLng : null,
        entrada_geo_accuracy_m: geoAcc,
        entrada_geofence_status: geofenceStatus,
        fuente: 'app_movil',
        registrado_por: registradoPor,
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      action: 'entrada',
      hora: horaActual,
      id: data.id,
      geofence_status: geofenceStatus,
    })
  }

  // SALIDA
  if (!existing?.hora_entrada) {
    return NextResponse.json(
      { error: 'Tienes que fichar entrada antes de fichar salida.' },
      { status: 400 },
    )
  }
  if (existing.hora_salida) {
    return NextResponse.json(
      {
        error: `Ya fichaste salida a las ${existing.hora_salida.slice(0, 5)}. Si quieres cambiarlo, edítalo.`,
      },
      { status: 400 },
    )
  }

  // Calcular horas ordinarias = salida - entrada - descanso
  // Descanso: L-J 1h, V/finde 0
  const dow = now.getDay() // 0=dom, 6=sab
  const descanso = dow >= 1 && dow <= 4 ? 1 : 0 // L-J 1h descanso comer

  const [eh, em] = (existing.hora_entrada as string).split(':').map(Number)
  const [sh, sm] = horaActual.split(':').map(Number)
  const minutos = sh * 60 + sm - (eh * 60 + em) - descanso * 60
  const horasCalculadas = Math.max(0, Math.round((minutos / 60) * 100) / 100)

  // Sacar jornada esperada del día
  const { data: jornada } = await supabase.rpc('get_jornada_esperada_horas', {
    p_fecha: today,
    p_company_id: companyId,
  })
  const jornadaEsperada = Number(jornada ?? 0)

  // Si trabajó más de la jornada esperada → exceso = horas_extra (default 'compensar')
  let horasOrd = horasCalculadas
  let horasExt = 0
  if (jornadaEsperada > 0 && horasCalculadas > jornadaEsperada) {
    horasOrd = jornadaEsperada
    horasExt = Math.round((horasCalculadas - jornadaEsperada) * 100) / 100
  }

  const { error } = await supabase
    .from('time_records')
    .update({
      hora_salida: horaActual,
      horas_ordinarias: horasOrd,
      horas_extra: horasExt,
      horas_extra_modo: horasExt > 0 ? 'compensar' : null,
      salida_geo_lat: geoOk ? geoLat : null,
      salida_geo_lng: geoOk ? geoLng : null,
      salida_geo_accuracy_m: geoAcc,
      salida_geofence_status: geofenceStatus,
      worker_signed_at: now.toISOString(),
    })
    .eq('id', existing.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Devolver banco horas actualizado
  const { data: balance } = await supabase.rpc('get_worker_overtime_balance', {
    p_employee_id: employeeId,
  })

  return NextResponse.json({
    ok: true,
    action: 'salida',
    hora: horaActual,
    horas_calculadas: horasCalculadas,
    horas_ordinarias: horasOrd,
    horas_extra: horasExt,
    descanso_horas: descanso,
    balance: balance ?? null,
    geofence_status: geofenceStatus,
  })
}

export const dynamic = 'force-dynamic'
