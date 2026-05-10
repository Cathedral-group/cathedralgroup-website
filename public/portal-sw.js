/* Portal trabajador Service Worker — Fase 3 PWA + offline
 *
 * Estrategia simple:
 *   - Install: pre-cache del shell estático mínimo
 *   - Fetch: network-first para todo. Si falla red → fallback a cache para GETs.
 *   - La cola de partes pendientes se gestiona en cliente (IndexedDB con idb).
 *     El SW NO intercepta POSTs — el cliente decide qué hacer cuando falla.
 *
 * Versionado: cambiar SW_VERSION dispara re-install y limpieza de caches viejos.
 */

const SW_VERSION = 'v1-2026-05-10'
const SHELL_CACHE = `portal-shell-${SW_VERSION}`

const SHELL_URLS = ['/portal-icon-192.png', '/portal-icon-512.png', '/portal-manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('portal-shell-') && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Solo gestionamos GETs del propio dominio dentro del scope /portal/trabajador
  if (req.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith('/portal/') && !SHELL_URLS.includes(url.pathname)) return

  // Network-first con fallback a cache (para que offline aún cargue la última UI)
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cachear respuestas OK del shell estático
        if (res.ok && SHELL_URLS.includes(url.pathname)) {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((cached) => cached ?? new Response('', { status: 503 }))),
  )
})

// Mensaje desde el cliente para que SW se actualice manualmente
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
