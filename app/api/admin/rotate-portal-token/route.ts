/**
 * POST /api/admin/rotate-portal-token
 * Body: { quoteId: string }
 * Returns: { ok: true, portalToken: string, portalUrl: string, expiresAt: string | null }
 *
 * Genera un nuevo `portal_token` (UUIDv4) para el presupuesto indicado.
 * El token anterior queda invalidado inmediatamente — cualquier link/QR
 * que un cliente tuviera con el token viejo deja de funcionar.
 *
 * Casos de uso:
 *   - Sospecha de filtración del link/QR
 *   - El cliente reenvió el link sin querer y quieres limitar acceso
 *   - Auditoría: rotar tokens periódicamente como buena práctica
 *
 * Tras la rotación el admin debe regenerar el PDF (botón "PDF Presupuesto")
 * y reenviarlo al cliente — el QR del PDF anterior apunta al token viejo
 * que ya no es válido.
 *
 * Seguridad: requiere sesión válida + email en allow-list + AAL2 (Google Authenticator).
 * Audit log automático.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export async function POST(request: NextRequest) {
  // Auth: session + allow-list + AAL2
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminEmail(userData.user.email)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return NextResponse.json({ error: 'MFA requerida' }, { status: 401 })

  // Body
  const body = await request.json().catch(() => null)
  const quoteId = body?.quoteId
  if (!quoteId || typeof quoteId !== 'string') {
    return NextResponse.json({ error: 'quoteId requerido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Verify quote exists and isn't deleted
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('id, number, portal_token')
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single()

  if (qErr || !quote) {
    return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 })
  }

  // Generate new UUID — crypto.randomUUID is cryptographically secure (122 bits entropy)
  const newToken = crypto.randomUUID()

  // Update — the BEFORE UPDATE trigger will auto-recompute portal_token_expires_at
  const { data: updated, error: updErr } = await supabase
    .from('quotes')
    .update({ portal_token: newToken })
    .eq('id', quoteId)
    .select('portal_token, portal_token_expires_at')
    .single()

  if (updErr || !updated) {
    console.error('[rotate-portal-token]', updErr?.message, updErr?.details)
    return NextResponse.json({ error: 'Error al rotar el token' }, { status: 500 })
  }

  // Audit log (fire-and-forget)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  void supabase.from('admin_audit_log').insert({
    user_email: userData.user.email ?? userData.user.id,
    action: 'update',
    table_name: 'quotes',
    record_id: quoteId,
    ip,
  })

  const portalUrl = `https://cathedralgroup.es/portal/${updated.portal_token}`

  return NextResponse.json({
    ok: true,
    portalToken: updated.portal_token,
    portalUrl,
    expiresAt: updated.portal_token_expires_at,
    quoteNumber: quote.number,
  })
}
