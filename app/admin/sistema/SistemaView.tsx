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

  const { supabase } = status

  // Salud inferida de actividad real (sin necesidad de consultar n8n)
  const lastInvoiceHoursAgo = supabase.last_invoice?.hours_ago ?? 9999
  const isWorkingHours = (() => {
    const hour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }))
    const day = new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' })
    return hour >= 9 && hour <= 21 && day !== 'Sat' && day !== 'Sun'
  })()
  // Si en horario laboral lleva >4h sin procesar nada → posible problema
  const workflowSilent = isWorkingHours && lastInvoiceHoursAgo > 4
  const overallOk = supabase.errores_pendientes === 0 && !workflowSilent

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
                {supabase.errores_pendientes > 0 && (
                  <li>{supabase.errores_pendientes} factura{supabase.errores_pendientes > 1 ? 's' : ''} con error en bandeja → revisar y reprocesar</li>
                )}
                {workflowSilent && (
                  <li>El workflow no procesa nada desde hace {lastInvoiceHoursAgo}h en horario laboral. Posible: workflow caído, OAuth Gmail caducado, o simplemente no llegan emails con factura. Verificar en n8n console.</li>
                )}
              </ul>
            )}
            {overallOk && supabase.last_invoice && (
              <p className="text-xs text-green-700 mt-1">
                Última factura procesada hace {supabase.last_invoice.hours_ago}h
              </p>
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

      {/* Workflows automáticos (descripción, no estado en vivo) */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">🤖 Automatizaciones activas</h2>
        <div className="p-4 bg-white border border-neutral-200 rounded text-xs text-neutral-600 leading-relaxed">
          <p className="mb-2"><strong>Workflow general (n8n)</strong>: cada 5 minutos consulta los 7 buzones de Gmail
          (d.vieco@, info@, administracion@, jm.lozano@, j.rivera@, cathedralhouseinvest@, cathedralhouseinvestment@).
          Cuando llega un email con adjunto, lo procesa con GPT-4o, lo sube a Drive y lo inserta en esta base de datos.</p>
          <p className="mb-2"><strong>Healthcheck diario</strong>: a las 9:00 hora Madrid envía email a d.vieco@ con resumen del día anterior (procesadas, errores, importe total).</p>
          <p className="mb-3"><strong>Watchdog</strong>: cada hora 8-22 (L-V Madrid) verifica que el workflow general procesó algo en las últimas 2h. Si no, envía alerta automática.</p>
          <p className="text-neutral-500 italic">
            La salud arriba se infiere automáticamente de la actividad real registrada en Supabase. Si necesitas ver el detalle interno de los workflows (ejecuciones, errores específicos, configuración), accede directamente a&nbsp;
            <a href="https://n8n.cathedralgroup.es" target="_blank" rel="noreferrer" className="underline font-semibold text-primary">n8n.cathedralgroup.es</a>
          </p>
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
