'use client'

import { useState, useMemo } from 'react'
import TabPanel from '@/components/admin/TabPanel'

interface Invoice {
  id: string
  number: string | null
  direction: 'emitida' | 'recibida'
  amount_base: number | null
  amount_total: number | null
  vat_amount: number | null
  categoria_gasto: string | null
  issue_date: string | null
  due_date: string | null
  payment_date: string | null
  payment_status: string | null
}

interface VatQuarterly {
  id: string
  year: number
  quarter: number
  vat_repercutido: number | null
  vat_soportado: number | null
  cuota_a_ingresar: number | null
  status: string | null
}

interface ReportsViewProps {
  invoices: Invoice[]
  vatQuarterly: VatQuarterly[]
}

const TABS = [
  { key: 'pnl', label: 'P&L' },
  { key: 'cashflow', label: 'Flujo de Caja' },
  { key: 'iva', label: 'IVA' },
]

function formatEUR(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '0,00 €'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value)
}

const MONTHS_ES_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function filterByPeriod(invoices: Invoice[], year: number, quarter: number | null, month: number | null): Invoice[] {
  return invoices.filter((inv) => {
    const dateStr = inv.issue_date
    if (!dateStr) return false
    const parts = dateStr.slice(0, 10).split('-').map(Number)
    if (parts.length < 3 || parts.some(isNaN)) return false
    const [y, mo] = parts
    if (y !== year) return false
    if (month) return mo === month
    if (quarter) return Math.ceil(mo / 3) === quarter
    return true
  })
}

// Inline period selector (local state, no URL navigation)
function InformePeriodSelector({ year, quarter, month, onYear, onQuarter, onMonth }: {
  year: number; quarter: number | null; month: number | null
  onYear: (y: number) => void; onQuarter: (q: number | null) => void; onMonth: (m: number | null) => void
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: currentYear - 2023 }, (_, i) => 2024 + i)
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <select
        value={year}
        onChange={e => { onYear(parseInt(e.target.value)); onQuarter(null); onMonth(null) }}
        className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700 font-medium"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <div className="flex items-center gap-0.5 bg-neutral-100 rounded p-0.5">
        <button onClick={() => { onQuarter(null); onMonth(null) }}
          className={`text-xs px-2.5 py-1 rounded ${!quarter && !month ? 'bg-white shadow-sm font-semibold text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
          Año
        </button>
        {[1,2,3,4].map(q => (
          <button key={q} onClick={() => { onQuarter(q); onMonth(null) }}
            className={`text-xs px-2.5 py-1 rounded ${quarter === q ? 'bg-white shadow-sm font-semibold text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
            Q{q}
          </button>
        ))}
      </div>
      <select
        value={month ?? ''}
        onChange={e => { onMonth(e.target.value ? parseInt(e.target.value) : null); onQuarter(null) }}
        className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700"
      >
        <option value="">— Mes —</option>
        {MONTHS_ES_LONG.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
      </select>
    </div>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  mano_de_obra: 'Mano de obra',
  subcontratas: 'Subcontratas',
  alquiler: 'Alquiler',
  servicios: 'Servicios',
  otros: 'Otros',
}

const CATEGORY_ORDER = ['material', 'mano_de_obra', 'subcontratas', 'alquiler', 'servicios', 'otros']

