'use client'

/**
 * Botón "🔔 Activar notificaciones" para el dashboard admin.
 *
 * Flujo:
 *   1. Al pulsar: registra el SW /admin-sw.js (scope: /admin)
 *   2. Pide permiso de notificaciones al navegador
 *   3. Obtiene la VAPID public key vía /api/admin/push/vapid-key
 *   4. Llama a registration.pushManager.subscribe() con la public key
 *   5. POST a /api/admin/push/subscribe con endpoint + keys
 *
 * Estados visibles:
 *   - 'unsupported' — el navegador no soporta Push API (ej: iOS < 16.4)
 *   - 'denied'      — permiso denegado por el user
 *   - 'idle'        — listo para activar
 *   - 'enabled'     — ya suscrito (PushSubscription existe)
 *   - 'no-vapid'    — el server no tiene VAPID configurado (503 al /vapid-key)
 *
 * Se guarda un device_label legible (Chrome MBP, iPhone Safari) para que el
 * admin pueda gestionar suscripciones desde /admin/configuracion (futuro).
 */

import { useEffect, useState } from 'react'

type Status = 'checking' | 'unsupported' | 'denied' | 'idle' | 'enabled' | 'no-vapid'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = typeof atob !== 'undefined' ? atob(base64) : ''
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Desconocido'
  const ua = navigator.userAgent
  const isMobile = /iPhone|iPad|Android/i.test(ua)
  let browser = 'Navegador'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  let device = 'Equipo'
  if (ua.includes('iPhone')) device = 'iPhone'
  else if (ua.includes('iPad')) device = 'iPad'
  else if (ua.includes('Android')) device = 'Android'
  else if (ua.includes('Macintosh')) device = 'Mac'
  else if (ua.includes('Windows')) device = 'Windows'
  return `${device} ${browser}${isMobile ? ' (móvil)' : ''}`
}

export default function EnablePushButton() {
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (typeof window === 'undefined') return
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied')
        return
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration('/admin-sw.js')
        if (reg) {
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            if (!cancelled) setStatus('enabled')
            return
          }
        }
        if (!cancelled) setStatus('idle')
      } catch {
        if (!cancelled) setStatus('idle')
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function activate() {
    setBusy(true); setError(null)
    try {
      // 1. Registrar SW admin
      const reg = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' })
      await navigator.serviceWorker.ready

      // 2. Permiso
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'idle')
        return
      }

      // 3. VAPID public key del server
      const keyRes = await fetch('/api/admin/push/vapid-key')
      if (keyRes.status === 503) { setStatus('no-vapid'); return }
      if (!keyRes.ok) throw new Error(`vapid-key ${keyRes.status}`)
      const { publicKey } = await keyRes.json()

      // 4. Subscribe en el navegador
      // Cast a BufferSource — TS marca Uint8Array como incompatible por SharedArrayBuffer
      // pero en runtime es exactamente lo que pushManager.subscribe espera.
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      // 5. Enviar al server
      const subJson = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          device_label: detectDeviceLabel(),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `subscribe ${res.status}`)
      }

      setStatus('enabled')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error activando notificaciones')
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    setBusy(true); setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/admin-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        const subJson = sub.toJSON() as { endpoint?: string }
        await fetch('/api/admin/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subJson.endpoint }),
        })
        await sub.unsubscribe()
      }
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desactivando')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'checking') {
    return <div className="text-xs text-neutral-400">Comprobando notificaciones...</div>
  }

  if (status === 'unsupported') {
    return (
      <div className="rounded border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
        🔕 Tu navegador no soporta notificaciones push. iOS Safari requiere iOS 16.4+.
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        🔕 Has denegado las notificaciones. Permítelas en los ajustes del navegador para activarlas.
      </div>
    )
  }

  if (status === 'no-vapid') {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        🔕 Las push no están configuradas en el server. Pide a David que añada las claves VAPID.
      </div>
    )
  }

  if (status === 'enabled') {
    return (
      <div className="flex items-center gap-3">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          🔔 Notificaciones activadas en este dispositivo
        </div>
        <button
          onClick={deactivate}
          disabled={busy}
          className="text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50"
        >
          {busy ? '...' : 'Desactivar'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={activate}
        disabled={busy}
        className="inline-flex items-center gap-2 self-start rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-primary disabled:opacity-50"
      >
        🔔 {busy ? 'Activando...' : 'Activar notificaciones push'}
      </button>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠️ {error}
        </div>
      )}
      <p className="text-[10px] text-neutral-400">
        Recibirás avisos al móvil/escritorio cuando un trabajador solicite vacaciones, suba un ticket o aparezca una alerta.
      </p>
    </div>
  )
}
