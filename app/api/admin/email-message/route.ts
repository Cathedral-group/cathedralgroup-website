/**
 * GET /api/admin/email-message?table=<doc_table>&id=<uuid>
 *
 * Devuelve el email/conversación de origen de un documento, resolviendo el
 * `email_message_id` desde la fila del documento y leyendo la tabla `email_messages`.
 *
 * La tabla `email_messages` es service_role-only (datos sensibles RGPD) → el panel
 * NUNCA la lee directo; pasa por este endpoint con auth admin + AAL2.
 *
 * Solo invoices/payrolls/quotes guardan email_message_id; para el resto devuelve
 * { email: null } (no hay email enlazable).
 *
 * Sesión 07/06/2026 — Fase 3 de "retener la conversación del email".
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Únicas tablas de documentos con columna email_message_id (enlace a email_messages).
const TABLES_WITH_EMAIL_MSG_ID = new Set(['invoices', 'payrolls', 'quotes'])
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const table = request.nextUrl.searchParams.get('table') ?? ''
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }
  if (!TABLES_WITH_EMAIL_MSG_ID.has(table)) {
    // Tabla sin email_message_id → no hay email enlazable (no es error).
    return NextResponse.json({ email: null })
  }

  const supabase = createAdminSupabaseClient()

  const { data: doc, error: docErr } = await supabase
    .from(table)
    .select('email_message_id')
    .eq('id', id)
    .maybeSingle()
  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 })
  }
  const messageId = (doc as { email_message_id?: string | null } | null)
    ?.email_message_id
  if (!messageId) return NextResponse.json({ email: null })

  const { data: email, error: emErr } = await supabase
    .from('email_messages')
    .select(
      'from_address, from_original, subject, body, received_at, gmail_account'
    )
    .eq('email_message_id', messageId)
    .maybeSingle()
  if (emErr) {
    return NextResponse.json({ error: emErr.message }, { status: 500 })
  }

  return NextResponse.json({ email: email ?? null })
}
