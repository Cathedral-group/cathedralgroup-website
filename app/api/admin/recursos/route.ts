/**
 * Recursos de planificación — externos (placeholder "Trabajador N") + empleados.
 *
 * GET    /api/admin/recursos          → lista recursos de la empresa activa (empleados + externos)
 * POST   /api/admin/recursos          → crea un externo { display_name, trade?, lent_by? } (tope 20 activos)
 * PATCH  /api/admin/recursos          → edita un externo { id, display_name?, trade?, lent_by?, active? }
 * DELETE /api/admin/recursos?id=...    → baja (soft-delete) un externo
 *
 * Los empleados NO se crean/borran aquí (se gestionan en personal y se sincronizan
 * a resources por trigger). Solo se permiten altas/bajas/edición de externos.
 *
 * Auth: admin allow-list + AAL2 + empresa activa.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { resolveCompanyIdForRequest, getCompanyContextFromUser, CATHEDRAL_INVESTMENT_SL_ID } from '@/lib/company-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_EXTERNOS = 20

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function resolveCompany(user: User, request: NextRequest) {
  let id: string | null = null
  try { id = resolveCompanyIdForRequest(user, request.headers) } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 } as const
  }
  if (!id) id = getCompanyContextFromUser(user)?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  return { companyId: id } as const
}

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = resolveCompany(user, request)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('resources')
    .select('id, type, display_name, trade, lent_by, active, employee_id')
    .eq('company_id', r.companyId)
    .is('deleted_at', null)
    .order('type', { ascending: true })
    .order('display_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = resolveCompany(user, request)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  let body: { display_name?: string; trade?: string | null; lent_by?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const name = (body.display_name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { count } = await supabase
    .from('resources')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', r.companyId).eq('type', 'externo').is('deleted_at', null)
  if ((count ?? 0) >= MAX_EXTERNOS) {
    return NextResponse.json({ error: `Máximo ${MAX_EXTERNOS} trabajadores externos` }, { status: 400 })
  }

  const { data, error } = await supabase.from('resources').insert({
    company_id: r.companyId,
    type: 'externo',
    display_name: name,
    trade: body.trade?.trim() || null,
    lent_by: body.lent_by?.trim() || null,
    active: true,
  }).select('id, type, display_name, trade, lent_by, active, employee_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}

export async function PATCH(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = resolveCompany(user, request)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  let body: { id?: string; display_name?: string; trade?: string | null; lent_by?: string | null; active?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  // Solo externos editables aquí
  const { data: res } = await supabase.from('resources')
    .select('id, type').eq('id', body.id).eq('company_id', r.companyId).is('deleted_at', null).maybeSingle()
  if (!res) return NextResponse.json({ error: 'Recurso no encontrado' }, { status: 404 })
  if (res.type !== 'externo') return NextResponse.json({ error: 'Solo se editan recursos externos' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.display_name !== undefined) {
    const n = body.display_name.trim()
    if (!n) return NextResponse.json({ error: 'Nombre vacío' }, { status: 400 })
    patch.display_name = n
  }
  if (body.trade !== undefined) patch.trade = body.trade?.trim() || null
  if (body.lent_by !== undefined) patch.lent_by = body.lent_by?.trim() || null
  if (body.active !== undefined) patch.active = body.active

  const { data, error } = await supabase.from('resources').update(patch)
    .eq('id', body.id).eq('company_id', r.companyId)
    .select('id, type, display_name, trade, lent_by, active, employee_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}

export async function DELETE(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = resolveCompany(user, request)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { data: res } = await supabase.from('resources')
    .select('id, type').eq('id', id).eq('company_id', r.companyId).is('deleted_at', null).maybeSingle()
  if (!res) return NextResponse.json({ error: 'Recurso no encontrado' }, { status: 404 })
  if (res.type !== 'externo') return NextResponse.json({ error: 'Los empleados se gestionan en Personal' }, { status: 400 })

  const { error } = await supabase.from('resources')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('company_id', r.companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
