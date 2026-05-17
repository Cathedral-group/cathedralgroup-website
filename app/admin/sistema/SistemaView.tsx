'use client'

import { useState, useEffect, useCallback } from 'react'

type WorkflowHealth = {
  status: 'ok' | 'warning' | 'critical'
  reasons: string[]
  recommendations: string[]
  stats: {
    last_doc_at: string | null
    hours_since_last: number | null
    count_24h: number
    count_7d: number
    errors_24h: number
  }
  laboral_hour_now: boolean
  checked_at: string
}

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
  const [health, setHealth] = useState<WorkflowHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = useCallback(async () => {
    setRefreshing(true)
    try {
      // Fetch both endpoints in parallel
      const [statusRes, healthRes] = await Promise.all([
        fetch('/api/admin/system-status', { cache: 'no-store' }),
        fetch('/api/health/workflow', { cache: 'no-store' }),
      ])
      if (!statusRes.ok) {
        const body = await statusRes.json().catch(() => ({}))
        throw new Error(body.error || `Error ${statusRes.status}`)
      }
      const data = (await statusRes.json()) as SystemStatus
      setStatus(data)
      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as WorkflowHealth
        setHealth(healthData)
      }
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

      {/* ─── Semáforo del workflow (sesión 25) ─── */}
      {health && (
        <div className={`mb-6 p-5 rounded-lg border-2 ${
          health.status === 'ok' ? 'bg-green-50 border-green-300' :
          health.status === 'warning' ? 'bg-amber-50 border-amber-300' :
          'bg-red-50 border-red-300'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`mt-1 h-4 w-4 rounded-full ${
              health.status === 'ok' ? 'bg-green-500' :
              health.status === 'warning' ? 'bg-amber-500' :
              'bg-red-500 animate-pulse'
            }`} />
            <div className="flex-1">
              <p className={`text-lg font-bold ${
                health.status === 'ok' ? 'text-green-800' :
                health.status === 'warning' ? 'text-amber-800' :
                'text-red-800'
              }`}>
                {health.status === 'ok' ? '🟢 Workflow procesando con normalidad' :
                 health.status === 'warning' ? '🟡 Atención: revisar workflow' :
                 '🔴 Workflow PARADO o con problemas graves'}
              </p>
              {health.stats.last_doc_at && (
                <p className="text-xs text-neutral-600 mt-1">
                  Último doc procesado: hace <strong>{health.stats.hours_since_last?.toFixed(1)}h</strong> ·
                  &nbsp;Últimas 24h: <strong>{health.stats.count_24h}</strong> docs ·
                  &nbsp;Últimos 7d: <strong>{health.stats.count_7d}</strong>
                  {health.stats.errors_24h > 0 && (
                    <> · <span className="text-red-600 font-bold">{health.stats.errors_24h} errores</span></>
                  )}
                </p>
              )}
              {health.reasons.length > 0 && (
                <ul className={`text-xs mt-2 ml-1 list-disc list-inside ${
                  health.status === 'critical' ? 'text-red-700' : 'text-amber-700'
                }`}>
                  {health.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {health.recommendations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-current/20">
                  <p className={`text-[10px] uppercase tracking-widest font-bold mb-1 ${
                    health.status === 'critical' ? 'text-red-700' : 'text-amber-700'
                  }`}>Recomendaciones:</p>
                  <ul className="text-xs text-neutral-700 list-disc list-inside space-y-0.5">
                    {health.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Salud global (cobertura Drive + errores acumulados) */}
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
          <p className="mb-2"><strong>Flujo general (n8n)</strong>: cada 5 minutos consulta los 7 buzones de Gmail
          (d.vieco@, info@, administracion@, jm.lozano@, j.rivera@, cathedralhouseinvest@, cathedralhouseinvestment@).
          Cuando llega un email con adjunto, lo procesa con GPT-4o, lo sube a Drive y lo inserta en esta base de datos.</p>
          <p className="mb-2"><strong>Comprobación de estado diaria</strong>: a las 9:00 hora Madrid envía email a d.vieco@ con resumen del día anterior (procesadas, errores, importe total).</p>
          <p className="mb-3"><strong>Vigilante</strong>: cada hora 8-22 (L-V Madrid) verifica que el flujo general procesó algo en las últimas 2h. Si no, envía alerta automática.</p>
          <p className="text-neutral-500 italic">
            La salud arriba se infiere automáticamente de la actividad real registrada en Supabase. Si necesitas ver el detalle interno de los workflows (ejecuciones, errores específicos, configuración), accede directamente a&nbsp;
            <a href="https://n8n.cathedralgroup.es" target="_blank" rel="noreferrer" className="underline font-semibold text-primary">n8n.cathedralgroup.es</a>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">🔗 Enlaces útiles</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/eval" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">→ Eval (métricas)</a>
          <a href="/admin/forensic" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">→ Forensic</a>
          <a href="/admin/facturas" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">→ Bandeja de Errores</a>
          <a href="/admin/revision" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">→ Revisión IA</a>
          <a href="https://n8n.cathedralgroup.es" target="_blank" rel="noreferrer" className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded">↗ n8n Console</a>
        </div>
      </section>

      <OperationsActions />
    </div>
  )
}

function OperationsActions() {
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<{ action: string; ok: boolean; message: string; duration_ms: number } | null>(null)

  const run = async (action: string, label: string) => {
    if (running) return
    if (!confirm(`Ejecutar acción operativa: ${label}?`)) return
    setRunning(action)
    setResult(null)
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        const summary = (() => {
          if (action === 'force_eval_snapshot') {
            const total = json.result?.snapshot?.total ?? '?'
            return `OK · snapshot ${total} facturas`
          }
          if (action === 'cleanup_idempotency') {
            return `OK · ${json.result?.deleted_count ?? 0} rows eliminadas`
          }
          if (action === 'recalculate_costs') {
            return `OK · ${json.result?.updated_count ?? 0} actualizadas, total ${json.result?.total_cost_eur ?? 0}€`
          }
          if (action === 'forensic_rpcs_check') {
            const failed = json.result?.failed_count ?? 0
            return failed > 0 ? `⚠️ ${failed} RPC(s) con error` : `OK · 7/7 RPCs correctos`
          }
          if (action === 'create_test_notification') {
            return `OK · notification creada (ver banner)`
          }
          if (action === 'trigger_backup' || action === 'trigger_backup_pre_migration') {
            const runId = json.result?.run_id ?? '?'
            return `OK · workflow disparado · run_id ${String(runId).slice(0, 8)}…`
          }
          return 'OK'
        })()
        setResult({ action, ok: true, message: summary, duration_ms: json.duration_ms })
      } else {
        setResult({ action, ok: false, message: json.error ?? 'error desconocido', duration_ms: json.duration_ms ?? 0 })
      }
    } catch (e) {
      setResult({ action, ok: false, message: e instanceof Error ? e.message : String(e), duration_ms: 0 })
    } finally {
      setRunning(null)
    }
  }

  const ACTIONS: { key: string; label: string; description: string; danger?: boolean }[] = [
    {
      key: 'force_eval_snapshot',
      label: '📊 Forzar snapshot eval',
      description: 'Crea un snapshot de métricas y lo persiste en eval_runs (normalmente 04:30 Madrid)',
    },
    {
      key: 'forensic_rpcs_check',
      label: '🛡️ Test 7 RPCs forensic',
      description: 'Ejecuta forensic_rpcs_healthcheck y reporta cualquier fallo',
    },
    {
      key: 'recalculate_costs',
      label: '💰 Recalcular cost_eur IA',
      description: 'Recalcula coste de filas ai_usage_log con cost_eur=NULL usando ai_pricing_table',
    },
    {
      key: 'cleanup_idempotency',
      label: '🧹 Limpiar webhook_idempotency',
      description: 'Borra rows >24h (normalmente cron cada 6h)',
    },
    {
      key: 'create_test_notification',
      label: '🔔 Notif de prueba',
      description: 'Crea notificación info para verificar que el banner funciona',
    },
    {
      key: 'trigger_backup',
      label: '💾 Backup manual ahora',
      description: 'Dispara GitHub Actions backup-db.yml (pg_dump cifrado GPG → Drive). Tarda ~3-5 min, status visible en /admin/sistema',
    },
    {
      key: 'trigger_backup_pre_migration',
      label: '🛡️ Snapshot pre-migración',
      description: 'Igual que el anterior pero categorizado como pre_migration en backup_runs. Usar SIEMPRE antes de aplicar migraciones destructivas',
      danger: true,
    },
  ]

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">⚙️ Acciones operativas</h2>
      <p className="text-xs text-neutral-500 mb-4 max-w-3xl">
        Ejecuciones manuales que normalmente corren en cron (eval diario 04:30, health 6h, cleanup 6h).
        Útiles para diagnóstico inmediato sin esperar al siguiente run programado.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => run(a.key, a.label)}
            disabled={running !== null}
            className={`text-left p-3 rounded border transition-colors ${
              a.danger
                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                : 'bg-white border-neutral-200 hover:bg-neutral-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <p className="font-bold text-sm">{a.label}</p>
            <p className="text-[11px] text-neutral-500 mt-1 leading-snug">{a.description}</p>
            {running === a.key && (
              <p className="text-[10px] uppercase tracking-widest text-blue-600 mt-2">Ejecutando…</p>
            )}
          </button>
        ))}
      </div>
      {result && (
        <div
          className={`mt-4 p-3 rounded border ${
            result.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <p className="text-xs font-bold">
            {result.ok ? '✓' : '✗'} {result.action} · {result.duration_ms}ms
          </p>
          <p className="text-sm mt-1">{result.message}</p>
        </div>
      )}
    </section>
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
