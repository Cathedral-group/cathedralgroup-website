'use client'

import { useState } from 'react'

type Filing = {
  id: string
  modelo: string
  ejercicio: number
  periodo: string | null
  fecha_limite: string | null
  fecha_presentacion: string | null
  importe_a_ingresar: number | null
  importe_a_devolver: number | null
  csv_aeat: string | null
  justificante_aeat_url: string | null
  estado: string | null
  notes: string | null
  created_at: string
}

type Deadline = {
  modelo: string
  nombre: string
  ejercicio: number
  periodo: string
  fecha_limite: string
  days_until_deadline: number
  estado: string
  importe_a_ingresar: number | null
  is_overdue: boolean
}

type Modelo = {
  codigo: string
  nombre: string
  descripcion: string | null
  frecuencia: string | null
}

type Stats = {
  currentYear: number
  totalFilings: number
  presentados: number
  totalIngresado: number
  overdue: number
  deadlinesNext: number
}

type Company = {
  cif: string
  razon_social: string
} | null

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  borrador: 'bg-blue-100 text-blue-800',
  presentado: 'bg-green-100 text-green-800',
  pagado: 'bg-green-200 text-green-900',
  rechazado: 'bg-red-100 text-red-800',
  cancelado: 'bg-neutral-100 text-neutral-600',
}

const fmtDate = (iso: string | null) =>
  !iso ? '—' : new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export default function FiscalView({
  activeCompanyId: _activeCompanyId,
  company,
  filings,
  deadlines,
  modelos,
  stats,
}: {
  activeCompanyId: string
  company: Company
  filings: Filing[]
  deadlines: Deadline[]
  modelos: Modelo[]
  stats: Stats
}) {
  const [generatorModelo, setGeneratorModelo] = useState('303')
  const [generatorEjercicio, setGeneratorEjercicio] = useState(stats.currentYear)
  const [generatorPeriodo, setGeneratorPeriodo] = useState('1T')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setDraft(null)
    try {
      const params = new URLSearchParams({
        modelo: generatorModelo,
        ejercicio: String(generatorEjercicio),
        periodo: generatorPeriodo,
      })
      const res = await fetch(`/api/fiscal/draft?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDraft(json.draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-800">📊 Fiscal AEAT</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {company ? (
            <>
              Calendario y modelos AEAT para <strong>{company.razon_social}</strong>{' '}
              <span className="font-mono text-xs text-neutral-400">({company.cif})</span>
            </>
          ) : (
            'Calendario y modelos AEAT'
          )}
        </p>
      </div>

      {/* 5 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label={`Filings ${stats.currentYear}`} value={String(stats.totalFilings)} />
        <Kpi label="Presentados año" value={String(stats.presentados)} color="text-green-700" />
        <Kpi label="Ingresado año" value={fmtMoney(stats.totalIngresado)} />
        <Kpi
          label="Próximos vencimientos"
          value={String(stats.deadlinesNext)}
          color={stats.deadlinesNext > 0 ? 'text-amber-700' : ''}
        />
        <Kpi
          label="Vencidos"
          value={String(stats.overdue)}
          color={stats.overdue > 0 ? 'text-red-700 font-bold' : ''}
        />
      </div>

      {/* Generador de borradores */}
      <section className="bg-white border border-neutral-100 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">
          ⚡ Generador automático de borradores
        </h2>
        <p className="text-xs text-neutral-500 mb-4 max-w-2xl">
          Calcula el borrador del modelo desde las facturas + nóminas del periodo. Útil para
          revisar antes de presentar a AEAT (o para cuadrar contra lo que dice tu gestoría).
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Modelo</label>
            <select
              value={generatorModelo}
              onChange={(e) => setGeneratorModelo(e.target.value)}
              className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
            >
              <option value="303">303 — IVA trimestral</option>
              <option value="111">111 — IRPF retenciones</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Ejercicio</label>
            <input
              type="number"
              value={generatorEjercicio}
              onChange={(e) => setGeneratorEjercicio(parseInt(e.target.value || '0', 10))}
              min={2020}
              max={2100}
              className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Periodo</label>
            <select
              value={generatorPeriodo}
              onChange={(e) => setGeneratorPeriodo(e.target.value)}
              className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
            >
              <option value="1T">1T (ene-mar)</option>
              <option value="2T">2T (abr-jun)</option>
              <option value="3T">3T (jul-sep)</option>
              <option value="4T">4T (oct-dic)</option>
              <option value="A">Anual</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-[#5A5550] transition-colors disabled:opacity-50"
            >
              {generating ? 'Calculando…' : '⚡ Generar borrador'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-xs">
            {error}
          </div>
        )}

        {draft && <DraftDisplay draft={draft} />}
      </section>

      {/* Próximos vencimientos */}
      <section className="bg-white border border-neutral-100 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">
          🗓️ Próximos vencimientos AEAT
        </h2>
        {deadlines.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin vencimientos en los próximos 90 días.</p>
        ) : (
          <div className="space-y-1.5">
            {deadlines.map((d) => {
              const color = d.is_overdue
                ? 'bg-red-50 border-red-300'
                : d.days_until_deadline <= 7
                ? 'bg-amber-50 border-amber-300'
                : 'bg-neutral-50 border-neutral-200'
              const daysLabel = d.is_overdue
                ? `Vencido hace ${Math.abs(d.days_until_deadline)}d`
                : d.days_until_deadline === 0
                ? 'Hoy'
                : d.days_until_deadline === 1
                ? 'Mañana'
                : `En ${d.days_until_deadline}d`
              return (
                <div
                  key={`${d.modelo}-${d.ejercicio}-${d.periodo}`}
                  className={`${color} border rounded px-3 py-2.5 flex items-center gap-3 text-sm`}
                >
                  <span className="font-bold text-xs px-2 py-0.5 bg-white rounded border">
                    {d.modelo}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {d.nombre} · {d.periodo} {d.ejercicio}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      Vence {fmtDate(d.fecha_limite)}
                    </div>
                  </div>
                  <span className="text-xs font-bold whitespace-nowrap">{daysLabel}</span>
                  <span
                    className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
                      ESTADO_COLORS[d.estado] ?? 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {d.estado}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Filings presentados (histórico) */}
      <section className="bg-white border border-neutral-100 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">
          📁 Histórico de filings presentados
        </h2>
        {filings.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin filings registrados todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                <th className="px-3 py-2 text-left">Modelo</th>
                <th className="px-3 py-2 text-left">Periodo</th>
                <th className="px-3 py-2 text-left">Vence</th>
                <th className="px-3 py-2 text-left">Presentado</th>
                <th className="px-3 py-2 text-right">A ingresar</th>
                <th className="px-3 py-2 text-left">CSV AEAT</th>
                <th className="px-3 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                  <td className="px-3 py-2 font-mono text-xs">{f.modelo}</td>
                  <td className="px-3 py-2 text-xs">
                    {f.periodo} {f.ejercicio}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{fmtDate(f.fecha_limite)}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(f.fecha_presentacion)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {fmtMoney(f.importe_a_ingresar)}
                  </td>
                  <td className="px-3 py-2 text-[10px] font-mono text-neutral-500 truncate max-w-[120px]">
                    {f.csv_aeat ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
                        ESTADO_COLORS[f.estado ?? 'pendiente'] ?? 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {f.estado ?? 'pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Catálogo modelos AEAT */}
      <section className="bg-white border border-neutral-100 rounded-lg p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-3">
          📚 Catálogo de modelos AEAT
        </h2>
        <p className="text-xs text-neutral-500 mb-3">
          Modelos del calendario fiscal Cathedral. Click "Generar borrador" arriba para 303 / 111.
          B5-B14 (115, 347, 200, 232, etc.) en el roadmap.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {modelos.map((m) => (
            <div key={m.codigo} className="bg-neutral-50 border border-neutral-100 rounded px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold">{m.codigo}</span>
                <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                  {m.frecuencia}
                </span>
              </div>
              <div className="text-neutral-600 mt-0.5">{m.nombre}</div>
              {m.descripcion && (
                <div className="text-[10px] text-neutral-400 mt-1">{m.descripcion}</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-lg p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-neutral-800'}`}>{value}</p>
    </div>
  )
}

