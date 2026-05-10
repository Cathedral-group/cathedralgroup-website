/**
 * POST /api/portal/trabajador/[token]/parte
 *
 * Crea/actualiza parte de horas del día en curso para el trabajador.
 *
 * Body: {
 *   fecha?: 'YYYY-MM-DD',  // default: hoy. Solo se permite hoy o ayer (anti-manipulación)
 *   project_id?: string | null,
 *   horas_ordinarias: number,
 *   horas_extra?: number,
 *   horas_nocturnas?: number,
 *   observaciones?: string,
 * }
 *
 * Reglas:
 *   - El trabajador SOLO puede crear/editar partes de HOY o AYER (mitiga manipulación retro)
 *   - Si ya existe parte (UNIQUE employee_id, fecha) → UPDATE; si no → INSERT
 *   - fuente='app_movil' (registro desde portal)
 *   - registrado_por = email del trabajador (info, no auth)
 *
 * Aislamiento: NO usa createServerSupabaseClient. Auth solo por token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

interface ParteBody {
  fecha?: string
  project_id?: string | null
  horas_ordinarias?: number
  horas_extra?: number
  horas_nocturnas?: number
  observaciones?: string
  horas_extra_modo?: 'compensar' | 'pagar'
  geo_lat?: number
  geo_lng?: number
  geo_accuracy?: number
}

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

  const { data: validation, error: vErr } = await supabase.rpc(
    'validate_and_track_worker_token',
    { p_token: token, p_ip: ip, p_user_agent: ua },
  )

  if (vErr || !validation?.valid) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  let body: ParteBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  // Validación fecha: solo hoy o ayer
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const fecha = body.fecha ?? todayStr

  if (fecha !== todayStr && fecha !== yesterdayStr) {
    return NextResponse.json(
      { error: 'Solo se permite registrar partes de hoy o ayer' },
      { status: 400 },
    )
  }

  // Validación horas
  const hOrd = Number(body.horas_ordinarias ?? 0)
  const hExt = Number(body.horas_extra ?? 0)
  const hNoc = Number(body.horas_nocturnas ?? 0)
  if (hOrd < 0 || hExt < 0 || hNoc < 0) {
    return NextResponse.json({ error: 'Las horas no pueden ser negativas' }, { status: 400 })
  }
  if (hOrd + hExt + hNoc > 24) {
    return NextResponse.json({ error: 'Total de horas supera 24h en un día' }, { status: 400 })
  }
  if (hOrd + hExt + hNoc === 0) {
    return NextResponse.json({ error: 'Indica al menos una hora trabajada' }, { status: 400 })
  }

  // Validar modo extras: solo si hay extras (>0)
  let horasExtraModo: 'compensar' | 'pagar' | null = null
  if (hExt > 0) {
    horasExtraModo = body.horas_extra_modo ?? 'compensar' // default: compensar (preferencia trabajadores Cathedral)
    if (horasExtraModo !== 'compensar' && horasExtraModo !== 'pagar') {
      return NextResponse.json({ error: 'horas_extra_modo inválido' }, { status: 400 })
    }
  }

  // Validar project_id pertenece a la company del trabajador
  if (body.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!proj) {
      return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })
    }
  }

  const registradoPor = `portal:${validation.employee_nombre ?? employeeId}`

  // Geofence check (opcional, solo si proyecto + coords)
  let geofenceStatus: string | null = null
  let geofenceDistance: number | null = null
  const geoLat = Number(body.geo_lat)
  const geoLng = Number(body.geo_lng)
  const geoAcc = body.geo_accuracy ? Math.round(Number(body.geo_accuracy)) : null
  const geoOk = Number.isFinite(geoLat) && Number.isFinite(geoLng)

  if (geoOk && body.project_id) {
    const { data: geofence } = await supabase.rpc('check_geofence', {
      p_project_id: body.project_id,
      p_lat: geoLat,
      p_lng: geoLng,
      p_accuracy_m: geoAcc,
    })
    if (geofence) {
      geofenceStatus = geofence.status
      geofenceDistance = geofence.distance_m
    }
  } else if (geoOk) {
    geofenceStatus = 'no_data'
  }

  // UPSERT por (employee_id, fecha) — UNIQUE existente
  const { data: existing } = await supabase
    .from('time_records')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('fecha', fecha)
    .is('deleted_at', null)
    .maybeSingle()

  const nowIso = new Date().toISOString()

  if (existing) {
    const { data, error } = await supabase
      .from('time_records')
      .update({
        project_id: body.project_id ?? null,
        horas_ordinarias: hOrd,
        horas_extra: hExt,
        horas_nocturnas: hNoc,
        horas_extra_modo: horasExtraModo,
        observaciones: body.observaciones ?? null,
        fuente: 'app_movil',
        modificado_at: nowIso,
        modificado_por: registradoPor,
        worker_signed_at: nowIso,
        device_geo_lat: geoOk ? geoLat : null,
        device_geo_lng: geoOk ? geoLng : null,
        device_geo_accuracy_m: geoAcc,
        geofence_distance_m: geofenceDistance,
        geofence_status: geofenceStatus,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'updated', row: data })
  }

  const { data, error } = await supabase
    .from('time_records')
    .insert({
      company_id: companyId,
      employee_id: employeeId,
      fecha,
      project_id: body.project_id ?? null,
      horas_ordinarias: hOrd,
      horas_extra: hExt,
      horas_nocturnas: hNoc,
      horas_extra_modo: horasExtraModo,
      observaciones: body.observaciones ?? null,
      fuente: 'app_movil',
      registrado_por: registradoPor,
      worker_signed_at: nowIso,
      device_geo_lat: geoOk ? geoLat : null,
      device_geo_lng: geoOk ? geoLng : null,
      device_geo_accuracy_m: geoAcc,
      geofence_distance_m: geofenceDistance,
      geofence_status: geofenceStatus,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'created', row: data })
}

export const dynamic = 'force-dynamic'
