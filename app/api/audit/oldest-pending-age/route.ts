/**
 * GET /api/audit/oldest-pending-age
 *
 * Métrica SLO canónica (Outbox/Stripe pattern): edad del row pending más antiguo
 * en email_audit_attempts. Alarma si > umbral (24h por defecto).
 *
 * Auth: sesión admin (panel) o Bearer AUDIT_CRON_SECRET (interno).
 *
 * Devuelve:
 *   {
 *     pending_count: number,
 *     persistent_orphan_count: number,
 *     oldest_pending_age_hours: number | null,
 *     oldest_pending_received_at: string | null,
 *     threshold_hours: number,
 *     alarm: boolean
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const dynamic = 'force-dynamic'

const ALARM_THRESHOLD_HOURS = 24

function authCron(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const authHeader = request.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (authHeader.length !== expectedHeader.length) return false
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedHeader))
}

async function authAdmin(): Promise<boolean> {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user || !isAdminEmail(data.user.email)) return false
  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  return aal?.currentLevel === 'aal2'
}

export async function GET(request: NextRequest) {
  if (!authCron(request) && !(await authAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: oldest } = await supabase
    .from('email_audit_attempts')
    .select('received_at')
    .eq('status', 'pending')
    .not('received_at', 'is', null)
    .order('received_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { count: pendingCount } = await supabase
    .from('email_audit_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  const { count: orphanCount } = await supabase
    .from('email_audit_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'persistent_orphan')

  let ageHours: number | null = null
  if (oldest?.received_at) {
    const ageMs = Date.now() - new Date(oldest.received_at).getTime()
    ageHours = Math.round((ageMs / 36e5) * 10) / 10
  }

  return NextResponse.json({
    pending_count: pendingCount ?? 0,
    persistent_orphan_count: orphanCount ?? 0,
    oldest_pending_age_hours: ageHours,
    oldest_pending_received_at: oldest?.received_at ?? null,
    threshold_hours: ALARM_THRESHOLD_HOURS,
    alarm: ageHours !== null && ageHours > ALARM_THRESHOLD_HOURS,
  })
}
