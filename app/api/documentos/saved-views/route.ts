/**
 * /api/documentos/saved-views
 *
 * CRUD para "vistas guardadas" del admin Cathedral en el hub /admin/documentos.
 * Cada vista es un snapshot de filtros + ordenación + columnas. Por defecto
 * privada (solo el creador). Si is_shared=true → visible para todos los admins
 * de la misma company.
 *
 * Auth: allow-list + AAL2 idéntico al resto de /api/db.
 * Multi-empresa: company_id resuelto desde header X-Active-Company-Id o JWT
 * app_metadata.active_company_id.
 *
 * Patrón Linear/Notion. Tabla `saved_views` (migración 20260521040000).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { resolveCompanyIdForRequest, getCompanyContextFromUser } from '@/lib/company-context'
import type { User } from '@supabase/supabase-js'

const VALID_CONTEXTS = new Set(['documents', 'invoices', 'quotes', 'personal', 'fiscal'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * authCheck — devuelve user solo si: sesión válida + allow-list + AAL2.
 * Devuelve null en cualquier fallo para evitar enumeration server-side.
 */
async function authCheck(): Promise<User | null> {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) {
    console.warn('[saved-views authCheck] email NOT in allow-list:', data.user.email)
    return null
  }
  const { data: aal, error: aalErr } =
    await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalErr || !aal || aal.currentLevel !== 'aal2') {
    console.warn('[saved-views authCheck] AAL2 not satisfied:', {
      email: data.user.email,
      currentLevel: aal?.currentLevel,
    })
    return null
  }
  return data.user
}

/**
 * Resuelve la company activa. Falla con error si el usuario no tiene
 * companies asignadas o si el header X-Active-Company-Id no es suyo.
 */
