/**
 * Helper centralizado para notificar a los admins de Cathedral.
 *
 * Cada llamada hace 2 cosas (degradación elegante si una falla):
 *
 *   1) UPSERT en `system_notifications` (vía RPC `upsert_system_notification`)
 *      → aparece en el banner /admin/* y en el widget 'Pendientes' del dashboard.
 *      Esta parte SIEMPRE se ejecuta (no requiere API key externa).
 *
 *   2) Email a todos los admins de ADMIN_ALLOWED_EMAILS (vía Resend SDK)
 *      → solo si `RESEND_API_KEY` está configurada en Vercel env.
 *      Si no lo está, se omite silenciosamente (no rompe la solicitud del trabajador).
 *
 * Diseño:
 *   - Idempotente: `dedupKey` evita duplicados. Re-llamadas para el mismo evento
 *     actualizan la notificación existente en lugar de spamear.
 *   - Server-only: este módulo NO debe importarse desde el cliente.
 *   - Tolerante a fallos: si Resend o la BD fallan, lo loguea y devuelve sin lanzar.
 *     La acción del trabajador (crear ausencia, subir ticket, etc.) NUNCA debe
 *     fallar por culpa de la notificación.
 */

import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { ADMIN_ALLOWED_EMAILS } from '@/lib/auth-allowlist'
import { sendPushToAdmins } from '@/lib/push-server'

export type NotifySeverity = 'info' | 'warning' | 'critical'

export interface AdminNotifyInput {
  severity: NotifySeverity
  title: string
  /** Body en texto plano. Se renderiza en banner admin y en el cuerpo del email. */
  message?: string
  /** Fuente del evento — para agrupar en el banner. Ej: 'portal_trabajador', 'workflow_general'. */
  source: string
  /** Clave de deduplicación. Si dos eventos comparten (source, dedupKey) y el primero
   *  sigue activo, se actualiza en lugar de duplicarse. */
  dedupKey?: string
  /** URL a la que debe ir el admin al pulsar la notificación / email. */
  actionUrl?: string
  /** Texto del CTA en el email. Ej: 'Ver solicitud'. */
  actionLabel?: string
  /** Metadata extra para guardar en JSONB (no se muestra). */
  metadata?: Record<string, unknown>
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? 'Cathedral Group <notificaciones@cathedralgroup.es>'

// URL base para construir actionUrl absolutas en el email. En Vercel se inyecta automáticamente.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
).replace(/\/+$/, '')

