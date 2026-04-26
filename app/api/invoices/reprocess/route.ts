/**
 * POST /api/invoices/reprocess
 * Body: { id: string }
 *
 * Borra (hard delete) una factura marcada con review_status='error' para que el
 * workflow n8n pueda re-procesarla cuando el email vuelva a llegar (reenvío manual o
 * próximo trigger si la fila estaba bloqueada por dedup).
 *
 * Devuelve:
 *   { ok: true, workflow_triggered: false, message: '...' }
 *
 * NOTA: actualmente el endpoint solo borra la fila. Para disparar automáticamente
 * el procesado del email original sin necesidad de reenvío, se necesita añadir un
 * Webhook Trigger al workflow que reciba {email_message_id, email_account}, descargue
 * el email vía Gmail API y lo procese. Pendiente de diseño en próxima sesión.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // 1. Verificar que la factura existe y tiene review_status='error' (defensa: no borrar facturas válidas)
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('id, review_status, email_message_id, email_account, file_hash, empresa, concept')
    .eq('id', body.id)
    .single()

  if (fetchError || !invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }

  if (invoice.review_status !== 'error') {
    return NextResponse.json(
      { error: 'Solo se pueden reprocesar facturas con review_status=error. Esta tiene: ' + invoice.review_status },
      { status: 400 }
    )
  }

  // 2. HARD DELETE — el workflow Check Duplicado filtra deleted_at IS NULL,
  // pero hard delete asegura que no quede rastro y el reenvío vuelva a procesarse limpio
  const { error: deleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('id', body.id)

  if (deleteError) {
    console.error('[reprocess] delete error:', deleteError)
    return NextResponse.json({ error: 'Error al eliminar la factura: ' + deleteError.message }, { status: 500 })
  }

  // 3. Audit log (fire-and-forget) — registramos motivo en el log del server, no en BD
  console.log('[reprocess]', {
    user: user.email,
    deleted_id: body.id,
    email_message_id: invoice.email_message_id,
    email_account: invoice.email_account,
    original_concept: invoice.concept?.substring(0, 100),
  })
  void supabase.from('admin_audit_log').insert({
    user_email: user.email ?? null,
    action: 'permanent_delete',
    table_name: 'invoices',
    record_id: body.id,
    ip: getClientIp(request),
  }).then(() => {}, () => {})

  // 4. TODO: cuando exista webhook trigger en n8n, dispararlo aquí
  // const triggered = await triggerN8nReprocess(invoice.email_message_id, invoice.email_account)

  const hasEmailRef = !!(invoice.email_message_id && invoice.email_account)
  const message = hasEmailRef
    ? `Factura eliminada. Reenvía el email original desde "${invoice.email_account}" (Message-ID: ${invoice.email_message_id}) para que el workflow lo procese de nuevo.`
    : 'Factura eliminada. No hay referencia al email original — debes reenviar manualmente el documento si quieres reprocesarlo.'

  return NextResponse.json({
    ok: true,
    workflow_triggered: false,
    message,
    deleted_id: body.id,
  })
}