function resolveCompany(user: User, headers: Headers): { companyId: string } | { error: string; status: number } {
  let companyId: string | null
  try {
    companyId = resolveCompanyIdForRequest(user, headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden company', status: 403 }
  }
  if (!companyId) {
    // Sin header → caer a active_company_id del JWT
    const ctx = getCompanyContextFromUser(user)
    if (!ctx || !ctx.active_company_id) {
      return { error: 'Sin empresa activa', status: 400 }
    }
    companyId = ctx.active_company_id
  }
  return { companyId }
}

/* ─────────────────────────────────────────────────────────────────────────
 * GET ?context=documents → lista views del usuario + shared de su company
 * ─────────────────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const companyResult = resolveCompany(user, request.headers)
  if ('error' in companyResult) {
    return NextResponse.json({ error: companyResult.error }, { status: companyResult.status })
  }
  const { companyId } = companyResult

  const context = request.nextUrl.searchParams.get('context') ?? 'documents'
  if (!VALID_CONTEXTS.has(context)) {
    return NextResponse.json({ error: 'Contexto inválido' }, { status: 400 })
  }

  const userEmail = (user.email ?? '').toLowerCase()
  const supabase = createAdminSupabaseClient()
  // Bypass RLS via service_role pero replicamos la lógica de la policy:
  // company_id activa AND (mias O shared)
  const { data, error } = await supabase
    .from('saved_views')
    .select('*')
    .eq('company_id', companyId)
    .eq('context', context)
    .or(`user_email.eq.${userEmail},is_shared.eq.true`)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[saved-views GET] query error:', error.message, error.details)
    return NextResponse.json({ error: 'Error al cargar vistas' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

/* ─────────────────────────────────────────────────────────────────────────
 * POST { name, description?, context, filters, is_shared? } → crea vista
 * ─────────────────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const companyResult = resolveCompany(user, request.headers)
  if ('error' in companyResult) {
    return NextResponse.json({ error: companyResult.error }, { status: companyResult.status })
  }
  const { companyId } = companyResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'name requerido (1-100 chars)' }, { status: 400 })
  }
  const description = typeof body.description === 'string' ? body.description.trim() : null
  if (description && description.length > 500) {
    return NextResponse.json({ error: 'description máx 500 chars' }, { status: 400 })
  }
  const context = typeof body.context === 'string' ? body.context : 'documents'
  if (!VALID_CONTEXTS.has(context)) {
    return NextResponse.json({ error: 'context inválido' }, { status: 400 })
  }
  if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters)) {
    return NextResponse.json({ error: 'filters requerido (objeto JSON)' }, { status: 400 })
  }
  const is_shared = body.is_shared === true

  const userEmail = (user.email ?? '').toLowerCase()
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('saved_views')
    .insert({
      company_id: companyId,
      user_email: userEmail,
      name,
      description,
      context,
      filters: body.filters,
      is_shared,
    })
    .select()
    .single()

  if (error) {
    console.error('[saved-views POST] insert error:', error.message, error.details)
    return NextResponse.json({ error: 'Error al guardar la vista' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/* ─────────────────────────────────────────────────────────────────────────
 * PATCH ?id=uuid { name?, description?, filters?, is_shared? } → actualiza
 * ─────────────────────────────────────────────────────────────────────── */
export async function PATCH(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id UUID requerido' }, { status: 400 })
  }

  const companyResult = resolveCompany(user, request.headers)
  if ('error' in companyResult) {
    return NextResponse.json({ error: companyResult.error }, { status: companyResult.status })
  }
  const { companyId } = companyResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Whitelist de campos editables
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name || name.length > 100) {
      return NextResponse.json({ error: 'name 1-100 chars' }, { status: 400 })
    }
    updates.name = name
  }
  if (body.description !== undefined) {
    if (body.description === null) {
      updates.description = null
    } else if (typeof body.description === 'string') {
      const d = body.description.trim()
      if (d.length > 500) {
        return NextResponse.json({ error: 'description máx 500 chars' }, { status: 400 })
      }
      updates.description = d || null
    } else {
      return NextResponse.json({ error: 'description debe ser string o null' }, { status: 400 })
    }
  }
  if (body.filters !== undefined) {
    if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters)) {
      return NextResponse.json({ error: 'filters debe ser objeto JSON' }, { status: 400 })
    }
    updates.filters = body.filters
  }
  if (body.is_shared !== undefined) {
    if (typeof body.is_shared !== 'boolean') {
      return NextResponse.json({ error: 'is_shared debe ser boolean' }, { status: 400 })
    }
    updates.is_shared = body.is_shared
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const userEmail = (user.email ?? '').toLowerCase()
  const supabase = createAdminSupabaseClient()

  // Verificar ownership ANTES de actualizar (defensa en profundidad sobre service_role).
  // Solo el creador puede editar — incluso si es_shared=true.
  const { data: existing, error: existErr } = await supabase
    .from('saved_views')
    .select('user_email, company_id')
    .eq('id', id)
    .maybeSingle()
  if (existErr) {
    console.error('[saved-views PATCH] lookup error:', existErr.message)
    return NextResponse.json({ error: 'Error al verificar la vista' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Vista no encontrada' }, { status: 404 })
  }
  if (existing.company_id !== companyId) {
    return NextResponse.json({ error: 'Forbidden: vista de otra empresa' }, { status: 403 })
  }
  if ((existing.user_email as string).toLowerCase() !== userEmail) {
    return NextResponse.json({ error: 'Forbidden: solo el creador puede editar' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('saved_views')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[saved-views PATCH] update error:', error.message, error.details)
    return NextResponse.json({ error: 'Error al actualizar la vista' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/* ─────────────────────────────────────────────────────────────────────────
 * DELETE ?id=uuid → borra (solo creador)
 * ─────────────────────────────────────────────────────────────────────── */
export async function DELETE(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id UUID requerido' }, { status: 400 })
  }

  const companyResult = resolveCompany(user, request.headers)
  if ('error' in companyResult) {
    return NextResponse.json({ error: companyResult.error }, { status: companyResult.status })
  }
  const { companyId } = companyResult

  const userEmail = (user.email ?? '').toLowerCase()
  const supabase = createAdminSupabaseClient()

  // Ownership check antes del DELETE (defensa en profundidad).
  const { data: existing, error: existErr } = await supabase
    .from('saved_views')
    .select('user_email, company_id')
    .eq('id', id)
    .maybeSingle()
  if (existErr) {
    console.error('[saved-views DELETE] lookup error:', existErr.message)
    return NextResponse.json({ error: 'Error al verificar la vista' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Vista no encontrada' }, { status: 404 })
  }
  if (existing.company_id !== companyId) {
    return NextResponse.json({ error: 'Forbidden: vista de otra empresa' }, { status: 403 })
  }
  if ((existing.user_email as string).toLowerCase() !== userEmail) {
    return NextResponse.json({ error: 'Forbidden: solo el creador puede borrar' }, { status: 403 })
  }

  const { error, count } = await supabase
    .from('saved_views')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) {
    console.error('[saved-views DELETE] delete error:', error.message, error.details)
    return NextResponse.json({ error: 'Error al borrar la vista' }, { status: 500 })
  }
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'Vista no encontrada' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