function DraftDisplay({ draft }: { draft: Record<string, unknown> }) {
  const isModel303 = draft.modelo === '303'
  return (
    <div className="mt-5 bg-neutral-50 border border-neutral-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">
          📄 Borrador modelo {String(draft.modelo)} · {String(draft.periodo)} {String(draft.ejercicio)}
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-neutral-400">
          {String((draft.company as { razon_social: string } | null)?.razon_social ?? '')}
        </span>
      </div>

      {/* Resumen alto nivel */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {isModel303 ? (
          <>
            <KpiSmall label="Total devengado (cas. 27)" value={fmtMoney(draft.casilla_27_total_devengado as number)} />
            <KpiSmall label="Total deducir (cas. 45)" value={fmtMoney(draft.casilla_45_total_deducir as number)} />
            <KpiSmall
              label={(draft.a_ingresar as number) > 0 ? '⚠ A ingresar' : 'A devolver/compensar'}
              value={
                (draft.a_ingresar as number) > 0
                  ? fmtMoney(draft.a_ingresar as number)
                  : fmtMoney(draft.a_devolver_o_compensar as number)
              }
              accent
            />
          </>
        ) : (
          <>
            <KpiSmall label="Trabajadores" value={String((draft as { casilla_01_perceptores_trabajo?: number }).casilla_01_perceptores_trabajo ?? 0)} />
            <KpiSmall label="Profesionales" value={String((draft as { casilla_04_perceptores_profesionales?: number }).casilla_04_perceptores_profesionales ?? 0)} />
            <KpiSmall label="⚠ A ingresar" value={fmtMoney((draft as { total_a_ingresar?: number }).total_a_ingresar ?? 0)} accent />
          </>
        )}
      </div>

      {/* Detalle (collapsible) */}
      <details className="bg-white rounded p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-neutral-700">
          Ver detalle completo (JSON con todas las casillas)
        </summary>
        <pre className="mt-3 text-[10px] overflow-x-auto bg-neutral-100 p-3 rounded">
          {JSON.stringify(draft, null, 2)}
        </pre>
      </details>

      {/* Notas */}
      {Array.isArray(draft.notas) && (draft.notas as string[]).length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">⚠ Notas a revisar</p>
          <ul className="text-[11px] text-neutral-600 space-y-0.5">
            {(draft.notas as string[]).map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function KpiSmall({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded ${accent ? 'bg-primary/10 border border-primary/30' : 'bg-white border border-neutral-200'}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-lg font-bold mt-1 ${accent ? 'text-primary' : 'text-neutral-800'}`}>{value}</p>
    </div>
  )
}
