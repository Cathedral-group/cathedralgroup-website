'use client'

import { useEffect, useState } from 'react'

interface CoberturaMetrics {
  supplier_nif_pct?: number
  number_pct?: number
  issue_date_pct?: number
  amount_pct?: number
  direction_pct?: number
  entity_id_pct?: number
  project_id_pct?: number
  drive_pct?: number
  sha256_pct?: number
}

interface RevisionMetrics {
  needs_review_pct?: number
  pendiente?: number
  revisado?: number
  confirmado?: number
  rechazado?: number
  error?: number
  confidence_avg?: number
  confidence_min?: number
  confidence_max?: number
}

interface ForensicMetrics {
  cobertura_pct?: number
  score_avg?: number
  score_min?: number
  critical_count?: number
  review_count?: number
  clean_count?: number
}

interface Snapshot {
  total?: number
  window_days?: number
  snapshot_at?: string
  cobertura_campos?: CoberturaMetrics
  revision?: RevisionMetrics
  providers?: Record<string, number>
  doctypes?: Record<string, number>
  forensic?: ForensicMetrics
  top_ai_razones?: string[]
  note?: string
}

interface HistoryEntry {
  id: string
  run_at: string
  run_type: string
  scope: string
  metrics: Snapshot
  notes: string | null
}

interface Props {
  snapshot7: Snapshot | null
  snapshot30: Snapshot | null
  snapshot365: Snapshot | null
  history: HistoryEntry[]
  userEmail: string
}

const fmtPct = (n?: number) => (n == null ? '--' : `${n.toFixed(1)}%`)
const fmtN = (n?: number) => (n == null ? '--' : n.toLocaleString('es-ES'))
const fmtDate = (d: string | null) => {
  if (!d) return '--'
  try {
    return new Date(d).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return d
  }
}

function PctRow({ label, value, target = 95, warn = 80 }: { label: string; value?: number; target?: number; warn?: number }) {
  if (value == null) return null
  const color = value >= target ? 'text-green-600' : value >= warn ? 'text-amber-600' : 'text-red-600'
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b last:border-b-0">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className={`text-sm font-mono font-bold ${color}`}>{fmtPct(value)}</span>
    </div>
  )
}

