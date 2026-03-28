'use client'

import { useState, useMemo } from 'react'
import TabPanel from '@/components/admin/TabPanel'
import PeriodSelector from '@/components/admin/PeriodSelector'

interface Invoice {
  id: string
  invoice_number: string | null
  direction: 'emitida' | 'recibida'
  amount_base: number | null
  amount_total: number | null
  amount_vat: number | null
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

function getQuarterForDate(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1
}

function filterByPeriod(invoices: Invoice[], period: string): Invoice[] {
  if (period === 'all') return invoices

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const quarter = getQuarterForDate(now)

  return invoices.filter((inv) => {
    const dateStr = inv.issue_date
    if (!dateStr) return false
    const d = new Date(dateStr)
    const invYear = d.getFullYear()
    const invMonth = d.getMonth()

    if (period === 'month') {
      return invYear === year && invMonth === month
    }
    if (period === 'quarter') {
      const invQ = getQuarterForDate(d)
      return invYear === year && invQ === quarter
    }
    if (period === 'year') {
      return invYear === year
    }
    return true
  })
}

const CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  mano_de_obra: 'Mano de obra',
  subcontratas: 'Subcontratas',
  servicios: 'Servicios',
  otros: 'Otros',
}

const CATEGORY_ORDER = ['material', 'mano_de_obra', 'subcontratas', 'servicios', 'otros']

// ─── P&L Tab ───
function PnLTab({ invoices }: { invoices: Invoice[] }) {
  const [period, setPeriod] = useState('year')
  const filtered = useMemo(() => filterByPeriod(invoices, period), [invoices, period])

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
      <PeriodSelector value={period} onChange={setPeriod} />
      <div className="mt-6 bg-white border border-neutral-100 rounded overflow-hidden">
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
function CashFlowTab({ invoices }: { invoices: Invoice[] }) {
  const monthlyData = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; year: number; month: number }[] = []

    // Last 12 months including current
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
        year: d.getFullYear(),
        month: d.getMonth(),
      })
    }

    const currentMonth = now.getFullYear() * 12 + now.getMonth()

    let acumulado = 0
    return months.map((m) => {
      const monthIndex = m.year * 12 + m.month
      const isPast = monthIndex < currentMonth
      const isCurrent = monthIndex === currentMonth

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
        const d = new Date(dateStr)
        if (d.getFullYear() !== m.year || d.getMonth() !== m.month) return

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
  }, [invoices])

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

  return (
    <TabPanel tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'pnl' && <PnLTab invoices={invoices} />}
      {activeTab === 'cashflow' && <CashFlowTab invoices={invoices} />}
      {activeTab === 'iva' && <IvaTab vatQuarterly={vatQuarterly} />}
    </TabPanel>
  )
}
