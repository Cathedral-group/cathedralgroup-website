/**
 * POST /api/audit/email-coverage/[id]/ignore
 *
 * Marcar un huérfano persistente como ignorado por humano. El cron auditor
 * dejará de reintentarlo y desaparece del badge sidebar.
 *
 * Auth: sesión admin + AAL2.
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

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const idNum = parseInt(id, 10)
  if (Number.isNaN(idNum)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('email_audit_attempts')
    .update({ status: 'ignored' })
    .eq('id', idNum)

  if (error) {
    console.error('[audit/ignore] error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