// ─── P&L Tab ───
function PnLTab({ invoices, year, quarter, month }: { invoices: Invoice[]; year: number; quarter: number | null; month: number | null }) {
  const filtered = useMemo(() => filterByPeriod(invoices, year, quarter, month), [invoices, year, quarter, month])

  const totalIngresos = useMemo(
    () =>
      filtered
        .filter((inv) => inv.direction === 'emitida')
        .reduce((sum, inv) => sum + (Number(inv.amount_base) || 0), 0),
    [filtered]
  )

  const gastosByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    filtered
      .filter((inv) => inv.direction === 'recibida')
      .forEach((inv) => {
        const cat = inv.categoria_gasto || 'otros'
        map[cat] = (map[cat] || 0) + (Number(inv.amount_base) || 0)
      })
    return map
  }, [filtered])

  const totalGastos = Object.values(gastosByCategory).reduce((a, b) => a + b, 0)
  const resultado = totalIngresos - totalGastos
  const margen = totalIngresos > 0 ? (resultado / totalIngresos) * 100 : 0

  return (
    <div>
      <div className="bg-white border border-neutral-100 rounded overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {/* INGRESOS */}
            <tr className="bg-neutral-50">
              <td colSpan={2} className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Ingresos
              </td>
            </tr>
            <tr>
              <td className="px-6 py-3 text-neutral-700">Facturas emitidas</td>
              <td className="px-6 py-3 text-right font-medium tabular-nums">{formatEUR(totalIngresos)}</td>
            </tr>
            <tr className="border-t border-neutral-100">
              <td className="px-6 py-3 font-bold text-neutral-900">Total Ingresos</td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">{formatEUR(totalIngresos)}</td>
            </tr>

            {/* GASTOS */}
            <tr className="bg-neutral-50">
              <td colSpan={2} className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Gastos
              </td>
            </tr>
            {CATEGORY_ORDER.map((cat) => {
              const amount = gastosByCategory[cat] || 0
              if (amount === 0 && !gastosByCategory[cat]) return null
              return (
                <tr key={cat}>
                  <td className="px-6 py-3 text-neutral-700">{CATEGORY_LABELS[cat] || cat}</td>
                  <td className="px-6 py-3 text-right font-medium tabular-nums">{formatEUR(amount)}</td>
                </tr>
              )
            })}
            {/* Uncategorized expenses */}
            {Object.keys(gastosByCategory)
              .filter((k) => !CATEGORY_ORDER.includes(k))
              .map((cat) => (
                <tr key={cat}>
                  <td className="px-6 py-3 text-neutral-700">{CATEGORY_LABELS[cat] || cat}</td>
                  <td className="px-6 py-3 text-right font-medium tabular-nums">{formatEUR(gastosByCategory[cat])}</td>
                </tr>
              ))}
            <tr className="border-t border-neutral-100">
              <td className="px-6 py-3 font-bold text-neutral-900">Total Gastos</td>
              <td className="px-6 py-3 text-right font-bold tabular-nums">{formatEUR(totalGastos)}</td>
            </tr>

            {/* RESULTADO */}
            <tr className="border-t-2 border-neutral-300 bg-neutral-50">
              <td className="px-6 py-4 font-bold text-neutral-900 text-base">Resultado Bruto</td>
              <td className={`px-6 py-4 text-right font-bold text-base tabular-nums ${resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatEUR(resultado)}
              </td>
            </tr>
            <tr className="bg-neutral-50">
              <td className="px-6 py-3 font-bold text-neutral-900">Margen %</td>
              <td className={`px-6 py-3 text-right font-bold tabular-nums ${resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {margen.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Cash Flow Tab ───
function CashFlowTab({ invoices, year, quarter, month }: { invoices: Invoice[]; year: number; quarter: number | null; month: number | null }) {
  const monthlyData = useMemo(() => {
    // Build month range for selected period
    let startM: number, endM: number
    if (month) {
      startM = month; endM = month
    } else if (quarter) {
      startM = (quarter - 1) * 3 + 1; endM = quarter * 3
    } else {
      startM = 1; endM = 12
    }
    const months: { key: string; label: string; year: number; month: number }[] = []
    for (let m = startM; m <= endM; m++) {
      months.push({
        key: `${year}-${String(m).padStart(2,'0')}`,
        label: new Date(year, m - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
        year,
        month: m - 1,
      })
    }

    const now = new Date()
    const currentMonthIndex = now.getFullYear() * 12 + now.getMonth()

    let acumulado = 0
    return months.map((m) => {
      const monthIndex = m.year * 12 + m.month
      const isPast = monthIndex < currentMonthIndex
      const isCurrent = monthIndex === currentMonthIndex

      let ingresos = 0
      let gastos = 0

      invoices.forEach((inv) => {
        // For past months: use payment_date; for current/future: use due_date for pending
        let dateStr: string | null = null
        if (isPast) {
          dateStr = inv.payment_date || inv.issue_date
        } else if (isCurrent) {
          // Mix: paid invoices by payment_date, pending by due_date
          if (inv.payment_status === 'pagada' || inv.payment_status === 'cobrada') {
            dateStr = inv.payment_date || inv.issue_date
          } else {
            dateStr = inv.due_date || inv.issue_date
          }
        } else {
          // Future: only pending invoices by due_date
          if (inv.payment_status === 'pendiente') {
            dateStr = inv.due_date
          } else {
            return
          }
        }

        if (!dateStr) return
        // Parse date-only strings as local time to avoid UTC midnight shifting the day back in UTC+1/+2
        const parts = dateStr.slice(0, 10).split('-').map(Number)
        if (parts.length < 3 || parts.some(isNaN)) return
        if (parts[0] !== m.year || parts[1] - 1 !== m.month) return

        const amount = Number(inv.amount_total) || 0
        if (inv.direction === 'emitida') {
          ingresos += amount
        } else {
          gastos += amount
        }
      })

      const neto = ingresos - gastos
      acumulado += neto

      return {
        ...m,
        ingresos,
        gastos,
        neto,
        acumulado,
      }
    })
  }, [invoices, year, quarter, month])

  return (
    <div className="bg-white border border-neutral-100 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50">
              <th className="text-left px-5 py-3">Mes</th>
              <th className="text-right px-5 py-3">Ingresos</th>
              <th className="text-right px-5 py-3">Gastos</th>
              <th className="text-right px-5 py-3">Neto</th>
              <th className="text-right px-5 py-3">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((row, i) => (
              <tr key={row.key} className={i % 2 === 1 ? 'bg-neutral-50' : ''}>
                <td className="px-5 py-3 font-medium text-neutral-700 capitalize whitespace-nowrap">{row.label}</td>
                <td className="px-5 py-3 text-right tabular-nums text-green-600">{formatEUR(row.ingresos)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-red-600">{formatEUR(row.gastos)}</td>
                <td className={`px-5 py-3 text-right font-medium tabular-nums ${row.neto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatEUR(row.neto)}
                </td>
                <td className={`px-5 py-3 text-right font-bold tabular-nums ${row.acumulado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatEUR(row.acumulado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── IVA Tab ───
function IvaTab({ vatQuarterly }: { vatQuarterly: VatQuarterly[] }) {
  // Group by year
  const byYear = useMemo(() => {
    const map: Record<number, VatQuarterly[]> = {}
    vatQuarterly.forEach((v) => {
      if (!map[v.year]) map[v.year] = []
      map[v.year].push(v)
    })
    // Sort years descending
    return Object.entries(map)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, items]) => ({
        year: Number(year),
        quarters: items.sort((a, b) => a.quarter - b.quarter),
      }))
  }, [vatQuarterly])

  const quarterLabel = (q: number) => `Q${q}`

  const statusLabel = (status: string | null) => {
    if (!status) return '—'
    const map: Record<string, { label: string; color: string }> = {
      pendiente: { label: 'Pendiente', color: 'bg-amber-50 text-amber-600' },
      presentado: { label: 'Presentado', color: 'bg-green-50 text-green-600' },
      borrador: { label: 'Borrador', color: 'bg-neutral-100 text-neutral-500' },
    }
    return map[status] || { label: status, color: 'bg-neutral-100 text-neutral-500' }
  }

  if (byYear.length === 0) {
    return (
      <div className="bg-white border border-neutral-100 rounded p-8 text-center text-sm text-neutral-400">
        No hay datos de IVA trimestral
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {byYear.map(({ year, quarters }) => (
        <div key={year} className="bg-white border border-neutral-100 rounded overflow-hidden">
          <div className="px-6 py-3 bg-neutral-50 border-b border-neutral-100">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{year}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  <th className="text-left px-6 py-3">Trimestre</th>
                  <th className="text-right px-6 py-3">IVA Repercutido</th>
                  <th className="text-right px-6 py-3">IVA Soportado</th>
                  <th className="text-right px-6 py-3">Cuota</th>
                  <th className="text-center px-6 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {quarters.map((q, i) => {
                  const cuota = Number(q.cuota_a_ingresar) || 0
                  const st = statusLabel(q.status)
                  return (
                    <tr key={q.quarter} className={i % 2 === 1 ? 'bg-neutral-50' : ''}>
                      <td className="px-6 py-3 font-medium">{quarterLabel(q.quarter)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatEUR(q.vat_repercutido)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatEUR(q.vat_soportado)}</td>
                      <td className={`px-6 py-3 text-right font-bold tabular-nums ${cuota <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatEUR(q.cuota_a_ingresar)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {typeof st === 'string' ? (
                          <span className="text-neutral-400">{st}</span>
                        ) : (
                          <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${st.color}`}>
                            {st.label}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───
export default function ReportsView({ invoices, vatQuarterly }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState('pnl')
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [quarter, setQuarter] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)

  return (
    <div>
      <InformePeriodSelector
        year={year} quarter={quarter} month={month}
        onYear={setYear} onQuarter={setQuarter} onMonth={setMonth}
      />
      <TabPanel tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'pnl' && <PnLTab invoices={invoices} year={year} quarter={quarter} month={month} />}
        {activeTab === 'cashflow' && <CashFlowTab invoices={invoices} year={year} quarter={quarter} month={month} />}
        {activeTab === 'iva' && <IvaTab vatQuarterly={vatQuarterly} />}
      </TabPanel>
    </div>
  )
}
