/**
 * PATCH /api/forensic/[id]
 *
 * Persiste la decisión del revisor sobre el análisis forensic de una factura.
 * Se llama desde el slide-out de `/admin/forensic` cuando el revisor pulsa
 * Aceptar / Rechazar / Marcar revisada.
 *
 * Body JSON:
 *   { decision: 'aceptada' | 'rechazada' | 'revisada', notes?: string }
 *
 * Side-effects:
 *   - factura_forensic.decision, .notes, .reviewed_at actualizados
 *   - admin_audit_log.insert con user_email + ip
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

const VALID_DECISIONS = new Set(['aceptada', 'rechazada', 'revisada'])

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let body: { decision?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const decision = body?.decision
  if (!decision || !VALID_DECISIONS.has(decision)) {
    return NextResponse.json(
      { error: `decision must be one of ${[...VALID_DECISIONS].join(', ')}` },
      { status: 400 },
    )
  }

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : null

  const supabase = createAdminSupabaseClient()
  const { error: updateError } = await supabase
    .from('factura_forensic')
    .update({
      decision,
      notes,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('[PATCH /api/forensic/:id] update failed:', updateError)
    return NextResponse.json({ error: 'Update failed', detail: updateError.message }, { status: 500 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  void supabase.from('admin_audit_log').insert({
    user_email: user.email,
    action: 'update',
    table_name: 'factura_forensic',
    record_id: id,
    ip,
  })

  return NextResponse.json({ ok: true, id, decision, reviewed_at: new Date().toISOString() })
}

export const dynamic = 'force-dynamic'
