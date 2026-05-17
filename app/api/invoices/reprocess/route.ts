/**
 * POST /api/invoices/reprocess
 * Body: { id: string, mode?: 'delete' | 'reprocess' }
 *
 * mode='delete'    (legacy): hard delete row con review_status='error'.
 *                            Reenvío manual del email original para reprocesar.
 * mode='reprocess' (default 18/05/2026): POST webhook Reprocesador n8n con
 *                            target_invoice_id. La fila NO se borra — el workflow
 *                            la actualiza in-place (Smart Dedup v3 + Reprocesador).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const maxDuration = 90

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

  let body: { id?: string; mode?: 'delete' | 'reprocess' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const mode = body.mode ?? 'reprocess'
  if (mode !== 'delete' && mode !== 'reprocess') {
    return NextResponse.json({ error: 'mode debe ser "delete" o "reprocess"' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('id, review_status, email_message_id, email_account, file_hash, concept, drive_file_id, ai_confidence, reprocess_attempts')
    .eq('id', body.id)
    .single()

  if (fetchError || !invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }

  // ── MODO DELETE (legacy) ────────────────────────────────────────────────────
  if (mode === 'delete') {
    if (invoice.review_status !== 'error') {
      return NextResponse.json(
        { error: 'Solo se pueden borrar facturas con review_status=error. Esta tiene: ' + invoice.review_status },
        { status: 400 },
      )
    }

    const { error: deleteError } = await supabase.from('invoices').delete().eq('id', body.id)

    if (deleteError) {
      console.error('[reprocess/delete] error:', deleteError)
      return NextResponse.json({ error: 'Error al eliminar la factura: ' + deleteError.message }, { status: 500 })
    }

    void supabase.from('admin_audit_log').insert({
      user_email: user.email ?? null,
      action: 'permanent_delete',
      table_name: 'invoices',
      record_id: body.id,
      ip: getClientIp(request),
    }).then(() => {}, () => {})

    const hasEmailRef = !!(invoice.email_message_id && invoice.email_account)
    return NextResponse.json({
      ok: true,
      mode: 'delete',
      workflow_triggered: false,
      message: hasEmailRef
        ? `Factura eliminada. Reenvía el email original desde "${invoice.email_account}" para que el workflow lo procese de nuevo.`
        : 'Factura eliminada. No hay referencia al email original — reenviar manualmente.',
      deleted_id: body.id,
    })
  }

  // ── MODO REPROCESS (nuevo default) ─────────────────────────────────────────
  if (!invoice.drive_file_id) {
    return NextResponse.json(
      { error: 'Factura sin drive_file_id — no se puede reprocesar. Usa mode=delete y reenvía email.' },
      { status: 400 },
    )
  }

  const webhookUrl = process.env.REPROCESADOR_WEBHOOK_URL
  const internalToken = process.env.CATHEDRAL_INTERNAL_TOKEN

  if (!webhookUrl || !internalToken) {
    console.error('[reprocess/reprocess] missing env vars REPROCESADOR_WEBHOOK_URL or CATHEDRAL_INTERNAL_TOKEN')
    return NextResponse.json({ error: 'Configuración incompleta en servidor' }, { status: 500 })
  }

  let webhookResponse: Response
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 75_000)
    try {
      webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalToken}`,
        },
        body: JSON.stringify({
          target_invoice_id: body.id,
          trigger_source: 'admin_ui',
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    console.error('[reprocess/reprocess] fetch error:', err)
    return NextResponse.json(
      {
        error: isTimeout
          ? 'El reprocesador no respondió en 75s — puede seguir corriendo en background'
          : 'Error de red al contactar el reprocesador',
      },
      { status: 504 },
    )
  }

  if (webhookResponse.status === 401 || webhookResponse.status === 403) {
    console.error('[reprocess/reprocess] webhook auth rejected:', webhookResponse.status)
    return NextResponse.json({ error: 'Token rechazado por el reprocesador' }, { status: 502 })
  }

  if (!webhookResponse.ok) {
    const textBody = await webhookResponse.text().catch(() => '')
    console.error('[reprocess/reprocess] webhook error:', webhookResponse.status, textBody)
    return NextResponse.json(
      { error: `Reprocesador devolvió ${webhookResponse.status}` },
      { status: 502 },
    )
  }

  let webhookData: Record<string, unknown>
  try {
    webhookData = await webhookResponse.json()
  } catch {
    return NextResponse.json({ error: 'Reprocesador devolvió respuesta no-JSON' }, { status: 502 })
  }

  void supabase.from('admin_audit_log').insert({
    user_email: user.email ?? null,
    action: 'reprocess_trigger',
    table_name: 'invoices',
    record_id: body.id,
    ip: getClientIp(request),
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok: true,
    mode: 'reprocess',
    ...webhookData,
  })
}
