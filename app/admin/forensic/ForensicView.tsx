'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface ForensicRow {
  forensic_id: string
  invoice_id: string
  score: number | null
  pdf_alerts: string[] | null
  email_alerts: string[] | null
  numeracion_alerts: string[] | null
  duplicados_alerts: string[] | null
  decision: string | null
  reviewed_at: string | null
  notes: string | null
  forensic_created_at: string
  total_alerts: number
  invoice_number: string | null
  supplier_nif: string | null
  empresa: string | null
  amount_total: number | null
  issue_date: string | null
  direction: string | null
  original_filename: string | null
  drive_url: string | null
  review_status: string | null
}

interface Props {
  rows: ForensicRow[]
  userEmail?: string
}

const fmtAmount = (n: number | null) =>
  n == null ? '--' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

const fmtDate = (d: string | null) => {
  if (!d) return '--'
  try {
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return d
  }
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-neutral-400 text-xs">--</span>
  const color = score >= 80 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>🛡️ {score}/100</span>
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Sin decidir</span>
  const map: Record<string, string> = {
    aceptada: 'bg-green-100 text-green-700',
    rechazada: 'bg-red-100 text-red-700',
    revisada: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${map[decision] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {decision}
    </span>
  )
}

export default function ForensicView({ rows: initialRows }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const catFromUrl = searchParams?.get('cat') ?? 'todas'
  const [category, setCategory] = useState<string>(catFromUrl)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ForensicRow[]>(initialRows)
  const [selected, setSelected] = useState<ForensicRow | null>(null)
  const [savingDecision, setSavingDecision] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  // Sincronizar notes draft cuando cambia la fila seleccionada
  useEffect(() => {
    setNotesDraft(selected?.notes ?? '')
  }, [selected?.forensic_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveDecision = async (decision: 'aceptada' | 'rechazada' | 'revisada') => {
    if (!selected) return
    setSavingDecision(decision)
    try {
      const res = await fetch(`/api/forensic/${selected.forensic_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: notesDraft || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Error guardando decisión: ${err.error ?? res.statusText}`)
        return
      }
      const reviewedAt = new Date().toISOString()
      // Actualizar lista local y el seleccionado
      setRows((prev) =>
        prev.map((r) =>
          r.forensic_id === selected.forensic_id
            ? { ...r, decision, notes: notesDraft || null, reviewed_at: reviewedAt }
            : r,
        ),
      )
      setSelected({ ...selected, decision, notes: notesDraft || null, reviewed_at: reviewedAt })
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSavingDecision(null)
    }
  }

  useEffect(() => {
    const newCat = searchParams?.get('cat') ?? 'todas'
    if (newCat !== category) setCategory(newCat)
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // KPIs
  const stats = useMemo(() => {
    const total = rows.length
    let critical = 0
    let review = 0
    let clean = 0
    let pendingDecision = 0
    let withAlerts = 0
    for (const r of rows) {
      const s = r.score ?? 100
      if (s < 50) critical++
      else if (s < 80) review++
      else clean++
      if (!r.decision) pendingDecision++
      if (r.total_alerts > 0) withAlerts++
    }
    return { total, critical, review, clean, pendingDecision, withAlerts }
  }, [rows])

  // Categorización por drill-down
  const categorize = (r: ForensicRow): string => {
    const s = r.score ?? 100
    if (s < 50) return 'criticas'
    if (s < 80) return 'revision'
    if (!r.decision) return 'sin_decidir'
    if (r.total_alerts > 0) return 'con_alertas'
    return 'limpias'
  }

  const drillDownItems = [
    { key: 'todas', label: 'Todas', count: rows.length },
    { key: 'criticas', label: '🔴 Críticas (<50)', count: stats.critical },
    { key: 'revision', label: '🟡 Revisión (50-79)', count: stats.review },
    { key: 'limpias', label: '🟢 Limpias (≥80)', count: stats.clean },
    { key: 'sin_decidir', label: 'Sin decidir', count: stats.pendingDecision },
    { key: 'con_alertas', label: 'Con alertas', count: stats.withAlerts },
  ]

  const setCat = (c: string) => {
    setCategory(c)
    const url = c === 'todas' ? '/admin/forensic' : `/admin/forensic?cat=${c}`
    router.replace(url, { scroll: false })
  }

  const filtered = useMemo(() => {
    let list = rows
    if (category !== 'todas') {
      list = list.filter((r) => categorize(r) === category)
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter((r) =>
        [r.invoice_number, r.empresa, r.supplier_nif, r.original_filename]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      )
    }
    return list
  }, [rows, category, search])

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Sidebar drill-down */}
      <aside className="w-60 bg-white border-r border-neutral-200 p-4">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Forensic</h2>
        <nav className="space-y-1">
          {drillDownItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setCat(item.key)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                category === item.key
                  ? 'bg-neutral-100 text-neutral-900 font-medium'
                  : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-xs text-neutral-400">{item.count}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Cathedral Admin</p>
          <h1 className="text-2xl font-bold">Análisis Forensic</h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-3xl">
            <span className="font-semibold text-neutral-700">Forensic = investigación profesional anti-fraude.</span>{' '}
            Cada factura pasa por 6 chequeos automáticos que detectan: manipulación del PDF (modificaciones tardías,
            firmas digitales falsas), duplicados disimulados, errores de numeración del proveedor, importes que
            superan el presupuesto del proyecto, y emails sospechosos (anti-BEC: cuando un proveedor cambia su
            email habitual).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-[11px] text-neutral-500">
            <div className="bg-neutral-50 rounded p-2">
              <span className="font-semibold text-neutral-700">Score 80-100:</span> factura limpia, sin alertas relevantes.
            </div>
            <div className="bg-amber-50 rounded p-2">
              <span className="font-semibold text-amber-700">Score 50-79:</span> revisar, alertas menores detectadas.
            </div>
            <div className="bg-red-50 rounded p-2">
              <span className="font-semibold text-red-700">Score &lt;50:</span> crítica, posible fraude o error grave.
            </div>
          </div>
        </div>

        {/* 5 KPIs */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total análisis', value: stats.total, color: 'text-neutral-700' },
            { label: 'Críticas (<50)', value: stats.critical, color: 'text-red-600' },
            { label: 'Revisión (50-79)', value: stats.review, color: 'text-amber-600' },
            { label: 'Limpias (≥80)', value: stats.clean, color: 'text-green-600' },
            { label: 'Sin decidir', value: stats.pendingDecision, color: 'text-blue-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg border border-neutral-200 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">{kpi.label}</p>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Filtro */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar por factura, proveedor, NIF, archivo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border-0 ring-1 ring-neutral-200 focus:ring-1 focus:ring-primary p-3 text-sm rounded"
          />
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Factura</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Proveedor</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Importe</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Score</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Alertas</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Decisión</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-neutral-400">
                      No hay resultados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.forensic_id}
                      onClick={() => setSelected(r)}
                      className="border-b cursor-pointer hover:bg-neutral-50"
                    >
                      <td className="p-3">
                        <div className="text-sm font-mono">{r.invoice_number ?? '--'}</div>
                        <div className="text-[11px] text-neutral-400 truncate max-w-[200px]">
                          {r.original_filename ?? ''}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-xs">{r.empresa ?? '--'}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{r.supplier_nif ?? ''}</div>
                      </td>
                      <td className="p-3 text-right text-sm font-mono">{fmtAmount(r.amount_total)}</td>
                      <td className="p-3 text-center"><ScoreBadge score={r.score} /></td>
                      <td className="p-3 text-center">
                        {r.total_alerts > 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                            ⚠ {r.total_alerts}
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-[10px]">--</span>
                        )}
                      </td>
                      <td className="p-3 text-center"><DecisionBadge decision={r.decision} /></td>
                      <td className="p-3 text-xs text-neutral-500">{fmtDate(r.forensic_created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Slide-out detalle */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Análisis Forensic</h2>
                <ScoreBadge score={selected.score} />
              </div>
              <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-600 text-xl">
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Factura</p>
                <p className="text-sm font-mono">{selected.invoice_number ?? '--'}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {selected.empresa ?? '--'} ({selected.supplier_nif ?? '--'})
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {fmtAmount(selected.amount_total)} · {fmtDate(selected.issue_date)} · {selected.direction ?? '--'}
                </p>
                <div className="flex gap-3 mt-2 text-xs">
                  {selected.drive_url && (
                    <a href={selected.drive_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      Ver Drive →
                    </a>
                  )}
                  <a href={`/admin/revision?id=${selected.invoice_id}`} className="text-blue-600 hover:underline">
                    Ir a revisión →
                  </a>
                </div>
              </div>

              {/* Alertas por categoría */}
              {[
                { title: 'PDF Forensic', help: 'Detecta manipulación del archivo PDF: modificaciones tardías, firmas digitales sospechosas, capas ocultas', items: selected.pdf_alerts },
                { title: 'Email (anti-BEC)', help: 'Business Email Compromise: el proveedor escribe desde un email distinto al habitual (posible suplantación)', items: selected.email_alerts },
                { title: 'Numeración', help: 'Saltos o retrocesos en la numeración de facturas del proveedor (Ej. F25-100 después de F25-105)', items: selected.numeracion_alerts },
                { title: 'Duplicados', help: 'Factura muy parecida a otra ya registrada: mismo proveedor + importe ±0,5% + fecha cercana', items: selected.duplicados_alerts },
              ].map((s) =>
                (s.items?.length ?? 0) > 0 ? (
                  <div key={s.title} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">{s.title}</p>
                    <p className="text-[10px] text-amber-700/70 mb-2 leading-tight">{s.help}</p>
                    <ul className="list-disc list-inside text-sm text-amber-900 space-y-1">
                      {s.items!.map((a, i) => (
                        <li key={i} className="leading-snug">{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}

              {!selected.total_alerts && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  Sin alertas detectadas en esta factura.
                </div>
              )}

              <div className="bg-neutral-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Decisión revisor</p>
                  <DecisionBadge decision={selected.decision} />
                </div>

                <textarea
                  placeholder="Notas (opcional)…"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  className="w-full bg-white border-0 ring-1 ring-neutral-200 focus:ring-1 focus:ring-primary p-3 text-sm rounded resize-y min-h-[60px] mb-3"
                />

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => saveDecision('aceptada')}
                    disabled={savingDecision !== null}
                    className="px-3 py-2 rounded text-xs font-bold uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingDecision === 'aceptada' ? '…' : 'Aceptar'}
                  </button>
                  <button
                    onClick={() => saveDecision('revisada')}
                    disabled={savingDecision !== null}
                    className="px-3 py-2 rounded text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingDecision === 'revisada' ? '…' : 'Revisada'}
                  </button>
                  <button
                    onClick={() => saveDecision('rechazada')}
                    disabled={savingDecision !== null}
                    className="px-3 py-2 rounded text-xs font-bold uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingDecision === 'rechazada' ? '…' : 'Rechazar'}
                  </button>
                </div>

                {selected.reviewed_at && (
                  <p className="text-[10px] text-neutral-400 mt-3">
                    Última revisión: {fmtDate(selected.reviewed_at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
