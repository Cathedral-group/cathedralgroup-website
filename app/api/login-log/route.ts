import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export async function POST(request: NextRequest) {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return NextResponse.json({ ok: false }, { status: 401 })

  // Allow-list + AAL2: este endpoint registra logins legítimos, no debería ejecutarse
  // con sesiones de emails no autorizados o sin MFA verificada.
  if (!isAdminEmail(data.user.email)) {
    console.warn('[login-log] email NOT in allow-list:', data.user.email)
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const userEmail = data.user.email ?? data.user.id

  const supabase = createAdminSupabaseClient()
  await supabase.from('admin_audit_log').insert({
    user_email: userEmail,
    action: 'login',
    table_name: 'auth',
    record_id: data.user.id,
    ip,
  })

  return NextResponse.json({ ok: true })
}
