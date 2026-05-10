/**
 * GET /api/notifications — lista notificaciones activas (no dismissed)
 * POST /api/notifications — crea (admin o cron Bearer)
 *
 * Auth GET: admin allow-list + AAL2
 * Auth POST: admin allow-list + AAL2 OR Bearer AUDIT_CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheckUser() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function authCheckCron(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (auth.length !== expectedHeader.length) return false
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expectedHeader))
  } catch {
    return false
  }
}

const VALID_SEVERITIES = new Set(['info', 'warning', 'critical'])

export async function GET() {
  const user = await authCheckUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('system_notifications')
    .select('id, severity, title, message, source, metadata, created_at, snoozed_until')
    .is('dismissed_at', null)
    .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ notifications: data ?? [] })
}

export async function POST(request: NextRequest) {
  const user = await authCheckUser()
  const isCron = authCheckCron(request)
  if (!user && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    severity?: string
    title?: string
    message?: string
    source?: string
    metadata?: Record<string, unknown>
    dedup_key?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title requerido' }, { status: 400 })
  }
  const severity = body.severity ?? 'info'
  if (!VALID_SEVERITIES.has(severity)) {
    return NextResponse.json({ error: `severity inválida: ${severity}` }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('upsert_system_notification', {
    p_severity: severity,
    p_title: body.title.slice(0, 200),
    p_message: body.message?.slice(0, 2000) ?? null,
    p_source: body.source?.slice(0, 100) ?? (isCron ? 'cron' : 'manual'),
    p_metadata: body.metadata ?? {},
    p_dedup_key: body.dedup_key?.slice(0, 200) ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data })
}

export const dynamic = 'force-dynamic'