function KPI({ label, value, color = 'text-neutral-700' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

interface SystemHealth {
  checked_at: string
  overall_status: 'healthy' | 'degraded' | 'critical'
  components: {
    forensic_rpcs: { ok: number; failed: number; results: { rpc_name: string; ok: boolean }[] }
    workflows: { active: number; total: number; names: string[] }
    last_eval_snapshot: { run_at: string | null; total: number | null; minutes_ago: number | null }
    exceptions_pending: { count: number; oldest_minutes: number | null }
    backup_recent: { count_24h: number }
  }
  alerts: string[]
}

interface CostSummary {
  current_month: {
    month_start: string
    total_calls: number
    distinct_invoices: number
    tokens_input_total: number
    tokens_output_total: number
    cost_eur_total: number
    avg_duration_ms: number | null
    errors_count: number
    by_provider: Record<string, { calls: number; cost_eur: number; tokens: number }>
    by_context: Record<string, { calls: number; cost_eur: number }>
    avg_cost_per_invoice: number
  } | null
  monthly_by_provider: Array<{
    month: string
    provider: string
    call_count: number
    tokens_input_total: number
    tokens_output_total: number
    tokens_total_total: number
    cost_eur_total: number
    avg_duration_ms: number
    error_count: number
  }>
}

export default function EvalView({ snapshot7, snapshot30, snapshot365, history }: Props) {
  const [window, setWindow] = useState<7 | 30 | 365>(30)
  const [refreshing, setRefreshing] = useState(false)
  const [snaps, setSnaps] = useState({ 7: snapshot7, 30: snapshot30, 365: snapshot365 })
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [cost, setCost] = useState<CostSummary | null>(null)
  const [costLoading, setCostLoading] = useState(false)

  const loadHealth = async () => {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/health/system')
      if (res.ok) {
        const data = (await res.json()) as SystemHealth
        setHealth(data)
      }
    } catch {
      /* silent */
    } finally {
      setHealthLoading(false)
    }
  }

  const loadCost = async () => {
    setCostLoading(true)
    try {
      const res = await fetch('/api/eval/cost-summary?months=6')
      if (res.ok) {
        const data = (await res.json()) as CostSummary
        setCost(data)
      }
    } catch {
      /* silent */
    } finally {
      setCostLoading(false)
    }
  }

  useEffect(() => {
    loadHealth()
    loadCost()
  }, [])

  const current = snaps[window]
  const cob = current?.cobertura_campos ?? {}
  const rev = current?.revision ?? {}
  const forensic = current?.forensic ?? {}

  const refreshSnapshot = async (persist: boolean) => {
    setRefreshing(true)
    try {
      const url = `/api/eval/snapshot?days=${window}`
      const res = persist
        ? await fetch('/api/eval/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days: window }),
          })
        : await fetch(url)
      const json = await res.json()
      if (!res.ok) {
        alert(`Error: ${json.error ?? res.statusText}`)
        return
      }
      const newSnap = persist ? json.snapshot : json.snapshot
      setSnaps((s) => ({ ...s, [window]: newSnap }))
      if (persist) alert('Snapshot persistido en eval_runs')
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <main className="flex-1 p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Cathedral Admin · Observabilidad</p>
          <h1 className="text-2xl font-bold">Eval — salud del sistema</h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-3xl">
            <span className="font-semibold text-neutral-700">Eval = evaluación continua del sistema.</span>{' '}
            Mide cuántas facturas extrae bien la IA, qué porcentaje requiere revisión humana, cuánto cuesta el procesamiento
            y si hay drift (degradación) entre versiones. Sin estas métricas, cualquier cambio es ingeniería ciega.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-[11px] text-neutral-500">
            <div className="bg-neutral-50 rounded p-2">
              <span className="font-semibold text-neutral-700">Cobertura:</span> % de facturas con cada campo crítico extraído correctamente (NIF, importe, fecha…).
            </div>
            <div className="bg-neutral-50 rounded p-2">
              <span className="font-semibold text-neutral-700">Needs review:</span> facturas marcadas por la IA como sospechosas (necesitan validación humana).
            </div>
            <div className="bg-neutral-50 rounded p-2">
              <span className="font-semibold text-neutral-700">Forensic:</span> % con análisis anti-fraude completado (ver dashboard Forensic).
            </div>
            <div className="bg-neutral-50 rounded p-2">
              <span className="font-semibold text-neutral-700">Confidence:</span> certeza media de la IA al extraer datos (0,93 = muy alta, 0,5 = baja).
            </div>
          </div>
        </div>

        {/* Selector ventana */}
        <div className="flex gap-2 mb-6">
          {[7, 30, 365].map((d) => (
            <button
              key={d}
              onClick={() => setWindow(d as 7 | 30 | 365)}
              className={`px-4 py-2 rounded text-sm font-medium ${
                window === d
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {d} días
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => refreshSnapshot(false)}
            disabled={refreshing}
            className="px-4 py-2 rounded text-sm bg-white border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50"
          >
            {refreshing ? '…' : '↻ Refrescar'}
          </button>
          <button
            onClick={() => refreshSnapshot(true)}
            disabled={refreshing}
            className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Persistir snapshot
          </button>
        </div>

        {/* Health overview */}
        {health && (
          <div className={`rounded-lg border p-4 mb-6 ${
            health.overall_status === 'healthy' ? 'bg-green-50 border-green-200' :
            health.overall_status === 'degraded' ? 'bg-amber-50 border-amber-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                  health.overall_status === 'healthy' ? 'text-green-700' :
                  health.overall_status === 'degraded' ? 'text-amber-700' :
                  'text-red-700'
                }`}>
                  Health del sistema
                </span>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  health.overall_status === 'healthy' ? 'bg-green-100 text-green-700' :
                  health.overall_status === 'degraded' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {health.overall_status}
                </span>
              </div>
              <button
                onClick={loadHealth}
                disabled={healthLoading}
                className="text-xs text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
              >
                {healthLoading ? '…' : '↻ Re-check'}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase text-neutral-400">RPCs forensic</p>
                <p className={`font-mono font-bold ${health.components.forensic_rpcs.failed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {health.components.forensic_rpcs.ok}/{health.components.forensic_rpcs.ok + health.components.forensic_rpcs.failed}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-neutral-400">Workflows activos</p>
                <p className={`font-mono font-bold ${health.components.workflows.active < 6 ? 'text-amber-600' : 'text-green-600'}`}>
                  {health.components.workflows.active}/{health.components.workflows.total}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-neutral-400">Último eval</p>
                <p className="font-mono text-xs">
                  {health.components.last_eval_snapshot.minutes_ago != null
                    ? `${Math.round(health.components.last_eval_snapshot.minutes_ago / 60)}h`
                    : '--'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-neutral-400">Exceptions abiertas</p>
                <p className={`font-mono font-bold ${health.components.exceptions_pending.count > 50 ? 'text-red-600' : health.components.exceptions_pending.count > 10 ? 'text-amber-600' : 'text-green-600'}`}>
                  {health.components.exceptions_pending.count}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-neutral-400">Backups 24h</p>
                <p className={`font-mono font-bold ${health.components.backup_recent.count_24h === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {health.components.backup_recent.count_24h}
                </p>
              </div>
            </div>
            {health.alerts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-current opacity-70">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1">Alertas activas</p>
                <ul className="text-xs space-y-0.5 list-disc list-inside">
                  {health.alerts.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!current || current.total === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center text-neutral-500">
            {current?.note ?? 'Sin datos en la ventana seleccionada.'}
          </div>
        ) : (
          <>
            {/* 5 KPIs */}
            <div className="grid grid-cols-5 gap-3 mb-6">
              <KPI label={`Total ${window}d`} value={fmtN(current.total)} />
              <KPI
                label="Needs review"
                value={fmtPct(rev.needs_review_pct)}
                color={(rev.needs_review_pct ?? 0) > 15 ? 'text-amber-600' : 'text-neutral-700'}
              />
              <KPI
                label="Confirmadas"
                value={fmtN(rev.confirmado)}
                color={(rev.confirmado ?? 0) === 0 ? 'text-red-600' : 'text-green-600'}
              />
              <KPI
                label="Forensic cobertura"
                value={fmtPct(forensic.cobertura_pct)}
                color={(forensic.cobertura_pct ?? 0) < 50 ? 'text-red-600' : 'text-green-600'}
              />
              <KPI
                label="Confidence avg"
                value={rev.confidence_avg != null ? rev.confidence_avg.toFixed(3) : '--'}
                color={
                  (rev.confidence_avg ?? 0) >= 0.9
                    ? 'text-green-600'
                    : (rev.confidence_avg ?? 0) >= 0.7
                    ? 'text-amber-600'
                    : 'text-red-600'
                }
              />
            </div>

            {/* Cobertura campos */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h2 className="text-sm font-bold">Cobertura de campos</h2>
                <p className="text-[11px] text-neutral-400 mb-3 leading-snug">
                  % de facturas que tienen cada campo poblado. SHA-256 es el hash único del PDF (capa 1 anti-duplicados).
                  Entity ID = proveedor o cliente vinculado en BD.
                </p>
                <PctRow label="SHA-256 (Capa 1)" value={cob.sha256_pct} target={99} warn={95} />
                <PctRow label="Direction" value={cob.direction_pct} target={99} warn={95} />
                <PctRow label="Drive URL" value={cob.drive_pct} target={99} warn={95} />
                <PctRow label="Issue date" value={cob.issue_date_pct} target={95} warn={85} />
                <PctRow label="Number" value={cob.number_pct} target={95} warn={85} />
                <PctRow label="Amount total" value={cob.amount_pct} target={95} warn={85} />
                <PctRow label="Supplier NIF" value={cob.supplier_nif_pct} target={90} warn={75} />
                <PctRow label="Entity ID (supplier+client)" value={cob.entity_id_pct} target={70} warn={50} />
                <PctRow label="Project ID" value={cob.project_id_pct} target={50} warn={30} />
              </div>

              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h2 className="text-sm font-bold">Revisión humana</h2>
                <p className="text-[11px] text-neutral-400 mb-3 leading-snug">
                  Estado de validación final por uno de los socios. <span className="font-semibold">Confirmado</span> = OK
                  definitivo. <span className="font-semibold">Pendiente</span> = aún por revisar. Ideal: tender a 0 pendientes.
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="py-1.5 border-b">
                    <p className="text-neutral-400 text-xs">Pendiente</p>
                    <p className="font-mono font-bold text-amber-600">{fmtN(rev.pendiente)}</p>
                  </div>
                  <div className="py-1.5 border-b">
                    <p className="text-neutral-400 text-xs">Revisado</p>
                    <p className="font-mono font-bold text-blue-600">{fmtN(rev.revisado)}</p>
                  </div>
                  <div className="py-1.5 border-b">
                    <p className="text-neutral-400 text-xs">Confirmado</p>
                    <p className={`font-mono font-bold ${(rev.confirmado ?? 0) === 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtN(rev.confirmado)}
                    </p>
                  </div>
                  <div className="py-1.5 border-b">
                    <p className="text-neutral-400 text-xs">Rechazado</p>
                    <p className="font-mono font-bold text-red-600">{fmtN(rev.rechazado)}</p>
                  </div>
                  <div className="py-1.5 border-b">
                    <p className="text-neutral-400 text-xs">Error</p>
                    <p className="font-mono font-bold text-red-600">{fmtN(rev.error)}</p>
                  </div>
                  <div className="py-1.5 border-b">
                    <p className="text-neutral-400 text-xs">Needs review %</p>
                    <p className="font-mono font-bold text-neutral-700">{fmtPct(rev.needs_review_pct)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-neutral-500">
                    Confidence: avg <span className="font-mono">{rev.confidence_avg?.toFixed(3) ?? '--'}</span> · min{' '}
                    <span className="font-mono">{rev.confidence_min?.toFixed(3) ?? '--'}</span> · max{' '}
                    <span className="font-mono">{rev.confidence_max?.toFixed(3) ?? '--'}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Forensic + Providers */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h2 className="text-sm font-bold">Score Forensic</h2>
                <p className="text-[11px] text-neutral-400 mb-3 leading-snug">
                  Resultado del análisis anti-fraude por factura (0-100). Score &lt;50 = crítico, posible fraude.
                  50-79 = revisar. ≥80 = limpia.
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-neutral-400 text-xs">Limpias (≥80)</p>
                    <p className="font-mono font-bold text-green-600">{fmtN(forensic.clean_count)}</p>
                  </div>
                  <div>
                    <p className="text-neutral-400 text-xs">Revisión (50-79)</p>
                    <p className="font-mono font-bold text-amber-600">{fmtN(forensic.review_count)}</p>
                  </div>
                  <div>
                    <p className="text-neutral-400 text-xs">Críticas (&lt;50)</p>
                    <p className="font-mono font-bold text-red-600">{fmtN(forensic.critical_count)}</p>
                  </div>
                </div>
                <PctRow label="Cobertura forensic" value={forensic.cobertura_pct} target={95} warn={70} />
                <div className="text-xs text-neutral-500 mt-2">
                  Score promedio: <span className="font-mono font-bold">{forensic.score_avg ?? '--'}/100</span> · mín{' '}
                  {forensic.score_min ?? '--'}
                </div>
              </div>

              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h2 className="text-sm font-bold">Distribución</h2>
                <p className="text-[11px] text-neutral-400 mb-3 leading-snug">
                  AI Provider = qué modelo procesó cada factura (Gemini, GPT-4o, Mistral). Doc Type = tipo de documento detectado.
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">AI Provider</p>
                <div className="text-sm font-mono space-y-1 mb-3">
                  {Object.entries(current.providers ?? {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b py-0.5">
                      <span className="text-neutral-600">{k}</span>
                      <span className="font-bold">{fmtN(v)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Doc type</p>
                <div className="text-sm font-mono space-y-1">
                  {Object.entries(current.doctypes ?? {})
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b py-0.5">
                        <span className="text-neutral-600">{k}</span>
                        <span className="font-bold">{fmtN(v as number)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Coste IA */}
            {cost && cost.current_month && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold">Coste IA — mes actual</h2>
                  <button
                    onClick={loadCost}
                    disabled={costLoading}
                    className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
                  >
                    {costLoading ? '…' : '↻'}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400 mb-3 leading-snug">
                  Cuánto está costando procesar facturas con IA este mes. Cada llamada (extracción, OCR, reconciliación)
                  se registra con tokens consumidos y se calcula su coste real en euros.
                </p>
                {cost.current_month.total_calls === 0 ? (
                  <p className="text-sm text-neutral-500">
                    Sin registros en <code className="bg-neutral-100 px-1 rounded">ai_usage_log</code> todavía. Los datos
                    aparecerán cuando el workflow general empiece a registrar tokens por llamada IA.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-5 gap-3 mb-4">
                      <div>
                        <p className="text-[10px] uppercase text-neutral-400">Coste mes</p>
                        <p className="font-mono font-bold text-lg">
                          {cost.current_month.cost_eur_total.toFixed(2)} €
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-400">Coste / factura</p>
                        <p className="font-mono font-bold text-lg">
                          {cost.current_month.avg_cost_per_invoice.toFixed(4)} €
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-400">Llamadas IA</p>
                        <p className="font-mono font-bold">{fmtN(cost.current_month.total_calls)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-400">Tokens (M)</p>
                        <p className="font-mono font-bold">
                          {((cost.current_month.tokens_input_total + cost.current_month.tokens_output_total) / 1_000_000).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-400">Errores IA</p>
                        <p className={`font-mono font-bold ${cost.current_month.errors_count > 5 ? 'text-red-600' : ''}`}>
                          {fmtN(cost.current_month.errors_count)}
                        </p>
                      </div>
                    </div>
                    {Object.keys(cost.current_month.by_provider).length > 0 && (
                      <div className="text-xs">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">Por provider</p>
                        <div className="font-mono space-y-0.5">
                          {Object.entries(cost.current_month.by_provider)
                            .sort((a, b) => (b[1].cost_eur ?? 0) - (a[1].cost_eur ?? 0))
                            .map(([prov, data]) => (
                              <div key={prov} className="flex justify-between border-b py-1">
                                <span>{prov}</span>
                                <span className="text-neutral-500">
                                  {data.calls} calls · {(data.tokens / 1000).toFixed(1)}K tok · <span className="font-bold">{data.cost_eur.toFixed(4)} €</span>
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {cost.monthly_by_provider.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Histórico 6 meses</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-neutral-500">
                          <th className="text-left py-1">Mes</th>
                          <th className="text-left py-1">Provider</th>
                          <th className="text-right py-1">Calls</th>
                          <th className="text-right py-1">Tokens</th>
                          <th className="text-right py-1">Coste €</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cost.monthly_by_provider.slice(0, 12).map((row, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-1 font-mono">{row.month}</td>
                            <td className="py-1">{row.provider}</td>
                            <td className="py-1 text-right font-mono">{fmtN(row.call_count)}</td>
                            <td className="py-1 text-right font-mono">
                              {(row.tokens_total_total / 1000).toFixed(1)}K
                            </td>
                            <td className="py-1 text-right font-mono font-bold">
                              {row.cost_eur_total.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Top razones IA */}
            {(current.top_ai_razones?.length ?? 0) > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
                <h2 className="text-sm font-bold">Top 10 razones IA / Verificador</h2>
                <p className="text-[11px] text-neutral-400 mb-3 leading-snug">
                  Motivos más frecuentes por los que las facturas se marcan para revisión. Útil para detectar patrones
                  recurrentes (ej. siempre falla el mismo tipo de factura → ajustar el extractor).
                </p>
                <ol className="text-xs space-y-1.5 list-decimal list-inside">
                  {current.top_ai_razones!.slice(0, 10).map((r, i) => (
                    <li key={i} className="text-neutral-700 truncate" title={r}>
                      {r}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}

        {/* Histórico */}
        {history.length > 0 && (
          <div className="bg-white rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-bold mb-3">Histórico snapshots persistidos</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Needs Rev %</th>
                  <th className="text-right p-2">Confidence</th>
                  <th className="text-right p-2">Forensic %</th>
                  <th className="text-left p-2">Notas</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="p-2 font-mono">{fmtDate(h.run_at)}</td>
                    <td className="p-2">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100">
                        {h.run_type}
                      </span>
                    </td>
                    <td className="p-2 text-right font-mono">{fmtN(h.metrics?.total)}</td>
                    <td className="p-2 text-right font-mono">{fmtPct(h.metrics?.revision?.needs_review_pct)}</td>
                    <td className="p-2 text-right font-mono">
                      {h.metrics?.revision?.confidence_avg?.toFixed(3) ?? '--'}
                    </td>
                    <td className="p-2 text-right font-mono">{fmtPct(h.metrics?.forensic?.cobertura_pct)}</td>
                    <td className="p-2 text-neutral-500 truncate max-w-[200px]" title={h.notes ?? ''}>
                      {h.notes ?? '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
