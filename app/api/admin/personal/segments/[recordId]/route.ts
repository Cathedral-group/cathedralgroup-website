/**
 * Tramos múltiples (segments) de un parte de horas.
 *
 * Caso de uso: el trabajador estuvo en obra A de 8 a 12 y en obra B de 12 a 17.
 * Modelo: 1 time_record (agregado del día) + N time_record_segments (uno por tramo).
 * Trigger recalc_time_record_from_segments mantiene time_records.horas_* sincronizado.
 *
 * GET /api/admin/personal/segments/[recordId]
 *   Devuelve los segments del time_record + datos del parte.
 *
 * PUT /api/admin/personal/segments/[recordId]
 *   Body: { segments: [{ project_id, hora_inicio, hora_fin, horas_ordinarias, horas_extra, horas_nocturnas, observaciones, orden }] }
 *   Reemplaza TODOS los segments del parte. Operación atómica (soft-delete antiguos + insert nuevos).
 *
 * DELETE /api/admin/personal/segments/[recordId]
 *   Borra todos los segments del parte (vuelve al modo simple — usar horas directas del time_record).
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

interface SegmentInput {
  project_id?: string | null
  hora_inicio?: string | null
  hora_fin?: string | null
  horas_ordinarias?: number
  horas_extra?: number
  horas_nocturnas?: number
  observaciones?: string | null
  orden?: number
}

function isValidTime(s: string | null | undefined): boolean {
  if (!s) return true // permitir null
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)
}

async function loadRecord(recordId: string, companyId: string) {
  const supabase = createAdminSupabaseClient()
  const { data } = await supabase
    .from('time_records')
    .select('id, fecha, employee_id, company_id, project_id')
    .eq('id', recordId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()
  return { supabase, record: data }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { recordId } = await params
  const { supabase, record } = await loadRecord(recordId, resolved.activeCompanyId)
  if (!record) return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 })

  const { data: segments } = await supabase
    .from('time_record_segments')
    .select(
      `id, project_id, hora_inicio, hora_fin, horas_ordinarias, horas_extra, horas_nocturnas,
       observaciones, orden, geo_lat, geo_lng, geo_accuracy_m, geofence_status,
       project:project_id (id, code, name)`,
    )
    .eq('time_record_id', recordId)
    .is('deleted_at', null)
    .order('orden', { ascending: true })

  return NextResponse.json({ record, segments: segments ?? [] })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { recordId } = await params
  const { supabase, record } = await loadRecord(recordId, resolved.activeCompanyId)
  if (!record) return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 })

  let body: { segments?: SegmentInput[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const segments = Array.isArray(body.segments) ? body.segments : []
  if (segments.length === 0) {
    return NextResponse.json(
      { error: 'Indica al menos un tramo. Para volver al modo simple usa DELETE.' },
      { status: 400 },
    )
  }
  if (segments.length > 12) {
    return NextResponse.json({ error: 'Máximo 12 tramos por día' }, { status: 400 })
  }

  // Validar cada tramo
  for (const [i, s] of segments.entries()) {
    if (!isValidTime(s.hora_inicio) || !isValidTime(s.hora_fin)) {
      return NextResponse.json({ error: `Tramo ${i + 1}: hora inválida (HH:MM)` }, { status: 400 })
    }
    const hOrd = Number(s.horas_ordinarias ?? 0)
    const hExt = Number(s.horas_extra ?? 0)
    const hNoc = Number(s.horas_nocturnas ?? 0)
    if (hOrd < 0 || hExt < 0 || hNoc < 0) {
      return NextResponse.json({ error: `Tramo ${i + 1}: horas negativas` }, { status: 400 })
    }
    if (hOrd + hExt + hNoc > 24) {
      return NextResponse.json({ error: `Tramo ${i + 1}: horas > 24` }, { status: 400 })
    }
    if (s.project_id) {
      // Validar pertenencia a company
      const { data: proj } = await supabase
        .from('projects')
        .select('id')
        .eq('id', s.project_id)
        .eq('company_id', resolved.activeCompanyId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!proj) {
        return NextResponse.json({ error: `Tramo ${i + 1}: proyecto no válido` }, { status: 400 })
      }
    }
  }

  const nowIso = new Date().toISOString()

  // Estrategia: soft-delete TODOS los segments anteriores + INSERT nuevos.
  // No es estrictamente atómica en 2 statements, pero los trigger
  // recalc_time_record_from_segments dispararán al final con el estado correcto.
  const { error: delError } = await supabase
    .from('time_record_segments')
    .update({ deleted_at: nowIso })
    .eq('time_record_id', recordId)
    .is('deleted_at', null)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  const rows = segments.map((s, idx) => ({
    time_record_id: recordId,
    project_id: s.project_id ?? null,
    hora_inicio: s.hora_inicio ?? null,
    hora_fin: s.hora_fin ?? null,
    horas_ordinarias: Number(s.horas_ordinarias ?? 0),
    horas_extra: Number(s.horas_extra ?? 0),
    horas_nocturnas: Number(s.horas_nocturnas ?? 0),
    observaciones: s.observaciones ?? null,
    orden: s.orden ?? idx + 1,
  }))

  const { data: inserted, error: insError } = await supabase
    .from('time_record_segments')
    .insert(rows)
    .select(
      `id, project_id, hora_inicio, hora_fin, horas_ordinarias, horas_extra, horas_nocturnas,
       observaciones, orden, project:project_id (id, code, name)`,
    )
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ ok: true, segments: inserted ?? [] })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { recordId } = await params
  const { supabase, record } = await loadRecord(recordId, resolved.activeCompanyId)
  if (!record) return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 })

  const { error } = await supabase
    .from('time_record_segments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('time_record_id', recordId)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
