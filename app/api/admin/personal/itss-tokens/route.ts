/**
 * Tokens ITSS (Inspección de Trabajo) — Fase 5 cumplimiento nuevo RD
 *
 * GET  /api/admin/personal/itss-tokens
 *      Lista tokens ITSS de la empresa activa (activos + histórico).
 *
 * POST /api/admin/personal/itss-tokens
 *      Body: { inspector_nombre, inspector_dni?, inspeccion_referencia?,
 *              scope_employee_id?, scope_desde?, scope_hasta?, expires_in_days? }
 *      Genera token UUID v4 con expiración (default 30 días).
 *      Devuelve plaintext UNA vez — admin lo entrega al inspector.
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

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('itss_access_tokens')
    .select(
      `id, inspector_nombre, inspector_dni, inspeccion_referencia,
       scope_employee_id, scope_desde, scope_hasta,
       expires_at, revoked_at, revoked_reason, created_at, created_by_email,
       last_used_at, last_used_ip, uses_count`,
    )
    .eq('company_id', resolved.activeCompanyId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: {
    inspector_nombre?: string
    inspector_dni?: string
    inspeccion_referencia?: string
    scope_employee_id?: string | null
    scope_desde?: string
    scope_hasta?: string
    expires_in_days?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.inspector_nombre?.trim()) {
    return NextResponse.json({ error: 'inspector_nombre requerido' }, { status: 400 })
  }

  const expiresInDays = Number(body.expires_in_days ?? 30)
  if (expiresInDays <= 0 || expiresInDays > 365) {
    return NextResponse.json({ error: 'expires_in_days debe estar entre 1 y 365' }, { status: 400 })
  }
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const supabase = createAdminSupabaseClient()

  // Validar scope_employee_id si se da
  if (body.scope_employee_id) {
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('id', body.scope_employee_id)
      .eq('company_id', resolved.activeCompanyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Empleado no válido' }, { status: 400 })
  }

  const token = crypto.randomUUID()

  const { data, error } = await supabase
    .from('itss_access_tokens')
    .insert({
      company_id: resolved.activeCompanyId,
      token,
      inspector_nombre: body.inspector_nombre.trim(),
      inspector_dni: body.inspector_dni?.trim() ?? null,
      inspeccion_referencia: body.inspeccion_referencia?.trim() ?? null,
      scope_employee_id: body.scope_employee_id ?? null,
      scope_desde: body.scope_desde ?? null,
      scope_hasta: body.scope_hasta ?? null,
      expires_at: expiresAt.toISOString(),
      created_by_email: user.email ?? 'unknown',
    })
    .select('id, expires_at, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const baseUrl = request.headers.get('x-forwarded-host')
    ? `https://${request.headers.get('x-forwarded-host')}`
    : 'https://cathedralgroup.es'
  const itssUrl = `${baseUrl}/itss/${token}`

  return NextResponse.json({
    ok: true,
    id: data.id,
    token,
    itss_url: itssUrl,
    expires_at: data.expires_at,
    inspector_nombre: body.inspector_nombre.trim(),
    warning:
      'Este token solo se muestra una vez. Cópialo y entrégaselo al inspector. ' +
      'Si lo pierdes, regenera otro. Expira en ' + expiresInDays + ' días.',
  })
}

export const dynamic = 'force-dynamic'
