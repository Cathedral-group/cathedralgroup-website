/* Admin Service Worker — FASE 3 Push notifications
 *
 * Scope: /admin (registrado por components/admin/EnablePushButton.tsx)
 *
 * Responsabilidades:
 *   - Recibir eventos `push` y mostrar la notificación al usuario
 *   - Al hacer click en la notificación, abrir/enfocar la URL del payload
 *
 * No cachea contenido del admin (es panel privado con datos sensibles que cambian
 * constantemente). Solo gestiona push.
 */

const SW_VERSION = 'admin-v1-2026-05-11'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Cathedral admin', body: event.data.text() }
  }

  const title = payload.title || 'Cathedral admin'
  const options = {
    body: payload.body || '',
    icon: '/portal-icon-192.png',
    badge: '/portal-icon-192.png',
    tag: payload.tag || undefined,
    renotify: !!payload.tag, // si reusa tag, sí re-notificar
    data: { url: payload.url || '/admin', severity: payload.severity || 'info' },
    requireInteraction: payload.severity === 'critical',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/admin'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Si ya hay una pestaña del admin abierta, navegar ahí
      for (const client of allClients) {
        if (client.url.includes('/admin')) {
          await client.focus()
          if ('navigate' in client) {
            try { await client.navigate(targetUrl) } catch { /* navegación cross-origin */ }
          }
          return
        }
      }
      // Sin pestaña abierta → abrir nueva
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
