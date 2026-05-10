'use client'

import { useEffect, useState } from 'react'

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

const SEVERITY_STYLES: Record<Notification['severity'], { bg: string; border: string; text: string; icon: string }> = {
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', icon: 'ℹ️' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', icon: '⚠️' },
  critical: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', icon: '🚨' },
}

const fmtRelative = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} d`
}

export default function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/notifications')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setNotifications(json.notifications ?? [])
      } catch {
        /* silent */
      }
    }
    load()
    const id = setInterval(load, 60_000) // refresh cada minuto
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const dismiss = async (n: Notification) => {
    setDismissing(n.id)
    try {
      const res = await fetch(`/api/notifications/${n.id}/dismiss`, { method: 'PATCH' })
      if (res.ok) {
        setNotifications((prev) => prev.filter((x) => x.id !== n.id))
      }
    } finally {
      setDismissing(null)
    }
  }

  const snooze = async (n: Notification, hours: number) => {
    setDismissing(n.id)
    try {
      const res = await fetch(`/api/notifications/${n.id}/snooze`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      })
      if (res.ok) {
        setNotifications((prev) => prev.filter((x) => x.id !== n.id))
      }
    } finally {
      setDismissing(null)
    }
  }

  if (notifications.length === 0) return null

  const critical = notifications.filter((n) => n.severity === 'critical').length
  const warnings = notifications.filter((n) => n.severity === 'warning').length

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 bg-white border border-neutral-300 rounded-full shadow-lg px-4 py-2 hover:shadow-xl"
      >
        <span className="text-sm font-bold">
          {critical > 0 && <span className="text-red-700">🚨 {critical}</span>}
          {critical > 0 && warnings > 0 && <span className="mx-1">·</span>}
          {warnings > 0 && <span className="text-amber-700">⚠️ {warnings}</span>}
          {critical === 0 && warnings === 0 && <span className="text-blue-700">ℹ️ {notifications.length}</span>}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">Mostrar</span>
      </button>
    )
  }

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          {notifications.length} notificación{notifications.length !== 1 ? 'es' : ''} activa{notifications.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-600"
        >
          Minimizar
        </button>
      </div>
      {notifications.map((n) => {
        const s = SEVERITY_STYLES[n.severity]
        return (
          <div
            key={n.id}
            className={`${s.bg} ${s.border} border rounded-lg p-3 flex items-start gap-3`}
          >
            <span className="text-lg flex-shrink-0">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <p className={`font-bold text-sm ${s.text}`}>{n.title}</p>
                <span className={`text-[10px] uppercase tracking-widest ${s.text} opacity-60`}>
                  {n.source}
                </span>
                <span className={`text-[10px] ${s.text} opacity-50 ml-auto`}>
                  {fmtRelative(n.created_at)}
                </span>
              </div>
              {n.message && (
                <p className={`text-xs ${s.text} opacity-80 leading-snug whitespace-pre-line`}>{n.message}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => snooze(n, 24)}
                disabled={dismissing === n.id}
                title="Posponer 24h"
                className={`text-[10px] font-bold uppercase tracking-widest ${s.text} opacity-50 hover:opacity-100 disabled:opacity-30`}
                aria-label="Posponer 24h"
              >
                Snooze
              </button>
              <button
                onClick={() => dismiss(n)}
                disabled={dismissing === n.id}
                title="Descartar definitivamente"
                className={`text-xs font-bold uppercase tracking-widest ${s.text} opacity-60 hover:opacity-100 disabled:opacity-30`}
                aria-label="Descartar"
              >
                {dismissing === n.id ? '…' : '✕'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
