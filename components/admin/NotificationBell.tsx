'use client'

/**
 * Campana 🔔 en el header del admin, visible en todas las páginas.
 *
 * - Badge con contador de notificaciones activas (no dismissed, no snoozed)
 * - Click → dropdown con la lista (última 50 por orden de creación desc)
 * - Cada notificación es clickable → navega al action_url y queda dismissed
 * - Botón "Descartar todas" en el footer
 * - Polling cada 30s para refrescar el badge en background
 *
 * Cuando el admin resuelve la causa (aprueba ausencia, valida ticket, etc.),
 * el endpoint correspondiente del backend hace dismissNotificationByDedup,
 * con lo que la notificación desaparece sola en el siguiente poll.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Notification {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string | null
  source: string
  metadata: Record<string, unknown> | null
  created_at: string
  snoozed_until?: string | null
}

const SEVERITY_BORDER: Record<Notification['severity'], string> = {
  info: 'border-l-blue-400',
  warning: 'border-l-amber-500',
  critical: 'border-l-red-500',
}

const SEVERITY_ICON: Record<Notification['severity'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🔴',
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} d`
}

function extractActionUrl(n: Notification): string | null {
  const m = n.metadata
  if (m && typeof m === 'object' && typeof (m as Record<string, unknown>).action_url === 'string') {
    return (m as Record<string, unknown>).action_url as string
  }
  // Heurística por source: si es portal_trabajador, llevar a /admin
  if (n.source === 'portal_trabajador') return '/admin'
  return null
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setItems((json.notifications ?? []) as Notification[])
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  // Carga inicial + polling cada 30s
  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const dismissOne = async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
    await fetch(`/api/notifications/${id}/dismiss`, { method: 'PATCH' }).catch(() => {})
  }

  const dismissAll = async () => {
    const ids = items.map((x) => x.id)
    setItems([])
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/notifications/${id}/dismiss`, { method: 'PATCH' }).catch(() => {}),
      ),
    )
  }

  const openItem = (n: Notification) => {
    const url = extractActionUrl(n)
    // Cerrar dropdown pero NO descartar — la notificación se descarta sola cuando
    // el admin resuelve la solicitud (aprueba/valida/etc.). Si solo abrió la
    // ficha sin resolver, sigue activa.
    setOpen(false)
    if (url) router.push(url)
  }

  const count = items.length
  const hasCritical = items.some((n) => n.severity === 'critical')
  const hasWarning = items.some((n) => n.severity === 'warning')
  const badgeColor = hasCritical
    ? 'bg-red-600'
    : hasWarning
    ? 'bg-amber-500'
    : count > 0
    ? 'bg-blue-500'
    : 'bg-neutral-300'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white border border-neutral-200 hover:border-neutral-400 transition-colors"
        aria-label={`Notificaciones (${count})`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {count > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center tabular-nums ${badgeColor}`}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-700">
              Notificaciones {count > 0 && <span className="text-neutral-400">({count})</span>}
            </h3>
            {count > 0 && (
              <button
                type="button"
                onClick={dismissAll}
                className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                Descartar todas
              </button>
            )}
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {count === 0 && !loading && (
              <div className="px-4 py-8 text-center">
                <span className="text-2xl">✓</span>
                <p className="mt-1 text-sm text-neutral-500">No hay notificaciones</p>
                <p className="mt-0.5 text-xs text-neutral-400">Estás al día</p>
              </div>
            )}
            {count === 0 && loading && (
              <div className="px-4 py-6 text-center text-xs text-neutral-400">Cargando...</div>
            )}
            {items.map((n) => {
              const actionUrl = extractActionUrl(n)
              return (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-neutral-50 border-l-4 ${SEVERITY_BORDER[n.severity]} hover:bg-neutral-50 transition-colors group`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm flex-none mt-0.5">{SEVERITY_ICON[n.severity]}</span>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className="text-left w-full"
                        disabled={!actionUrl}
                      >
                        <p className={`text-sm text-neutral-900 ${actionUrl ? 'hover:underline cursor-pointer' : ''}`}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2 whitespace-pre-line">
                            {n.message}
                          </p>
                        )}
                        <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-wider">
                          {n.source} · {fmtRelative(n.created_at)}
                        </p>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissOne(n.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-300 hover:text-neutral-700 text-sm flex-none mt-0.5"
                      title="Descartar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50">
            <p className="text-[10px] text-neutral-400 text-center">
              Las notificaciones se resuelven solas al aprobar/validar la solicitud.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