function absoluteUrl(path?: string): string {
  if (!path) return SITE_URL || ''
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Severity → prefijo asunto + color del CTA. */
function severityStyle(s: NotifySeverity): { emoji: string; color: string } {
  if (s === 'critical') return { emoji: '🔴', color: '#dc2626' }
  if (s === 'warning') return { emoji: '⚠️', color: '#d97706' }
  return { emoji: 'ℹ️', color: '#0369a1' }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildHtmlEmail(input: AdminNotifyInput, link: string): string {
  const { emoji, color } = severityStyle(input.severity)
  const safeTitle = escapeHtml(input.title)
  const safeMessage = input.message ? escapeHtml(input.message).replace(/\n/g, '<br>') : ''
  const label = escapeHtml(input.actionLabel ?? 'Ver en el panel')
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#78716c;">Cathedral Group · Notificación admin</div>
          <h1 style="margin:8px 0 0;font-size:18px;font-weight:600;line-height:1.4;">
            ${emoji} ${safeTitle}
          </h1>
        </td></tr>
        ${safeMessage ? `<tr><td style="padding:8px 28px 0;font-size:14px;line-height:1.55;color:#44403c;">${safeMessage}</td></tr>` : ''}
        ${link ? `<tr><td style="padding:20px 28px 24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:${color};color:#fff;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;">${label} →</a>
        </td></tr>` : ''}
        <tr><td style="padding:16px 28px;border-top:1px solid #f5f5f4;font-size:11px;color:#a8a29e;">
          Recibes este aviso porque eres admin en el panel de Cathedral Group.
          Fuente: ${escapeHtml(input.source)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Notifica a los admins. Llama desde server (route handlers, server actions, crons).
 * Nunca lanza — siempre devuelve un objeto resumen con qué se hizo.
 */
export async function notifyAdmins(input: AdminNotifyInput): Promise<{
  banner: 'ok' | 'failed'
  email: 'sent' | 'skipped_no_key' | 'failed'
  push: { sent: number; failed: number; removed: number; skipped?: string }
  emailErrors?: string[]
}> {
  let bannerStatus: 'ok' | 'failed' = 'ok'
  let emailStatus: 'sent' | 'skipped_no_key' | 'failed' = 'skipped_no_key'
  const emailErrors: string[] = []
  let pushStats: { sent: number; failed: number; removed: number; skipped?: string } = {
    sent: 0, failed: 0, removed: 0, skipped: 'not_run',
  }

  // 1) Banner / dashboard
  try {
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.rpc('upsert_system_notification', {
      p_severity: input.severity,
      p_title: input.title,
      p_message: input.message ?? null,
      p_source: input.source,
      p_metadata: {
        ...(input.metadata ?? {}),
        ...(input.actionUrl ? { action_url: input.actionUrl } : {}),
        ...(input.actionLabel ? { action_label: input.actionLabel } : {}),
      },
      p_dedup_key: input.dedupKey ?? null,
    })
    if (error) {
      bannerStatus = 'failed'
      console.warn('[admin-notify] banner upsert failed:', error.message)
    }
  } catch (e) {
    bannerStatus = 'failed'
    console.warn('[admin-notify] banner upsert threw:', e)
  }

  // 2) Email vía Resend (opcional)
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    try {
      const resend = new Resend(apiKey)
      const link = absoluteUrl(input.actionUrl)
      const html = buildHtmlEmail(input, link)
      const { emoji } = severityStyle(input.severity)
      const subject = `${emoji} ${input.title}`

      // Resend acepta múltiples destinatarios en `to` (BCC implícito si usas array? no — son to)
      // Mejor: BCC para que cada admin no vea a los demás como compañeros de email
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: FROM_EMAIL.match(/<([^>]+)>/)?.[1] ?? FROM_EMAIL,
        bcc: [...ADMIN_ALLOWED_EMAILS],
        subject,
        html,
      })
      if (result.error) {
        emailStatus = 'failed'
        emailErrors.push(result.error.message ?? 'Resend devolvió error sin mensaje')
      } else {
        emailStatus = 'sent'
      }
    } catch (e) {
      emailStatus = 'failed'
      emailErrors.push(e instanceof Error ? e.message : String(e))
      console.warn('[admin-notify] email send threw:', e)
    }
  }

  // 3) Push notifications (sólo si VAPID configurado)
  try {
    pushStats = await sendPushToAdmins({
      title: input.title,
      body: input.message ?? '',
      url: input.actionUrl,
      tag: input.dedupKey,
      severity: input.severity,
    })
  } catch (e) {
    pushStats = { sent: 0, failed: 0, removed: 0, skipped: 'threw' }
    console.warn('[admin-notify] push threw:', e)
  }

  return {
    banner: bannerStatus,
    email: emailStatus,
    push: pushStats,
    ...(emailErrors.length > 0 ? { emailErrors } : {}),
  }
}

/**
 * Descarta una notificación activa identificada por (source, dedupKey).
 *
 * Llamar desde endpoints admin cuando el admin RESUELVE la causa de la
 * notificación (aprueba ausencia, valida ticket, etc.). Así la campana
 * y el widget Pendientes se actualizan solos sin que el admin tenga que
 * tocar nada extra.
 *
 * Tolerante: si no hay match (porque la notif nunca existió o ya estaba
 * dismissed) → no-op silencioso.
 */
export async function dismissNotificationByDedup(
  source: string,
  dedupKey: string,
  dismissedByEmail?: string,
): Promise<{ dismissed: number }> {
  if (!source || !dedupKey) return { dismissed: 0 }
  try {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('system_notifications')
      .update({
        dismissed_at: new Date().toISOString(),
        dismissed_by: dismissedByEmail ?? 'auto-resolved',
      })
      .eq('source', source)
      .eq('dedup_key', dedupKey)
      .is('dismissed_at', null)
      .select('id')
    if (error) {
      console.warn('[admin-notify] dismissByDedup failed:', error.message)
      return { dismissed: 0 }
    }
    return { dismissed: data?.length ?? 0 }
  } catch (e) {
    console.warn('[admin-notify] dismissByDedup threw:', e)
    return { dismissed: 0 }
  }
}
