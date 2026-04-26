'use client'

import { useState, useEffect, useCallback } from 'react'

type SystemStatus = {
  timestamp: string
  supabase: {
    invoices_24h: number
    invoices_7d: number
    invoices_total: number
    errores_pendientes: number
    con_drive_url: number
    total_activas: number
    drive_coverage_pct: number
    last_invoice: { created_at: string; empresa: string | null; amount_total: number | null; hours_ago: number } | null
  }
  n8n: {
    configured: boolean
    general_active: boolean
    healthcheck_active: boolean
    last_execution: { id: string; status: string; startedAt: string; stoppedAt: string | null } | null
    last_error: { id: string; startedAt: string } | null
  }
}

function formatES(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })
}

function StatusDot({ ok, warning = false }: { ok: boolean; warning?: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        ok ? 'bg-green-500' : warning ? 'bg-amber-500' : 'bg-red-500'
      }`}
      aria-label={ok ? 'OK' : warning ? 'Atención' : 'Error'}
    />
  )
}

export default function SistemaView() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/system-status', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const data = (await res.json()) as SystemStatus
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  if (loading) {
    return <div className="p-6 text-neutral-400">Cargando estado del sistema...</div>
  }
  if (error || !status) {
    return (
      <div className="p-6">
        <p className="text-red-600">Error: {error || 'sin datos'}</p>
        <button onClick={fetchStatus} className="mt-4 px-4 py-2 bg-neutral-900 text-white rounded text-sm">Reintentar</button>
      </div>
    )
  }

  const { supabase, n8n } = status

  // Salud global: ¿algo va mal?
  const lastInvoiceHoursAgo = supabase.last_invoice?.hours_ago ?? 9999
  const isWorkingHours = (() => {
    const hour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }))
    const day = new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' })
    return hour >= 9 && hour <= 21 && day !== 'Sat' && day !== 'Sun'
  })()
  const workflowSilent = isWorkingHours && lastInvoiceHoursAgo > 4
  const overallOk = n8n.general_active && n8n.healthcheck_active && supabase.errores_pendientes === 0 && !workflowSilent

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Estado del sistema</h1>
          <p className="text-xs text-neutral-400 mt-1">Actualizado: {formatES(status.timestamp)} (hora Madrid)</p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={refreshing}
          className="px-4 py-2 bg-neutral-900 text-white text-xs font-bold uppercase tracking-widest rounded disabled:opacity-50"
        >
          {refreshing ? 'Actualizando...' : '↻ Refrescar'}
        </button>
      </div>

      {/* Salud global */}
      <div className={`mb-8 p-5 rounded-lg border-2 ${overallOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-3">
          <StatusDot ok={overallOk} warning={!overallOk} />
          <div>
            <p className={`text-lg font-bold ${overallOk ? 'text-green-800' : 'text-amber-800'}`}>
              {overallOk ? 'Sistema operando con normalidad' : 'Hay puntos que requieren atención'}
            </p>
            {!overallOk && (
              <ul className="text-xs text-amber-700 mt-1 ml-1 list-disc list-inside">
                {!n8n.general_active && <li>Workflow general n8n DESACTIVADO</li>}
                {!n8n.healthcheck_active && <li>Workflow Healthcheck n8n desactivado</li>}
                {supabase.errores_pendientes > 0 && <li>{supabase.errores_pendientes} factura{supabase.errores_pendientes > 1 ? 's' : ''} con error en bandeja</li>}
                {workflowSilent && <li>Workflow no procesa nada desde hace {lastInvoiceHoursAgo}h en horario laboral</li>}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Stats Supabase */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">📊 Procesado de documentos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Procesadas hoy" value={supabase.invoices_24h} hint="Últimas 24h" />
          <StatCard label="Procesadas semana" value={supabase.invoices_7d} hint="Últimos 7 días" />
          <StatCard label="Total activas" value={supabase.invoices_total} hint="En base de datos" />
          <StatCard
            label="❌ Errores pendientes"
            value={supabase.errores_pendientes}
            hint="Bandeja Errores"
            highlightIfPositive
          />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white border border-neutral-200 rounded">
            <p className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Cobertura Drive</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-800">{supabase.drive_coverage_pct}%</span>
              <span className="text-xs text-neutral-500">{supabase.con_drive_url} de {supabase.total_activas}</span>
            </div>
            <div className="mt-3 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${supabase.drive_coverage_pct >= 95 ? 'bg-green-500' : supabase.drive_coverage_pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${supabase.drive_coverage_pct}%` }}
              />
            </div>
          </div>
          <div className="p-4 bg-white border border-neutral-200 rounded">
            <p className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Última factura procesada</p>
            {supabase.last_invoice ? (
              <>
                <p className="text-sm font-semibold text-neutral-800 truncate">{supabase.last_invoice.empresa || '(sin empresa)'}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {supabase.last_invoice.amount_total ? `${supabase.last_invoice.amount_total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} · ` : ''}
                  hace {supabase.last_invoice.hours_ago}h
                </p>
                <p className="text-[10px] text-neutral-400 mt-1">{formatES(supabase.last_invoice.created_at)}</p>
              </>
            ) : (
              <p className="text-sm text-neutral-400">Sin facturas en BD</p>
            )}
          </div>
        </div>
      </section>

      {/* Estado n8n */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">🤖 Workflows n8n</h2>
        {!n8n.configured && (
          <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded mb-3">
            ⚠ N8N_API_KEY no configurada en Vercel — sólo se muestra info Supabase
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white border border-neutral-200 rounded">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-800">Workflow General</p>
              <StatusDot ok={n8n.general_active} />
            </div>
            <p className="text-xs text-neutral-500 mb-2">
              {n8n.general_active ? '✓ Activo (procesa emails entrantes)' : '✗ DESACTIVADO'}
            </p>
            {n8n.last_execution && (
              <div className="mt-3 pt-3 border-t border-neutral-100">
                <p className="text-[10px] uppercase tracking-widest text-neutral-400">Última ejecución</p>
                <p className="text-xs text-neutral-700 mt-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mr-2 ${
                    n8n.last_execution.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>{n8n.last_execution.status}</span>
                  #{n8n.last_execution.id} · {formatES(n8n.last_execution.startedAt)}
                </p>
              </div>
            )}
            {n8n.last_error && (
              <div className="mt-2 pt-2 border-t border-neutral-100">
                <p className="text-[10px] uppercase tracking-widest text-red-400">Último error</p>
                <p className="text-xs text-red-700 mt-1">#{n8n.last_error.id} · {formatES(n8n.last_error.startedAt)}</p>
              </div>
            )}
          </div>
          <div className="p-4 bg-white border border-neutral-200 rounded">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-800">Workflow Healthcheck + Watchdog</p>
              <StatusDot ok={n8n.healthcheck_active} />
            </div>
            <p className="text-xs text-neutral-500 mb-2">
              {n8n.healthcheck_active ? '✓ Activo (email diario 9:00 + watchdog horario)' : '✗ DESACTIVADO'}
            </p>
            <ul className="text-[10px] text-neutral-400 mt-3 list-disc list-inside space-y-0.5">
              <li>9:00 hora Madrid: email diario con stats</li>
              <li>Cada hora 8-22h L-V: alerta si workflow general lleva &gt;2h sin actividad</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">🔗 Enlaces útiles</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/facturas" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">→ Bandeja de Errores</a>
          <a href="/admin/revision" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">→ Revisión IA</a>
          <a href="https://n8n.cathedralgroup.es" target="_blank" rel="noreferrer" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">↗ n8n Console</a>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, hint, highlightIfPositive = false }: { label: string; value: number; hint?: string; highlightIfPositive?: boolean }) {
  const highlight = highlightIfPositive && value > 0
  return (
    <div className={`p-4 rounded border ${highlight ? 'bg-red-50 border-red-200' : 'bg-white border-neutral-200'}`}>
      <p className="text-xs uppercase tracking-widest text-neutral-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? 'text-red-700' : 'text-neutral-800'}`}>{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-1">{hint}</p>}
    </div>
  )
}
