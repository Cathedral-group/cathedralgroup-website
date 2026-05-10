/**
 * Coordenadas GPS + radio del geofence de un proyecto.
 *
 * GET    /api/admin/proyectos/[code]/location
 *        Devuelve la ubicación configurada (o null).
 *
 * PUT    /api/admin/proyectos/[code]/location
 *        Body: { lat, lng, radio_m?, direccion? }
 *        UPSERT (un proyecto = una location).
 *
 * DELETE /api/admin/proyectos/[code]/location
 *        Soft-delete.
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

async function loadProject(activeCompanyId: string, code: string) {
  const supabase = createAdminSupabaseClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, code')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  return { supabase, project }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { code } = await params
  const { supabase, project } = await loadProject(resolved.activeCompanyId, code)
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const { data: location } = await supabase
    .from('project_locations')
    .select('id, lat, lng, radio_m, direccion, created_at, created_by_email, updated_at')
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .maybeSingle()

  return NextResponse.json({ project: { id: project.id, code: project.code }, location })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { code } = await params
  const { supabase, project } = await loadProject(resolved.activeCompanyId, code)
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  let body: { lat?: number; lng?: number; radio_m?: number; direccion?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return NextResponse.json({ error: 'lat inválida' }, { status: 400 })
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lng inválida' }, { status: 400 })
  }
  const radio = Number(body.radio_m ?? 300)
  if (!Number.isInteger(radio) || radio < 50 || radio > 2000) {
    return NextResponse.json({ error: 'radio_m inválido (50-2000)' }, { status: 400 })
  }

  // UPSERT por project_id (UNIQUE)
  const { data: existing } = await supabase
    .from('project_locations')
    .select('id')
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('project_locations')
      .update({
        lat, lng, radio_m: radio,
        direccion: body.direccion ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'updated', location: data })
  }

  const { data, error } = await supabase
    .from('project_locations')
    .insert({
      company_id: resolved.activeCompanyId,
      project_id: project.id,
      lat, lng, radio_m: radio,
      direccion: body.direccion ?? null,
      created_by_email: user.email ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'created', location: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { code } = await params
  const { supabase, project } = await loadProject(resolved.activeCompanyId, code)
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const { error } = await supabase
    .from('project_locations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('project_id', project.id)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
