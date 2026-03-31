import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const { data, error } = await (await createServerSupabaseClient()).auth.getUser()
  if (error || !data?.user) return NextResponse.json({ ok: false }, { status: 401 })

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
