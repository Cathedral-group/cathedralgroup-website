/**
 * POST   /api/admin/push/subscribe
 *        Body: { endpoint, keys: { p256dh, auth }, device_label? }
 *        Upsert de la subscription del admin actual.
 *
 * DELETE /api/admin/push/subscribe
 *        Body: { endpoint }  (o sin body para borrar todas las del admin)
 *        Soft-delete de la subscription (o todas).
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

interface SubscribeBody {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
  device_label?: string
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user || !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: SubscribeBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const endpoint = body.endpoint?.trim()
  const p256dh = body.keys?.p256dh?.trim()
  const auth = body.keys?.auth?.trim()

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Faltan campos: endpoint, keys.p256dh, keys.auth' }, { status: 400 })
  }
  if (!/^https?:\/\//.test(endpoint)) {
    return NextResponse.json({ error: 'endpoint inválido' }, { status: 400 })
  }
  // Limites sanos para no aceptar payloads ridículos
  if (endpoint.length > 1024 || p256dh.length > 256 || auth.length > 128) {
    return NextResponse.json({ error: 'Datos demasiado largos' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const ua = request.headers.get('user-agent')?.slice(0, 512) ?? null
  const ip = getClientIp(request)

  // Upsert por (admin_email, endpoint) — UNIQUE existe
  const { data: existing } = await supabase
    .from('admin_push_subscriptions')
    .select('id')
    .eq('admin_email', user.email)
    .eq('endpoint', endpoint)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('admin_push_subscriptions')
      .update({
        p256dh, auth,
        device_label: body.device_label ?? null,
        user_agent: ua,
        created_ip: ip,
        last_used_at: null,
        last_failed_at: null,
        fail_count: 0,
        deleted_at: null,
      })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'updated', id: existing.id })
  }

  const { data, error } = await supabase
    .from('admin_push_subscriptions')
    .insert({
      admin_email: user.email,
      endpoint,
      p256dh,
      auth,
      device_label: body.device_label ?? null,
      user_agent: ua,
      created_ip: ip,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'created', id: data.id })
}

export async function DELETE(request: NextRequest) {
  const user = await authCheck()
  if (!user || !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let endpoint: string | undefined
  try {
    const body = (await request.json()) as { endpoint?: string }
    endpoint = body?.endpoint
  } catch {
    // sin body → borrar todas las del admin
  }

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('admin_push_subscriptions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('admin_email', user.email)
    .is('deleted_at', null)
  if (endpoint) query = query.eq('endpoint', endpoint)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
