'use client'

import { useState, useMemo } from 'react'
import TabPanel from '@/components/admin/TabPanel'
import DashboardCharts from '../DashboardCharts'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'

// Only these doc_types represent real monetary transactions
const FINANCIAL_DOC_TYPES = new Set([
  'factura', 'ticket', 'proforma', 'certificado', 'rectificativa',
  'abono', 'nomina', 'modelo_fiscal', 'seguro', 'justificante_pago',
])

interface Invoice {
  id: string
  number: string | null
  direction: 'emitida' | 'recibida'
  doc_type: string | null
  amount_base: number | null
  amount_total: number | null
  vat_amount: number | null
  categoria_gasto: string | null
  es_gasto_general: boolean
  linea_estructura: string | null
  issue_date: string | null
  due_date: string | null
  payment_date: string | null
  payment_status: string | null
  created_at: string | null
  project_id: string | null
  proyecto_code: string | null
}

interface VatQuarterly {
  year: number
  quarter: number
  vat_repercutido: number | null
  vat_soportado: number | null
  cuota_a_ingresar: number | null
}

interface ReportsViewProps {
  invoices: Invoice[]
  vatQuarterly: VatQuarterly[]
}

const TABS = [
  { key: 'pnl', label: 'P&L' },
  { key: 'cashflow', label: 'Flujo de Caja' },
  { key: 'iva', label: 'IVA' },
  { key: 'estructura', label: 'Estructura' },
  { key: 'graficas', label: 'Gráficas' },
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
    // Usar issue_date si existe, si no created_at como fallback
    const dateStr = inv.issue_date || inv.created_at
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
  const years = Array.from({ length: currentYear - 2022 }, (_, i) => 2023 + i)
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

// Mejor estimación del importe neto (sin IVA):
// 1) amount_base si existe  2) amount_total - vat_amount  3) amount_total  4) 0
function getNetAmount(inv: Invoice): number {
  if (inv.amount_base != null) return Number(inv.amount_base)
  if (inv.amount_total != null && inv.vat_amount != null) return Number(inv.amount_total) - Number(inv.vat_amount)
  if (inv.amount_total != null) return Number(inv.amount_total)
  return 0
}

// ─── P&L Tab ───
function PnLTab({ invoices, year, quarter, month }: { invoices: Invoice[]; year: number; quarter: number | null; month: number | null }) {
  const filtered = useMemo(
    () => filterByPeriod(invoices, year, quarter, month).filter((inv) => !inv.doc_type || FINANCIAL_DOC_TYPES.has(inv.doc_type)),
    [invoices, year, quarter, month]
  )

  const totalIngresos = useMemo(
    () =>
      filtered
        .filter((inv) => inv.direction === 'emitida')
        .reduce((sum, inv) => sum + getNetAmount(inv), 0),
    [filtered]
  )

  const gastosByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    filtered
      .filter((inv) => inv.direction === 'recibida')
      .forEach((inv) => {
        const cat = inv.categoria_gasto || 'otros'
        map[cat] = (map[cat] || 0) + getNetAmount(inv)
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
        // Only count financial documents
        if (inv.doc_type && !FINANCIAL_DOC_TYPES.has(inv.doc_type)) return

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

        const amount = getNetAmount(inv)
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
function IvaTab({ vatQuarterly, year }: { vatQuarterly: VatQuarterly[]; year: number }) {
  // Filter to selected year
  const byYear = useMemo(() => {
    const quarters = vatQuarterly
      .filter((v) => v.year === year)
      .sort((a, b) => a.quarter - b.quarter)
    if (quarters.length === 0) return []
    return [{ year, quarters }]
  }, [vatQuarterly, year])

  const quarterLabel = (q: number) => `Q${q}`

  if (byYear.length === 0) {
    return (
      <div className="bg-white border border-neutral-100 rounded p-8 text-center text-sm text-neutral-400">
        No hay datos de IVA para {year}
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
                </tr>
              </thead>
              <tbody>
                {quarters.map((q, i) => {
                  const cuota = Number(q.cuota_a_ingresar) || 0
                  return (
                    <tr key={q.quarter} className={i % 2 === 1 ? 'bg-neutral-50' : ''}>
                      <td className="px-6 py-3 font-medium">{quarterLabel(q.quarter)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatEUR(q.vat_repercutido)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatEUR(q.vat_soportado)}</td>
                      <td className={`px-6 py-3 text-right font-bold tabular-nums ${cuota <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatEUR(q.cuota_a_ingresar)}
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

// ─── Estructura Tab ───
const LINEA_ESTRUCTURA_LABELS: Record<string, string> = {
  nominas: 'Nóminas',
  ss_empresa: 'S.S. empresa',
  internet: 'Internet / Telecomunicaciones',
  telefono: 'Teléfono móvil',
  renting: 'Renting vehículos',
  alquiler_oficina: 'Alquiler oficina',
  seguros: 'Seguros',
  software: 'Software / Suscripciones',
  asesoria: 'Gestoría / Asesoría',
  suministros: 'Suministros (luz, agua...)',
  otros_fijos: 'Otros fijos',
}

function EstructuraTab({ invoices, year, quarter, month }: { invoices: Invoice[]; year: number; quarter: number | null; month: number | null }) {
  const rows = useMemo(() => {
    const filtered = filterByPeriod(invoices, year, quarter, month).filter(
      (inv) => inv.direction === 'recibida' && inv.es_gasto_general === true && inv.linea_estructura != null
    )

    const map: Record<string, { count: number; total: number }> = {}
    filtered.forEach((inv) => {
      const key = inv.linea_estructura!
      if (!map[key]) map[key] = { count: 0, total: 0 }
      map[key].count += 1
      map[key].total += getNetAmount(inv)
    })

    return Object.entries(map)
      .map(([linea, { count, total }]) => ({ linea, count, total }))
      .sort((a, b) => b.total - a.total)
  }, [invoices, year, quarter, month])

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-neutral-100 rounded p-8 text-center text-sm text-neutral-400">
        Sin gastos de estructura registrados para este período.
      </div>
    )
  }

  const totalGeneral = rows.reduce((sum, r) => sum + r.total, 0)
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className="bg-white border border-neutral-100 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 bg-neutral-50">
              <th className="text-left px-6 py-3">Línea</th>
              <th className="text-right px-6 py-3">Facturas</th>
              <th className="text-right px-6 py-3">Media mensual</th>
              <th className="text-right px-6 py-3">Total anual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.linea} className={i % 2 === 1 ? 'bg-neutral-50' : ''}>
                <td className="px-6 py-3 text-neutral-700">{LINEA_ESTRUCTURA_LABELS[row.linea] ?? row.linea}</td>
                <td className="px-6 py-3 text-right tabular-nums text-neutral-600">{row.count}</td>
                <td className="px-6 py-3 text-right tabular-nums text-neutral-600">{formatEUR(row.total / 12)}</td>
                <td className="px-6 py-3 text-right font-medium tabular-nums">{formatEUR(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-bold">
              <td className="px-6 py-3 text-neutral-900">Total estructura</td>
              <td className="px-6 py-3 text-right tabular-nums text-neutral-700">{totalCount}</td>
              <td className="px-6 py-3 text-right tabular-nums text-neutral-700">{formatEUR(totalGeneral / 12)}</td>
              <td className="px-6 py-3 text-right tabular-nums text-neutral-900">{formatEUR(totalGeneral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Gráficas Tab (visión de empresa de un vistazo) ───
const MONTHS_ES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function GraficasTab({
  invoices, vatQuarterly, year, quarter, month,
}: {
  invoices: Invoice[]; vatQuarterly: VatQuarterly[]; year: number; quarter: number | null; month: number | null
}) {
  // Solo documentos financieros del periodo seleccionado
  const periodInvoices = useMemo(
    () => filterByPeriod(invoices, year, quarter, month).filter((inv) => !inv.doc_type || FINANCIAL_DOC_TYPES.has(inv.doc_type)),
    [invoices, year, quarter, month]
  )

  // monthlyData (ingresos/gastos/margen por mes del periodo) — misma forma que getStats
  const monthlyData = useMemo(() => {
    let startM: number, endM: number
    if (month) { startM = month; endM = month }
    else if (quarter) { startM = (quarter - 1) * 3 + 1; endM = quarter * 3 }
    else { startM = 1; endM = 12 }

    const map: Record<string, { ingresos: number; gastos: number }> = {}
    for (let m = startM; m <= endM; m++) map[`${year}-${String(m).padStart(2, '0')}`] = { ingresos: 0, gastos: 0 }

    for (const inv of periodInvoices) {
      const dateStr = inv.issue_date || inv.created_at
      if (!dateStr) continue
      const key = dateStr.slice(0, 7)
      if (!map[key]) continue
      const amount = getNetAmount(inv)
      if (inv.direction === 'emitida') map[key].ingresos += amount
      else map[key].gastos += amount
    }
    return Object.entries(map).map(([key, vals]) => {
      const m = parseInt(key.slice(5, 7), 10)
      const margen = vals.ingresos > 0 ? ((vals.ingresos - vals.gastos) / vals.ingresos) * 100 : 0
      return { month: MONTHS_ES_SHORT[m - 1], ingresos: Math.round(vals.ingresos), gastos: Math.round(vals.gastos), margen: Math.round(margen * 10) / 10 }
    })
  }, [periodInvoices, year, quarter, month])

  // invoiceStatus (donut pagada/pendiente/vencida)
  const invoiceStatus = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const counts = { pagada: 0, pendiente: 0, vencida: 0 }
    for (const inv of periodInvoices) {
      if (inv.payment_status === 'pagada' || inv.payment_status === 'cobrada') counts.pagada++
      else if (inv.due_date && new Date(inv.due_date + 'T00:00:00') < now) counts.vencida++
      else counts.pendiente++
    }
    return [
      { name: 'Pagada', value: counts.pagada, color: '#22c55e' },
      { name: 'Pendiente', value: counts.pendiente, color: '#f59e0b' },
      { name: 'Vencida', value: counts.vencida, color: '#ef4444' },
    ].filter((s) => s.value > 0)
  }, [periodInvoices])

  // projectProfitability (agrupado por proyecto_code; el resto va a "Sin proyecto")
  const { projectProfitability, sinProyectoIngresos, sinProyectoGastos } = useMemo(() => {
    const map: Record<string, { name: string; ingresos: number; gastos: number }> = {}
    let sinIng = 0, sinGas = 0
    for (const inv of periodInvoices) {
      const amt = getNetAmount(inv)
      const code = inv.proyecto_code?.trim()
      if (code) {
        const k = code.toLowerCase()
        if (!map[k]) map[k] = { name: code, ingresos: 0, gastos: 0 }
        if (inv.direction === 'emitida') map[k].ingresos += amt
        else map[k].gastos += amt
      } else {
        if (inv.direction === 'emitida') sinIng += amt
        else sinGas += amt
      }
    }
    const list = Object.values(map)
      .map((p) => ({ name: p.name, ingresos: Math.round(p.ingresos), gastos: Math.round(p.gastos), margen: Math.round(p.ingresos - p.gastos) }))
      .filter((p) => p.ingresos > 0 || p.gastos > 0)
      .sort((a, b) => (b.ingresos + b.gastos) - (a.ingresos + a.gastos))
    return { projectProfitability: list, sinProyectoIngresos: Math.round(sinIng), sinProyectoGastos: Math.round(sinGas) }
  }, [periodInvoices])

  // estructuraData (costes fijos por línea, año completo seleccionado — consistente con getStats)
  const estructuraData = useMemo(() => {
    const yearInvoices = invoices.filter((inv) => {
      const d = inv.issue_date || inv.created_at
      return d != null && d.slice(0, 4) === String(year)
        && inv.direction === 'recibida' && inv.es_gasto_general === true && inv.linea_estructura != null
    })
    const map: Record<string, number> = {}
    for (const inv of yearInvoices) map[inv.linea_estructura!] = (map[inv.linea_estructura!] || 0) + getNetAmount(inv)
    return Object.entries(map)
      .map(([key, value]) => ({ name: LINEA_ESTRUCTURA_LABELS[key] ?? key, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [invoices, year])

  // IVA por trimestre (repercutido / soportado / a ingresar) del año seleccionado
  const ivaData = useMemo(() => {
    const byQ: Record<number, VatQuarterly> = {}
    for (const v of vatQuarterly) if (v.year === year) byQ[v.quarter] = v
    return [1, 2, 3, 4]
      .filter((q) => byQ[q])
      .map((q) => ({
        trimestre: `Q${q}`,
        repercutido: Math.round(Number(byQ[q].vat_repercutido) || 0),
        soportado: Math.round(Number(byQ[q].vat_soportado) || 0),
        aIngresar: Math.round(Number(byQ[q].cuota_a_ingresar) || 0),
      }))
  }, [vatQuarterly, year])

  return (
    <div className="space-y-8">
      {/* ── FINANZAS + PROYECTOS + ESTRUCTURA (reutiliza DashboardCharts) ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Finanzas, proyectos y estructura</p>
        <DashboardCharts
          variant="full"
          showLeads={false}
          monthlyData={monthlyData}
          invoiceStatus={invoiceStatus}
          leadSources={[]}
          projectProfitability={projectProfitability}
          sinProyectoIngresos={sinProyectoIngresos}
          sinProyectoGastos={sinProyectoGastos}
          estructuraData={estructuraData}
          estructuraYear={year}
        />
      </div>

      {/* ── FISCAL: IVA por trimestre ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Fiscal</p>
        <div className="bg-white p-6 border border-neutral-100">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">
            IVA por trimestre — {year}
          </h3>
          {ivaData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-neutral-300 text-sm">
              Sin datos de IVA para {year}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ivaData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="trimestre" tick={{ fontSize: 11, fill: '#999' }} />
                <YAxis tick={{ fontSize: 10, fill: '#999' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => formatEUR(Number(value))}
                  contentStyle={{ fontSize: 12, border: '1px solid #e5e5e5' }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="repercutido" name="IVA repercutido" fill="#B4A898" radius={[2, 2, 0, 0]} />
                <Bar dataKey="soportado" name="IVA soportado" fill="#5A5550" radius={[2, 2, 0, 0]} />
                <Bar dataKey="aIngresar" name="A ingresar / (devolver)" radius={[2, 2, 0, 0]}>
                  {ivaData.map((row, i) => (
                    <Cell key={i} fill={row.aIngresar >= 0 ? '#ef4444' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-3 text-[11px] text-neutral-400">
            Barra roja = a ingresar a Hacienda; verde = a compensar/devolver. El IVA es trimestral, por eso esta gráfica no varía con el filtro de mes.
          </p>
        </div>
      </div>
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
        {activeTab === 'iva' && <IvaTab vatQuarterly={vatQuarterly} year={year} />}
        {activeTab === 'estructura' && <EstructuraTab invoices={invoices} year={year} quarter={quarter} month={month} />}
        {activeTab === 'graficas' && <GraficasTab invoices={invoices} vatQuarterly={vatQuarterly} year={year} quarter={quarter} month={month} />}
      </TabPanel>
    </div>
  )
}
