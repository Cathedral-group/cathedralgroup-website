'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Health {
  overall_status: 'healthy' | 'degraded' | 'critical'
  components: {
    forensic_rpcs: { ok: number; failed: number }
    workflows: { active: number; total: number }
    last_eval_snapshot: { minutes_ago: number | null }
    exceptions_pending: { count: number }
  }
  alerts: string[]
}

const STYLE: Record<Health['overall_status'], { bg: string; text: string; icon: string; label: string }> = {
  healthy: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: '🟢', label: 'Sano' },
  degraded: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: '🟡', label: 'Degradado' },
  critical: { bg: 'bg-red-50 border-red-300', text: 'text-red-700', icon: '🔴', label: 'Crítico' },
}

export default function SystemHealthCompact() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/health/system')
        if (!res.ok) return
        const data = (await res.json()) as Health
        if (!cancelled) setHealth(data)
      } catch {
        /* silent */
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000) // refresh cada 5 min
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!health) return null

  const s = STYLE[health.overall_status]
  const rpcs = health.components.forensic_rpcs
  const wfs = health.components.workflows
  const evalAgo = health.components.last_eval_snapshot.minutes_ago
  const exc = health.components.exceptions_pending.count

  return (
    <Link
      href="/admin/eval"
      className={`block ${s.bg} border rounded-lg px-4 py-2.5 mb-4 hover:shadow-sm transition-shadow`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-base">{s.icon}</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${s.text}`}>
          Sistema {s.label}
        </span>
        <div className="flex items-center gap-3 text-xs text-neutral-700 font-mono ml-auto">
          <span title="RPCs forensic OK / total">
            RPCs <strong className={rpcs.failed > 0 ? 'text-red-600' : 'text-green-600'}>
              {rpcs.ok}/{rpcs.ok + rpcs.failed}
            </strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span title="Workflows n8n activos">
            Workflows <strong className={wfs.active < 6 ? 'text-amber-600' : 'text-green-600'}>{wfs.active}</strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span title="Excepciones pendientes sin resolver">
            Exc <strong className={exc > 50 ? 'text-red-600' : exc > 10 ? 'text-amber-600' : 'text-neutral-700'}>{exc}</strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span title="Minutos desde último snapshot eval">
            Eval{' '}
            <strong className={evalAgo != null && evalAgo > 60 * 36 ? 'text-amber-600' : 'text-neutral-700'}>
              {evalAgo == null ? '--' : evalAgo < 60 ? `${evalAgo}m` : `${Math.round(evalAgo / 60)}h`}
            </strong>
          </span>
        </div>
        <span className={`text-[10px] uppercase tracking-widest ${s.text} hover:underline`}>
          Detalle →
        </span>
      </div>
      {health.alerts.length > 0 && (
        <div className={`mt-2 pt-2 border-t border-current text-xs ${s.text} opacity-75`}>
          {health.alerts.length} alerta{health.alerts.length !== 1 ? 's' : ''} activa
          {health.alerts.length !== 1 ? 's' : ''}: {health.alerts[0]}
          {health.alerts.length > 1 && ` (+${health.alerts.length - 1} más)`}
        </div>
      )}
    </Link>
  )
}
