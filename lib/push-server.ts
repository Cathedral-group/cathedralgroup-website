/**
 * Wrapper server-side de Web Push (VAPID) para enviar notificaciones a los admins.
 *
 * Cómo funciona:
 *   1. Una vez en la vida del proyecto: generar par de claves VAPID con
 *      `npx web-push generate-vapid-keys` y guardar en Vercel env como
 *      VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT (mailto: del admin).
 *   2. El cliente (admin móvil) registra el SW y crea una PushSubscription pasando
 *      la public key VAPID. Guarda la subscription en BD vía /api/admin/push/subscribe.
 *   3. Cuando hay algo que notificar (lib/admin-notify.ts), llamamos a sendPushToAdmins()
 *      que itera sobre las subscriptions activas y envía el payload cifrado.
 *   4. El SW admin (admin-sw.js) recibe el push y muestra la notificación.
 *
 * Seguridad:
 *   - VAPID_PRIVATE_KEY nunca abandona el server.
 *   - El payload se cifra con la p256dh+auth del subscriber: solo SU navegador
 *     puede descifrarlo. Ni el push service (FCM/Mozilla/Apple) ni un MITM.
 *   - Si un push devuelve 410 (Gone) o 404, marcamos la suscripción como muerta
 *     y la borramos tras 5 fallos consecutivos.
 *   - El payload contiene SOLO el título + cuerpo + URL — no datos sensibles
 *     (no IBANs, no importes, no PII completa). El admin pulsa y abre el panel
 *     donde los ve.
 */

import webpush from 'web-push'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

let vapidConfigured = false

function configureVapidLazy() {
  if (vapidConfigured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@cathedralgroup.es'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export function isPushAvailable(): boolean {
  return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  /** Tag para agrupar/reemplazar notificaciones con la misma clave en el SO. */
  tag?: string
  /** Severity informativa (no afecta la UI nativa, pero el SW puede usarla). */
  severity?: 'info' | 'warning' | 'critical'
}

interface SubscriptionRow {
  id: string
  admin_email: string
  endpoint: string
  p256dh: string
  auth: string
  fail_count: number
}

/**
 * Envía un push a todas las suscripciones activas de admins. Idempotente y tolerante:
 *   - Si VAPID no está configurada: devuelve {sent: 0, skipped: 'no_vapid'} sin lanzar.
 *   - Si una subscription falla 410/404: la marca como muerta.
 *   - Si falla por otra razón: incrementa fail_count, desactiva al llegar a 5.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<{
  sent: number
  failed: number
  removed: number
  skipped?: string
}> {
  if (!configureVapidLazy()) {
    return { sent: 0, failed: 0, removed: 0, skipped: 'no_vapid' }
  }

  const supabase = createAdminSupabaseClient()
  const { data: subs, error } = await supabase
    .from('admin_push_subscriptions')
    .select('id, admin_email, endpoint, p256dh, auth, fail_count')
    .is('deleted_at', null)

  if (error) {
    console.warn('[push] failed to load subscriptions:', error.message)
    return { sent: 0, failed: 0, removed: 0, skipped: 'db_error' }
  }
  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, removed: 0, skipped: 'no_subs' }
  }

  // Tabla no existe en BD todavía? La migración 20260511100000_admin_push_subscriptions.sql
  // debe aplicarse antes de que esto funcione. Mientras tanto, el await falla
  // arriba con error que se loguea y se sale.

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/admin',
    tag: payload.tag,
    severity: payload.severity ?? 'info',
    timestamp: Date.now(),
  })

  let sent = 0
  let failed = 0
  let removed = 0

  await Promise.all(
    (subs as SubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
          { TTL: 60 * 60 * 24 }, // hasta 24h para entregar si offline
        )
        sent++
        // Reset fail_count + last_used
        await supabase
          .from('admin_push_subscriptions')
          .update({ last_used_at: new Date().toISOString(), fail_count: 0 })
          .eq('id', sub.id)
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          // Subscription muerta — borrar
          await supabase
            .from('admin_push_subscriptions')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', sub.id)
          removed++
        } else {
          failed++
          const nextFail = sub.fail_count + 1
          await supabase
            .from('admin_push_subscriptions')
            .update({
              last_failed_at: new Date().toISOString(),
              fail_count: nextFail,
              ...(nextFail >= 5 ? { deleted_at: new Date().toISOString() } : {}),
            })
            .eq('id', sub.id)
          if (nextFail >= 5) removed++
          console.warn(`[push] failed to ${sub.admin_email} (${status}):`, e)
        }
      }
    }),
  )

  return { sent, failed, removed }
}
