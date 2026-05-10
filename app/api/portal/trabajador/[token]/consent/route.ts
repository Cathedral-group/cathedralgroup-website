/**
 * POST /api/portal/trabajador/[token]/consent
 *
 * El trabajador acepta la cláusula informativa RGPD art. 13 al primer acceso.
 * Body opcional: { version: 'v1-2026-05' }
 *
 * Aislamiento: NO usa Supabase Auth. Solo token UUID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const CURRENT_CONSENT_VERSION = 'v1-2026-05'

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

  let body: { version?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const version = body.version ?? CURRENT_CONSENT_VERSION
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('worker_portal_access')
    .update({
      consent_accepted_at: nowIso,
      consent_text_version: version,
    })
    .eq('token', token)
    .is('revoked_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    accepted_at: nowIso,
    version,
  })
}

export const dynamic = 'force-dynamic'
