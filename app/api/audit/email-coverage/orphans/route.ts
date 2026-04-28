/**
 * GET /api/audit/email-coverage/orphans
 *
 * Lista de huérfanos persistentes para mostrar en /admin/revision.
 * Solo devuelve status='persistent_orphan' (los que el cron no pudo
 * auto-resolver tras 2 intentos). Los 'pending' son transitorios y los
 * 'reprocessed_ok' / 'ignored' no necesitan atención humana.
 *
 * Auth: sesión admin + AAL2.
 *
 * Devuelve: { orphans: [{ id, message_id, gmail_account, subject, from_address,
 *                          received_at, attempt_count, last_attempt_at,
 *                          last_error, created_at }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const dynamic = 'force-dynamic'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function GET(_request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('email_audit_attempts')
    .select('id, message_id, gmail_account, subject, from_address, received_at, attempt_count, last_attempt_at, last_error, created_at')
    .eq('status', 'persistent_orphan')
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    console.error('[audit/orphans] error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ orphans: data ?? [] })
}
