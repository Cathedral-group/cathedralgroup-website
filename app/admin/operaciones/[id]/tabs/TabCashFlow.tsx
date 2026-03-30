'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

interface FlippingOp {
  purchase_price?: number | null
  purchase_date?: string | null
  purchase_notary_cost?: number | null
  purchase_registry_cost?: number | null
  purchase_gestoria_cost?: number | null
  itp_amount?: number | null
  itp_rate?: number | null
  reform_start_date?: string | null
  reform_end_date?: string | null
  sale_price?: number | null
  sale_date?: string | null
  sale_notary_cost?: number | null
  sale_registry_cost?: number | null
  sale_gestoria_cost?: number | null
  agent_commission_amount?: number | null
  agent_commission_pct?: number | null
  plusvalia_amount?: number | null
  is_tax_amount?: number | null
}

interface Mortgage {
  capital: number
  interest_rate: number
  term_months: number
  monthly_payment?: number | null
  start_date?: string | null
  lender?: string | null
  tasacion_cost?: number | null
  apertura_commission_amount?: number | null
  other_costs?: number | null
}

interface OpCost {
  type: string
  amount: number
  date?: string | null
}

interface Invoice {
  amount_total?: number | null
  issue_date?: string | null
}

interface Props {
  op: FlippingOp
  mortgages: Mortgage[]
  costs: OpCost[]
  invoices: Invoice[]
}

function eur(v: number) {
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function calcCuota(capital: number, rate: number, months: number) {
  const r = rate / 100 / 12
  if (r === 0) return capital / months
  return (capital * r) / (1 - Math.pow(1 + r, -months))
}

interface CashFlowRow {
  mes: string
  fecha: Date
  concepto: string
  entrada: number
  salida: number
  acumulado: number
}

export default function TabCashFlow({ op, mortgages, costs, invoices }: Props) {
  const rows = useMemo(() => {
    if (!op.purchase_date) return []

    const events: { fecha: Date; concepto: string; entrada: number; salida: number }[] = []
    const startDate = new Date(op.purchase_date)
    const endDate = op.sale_date ? new Date(op.sale_date) : new Date(startDate.getFullYear(), startDate.getMonth() + 24, 1)

    // Mes compra: gastos compra
    const itp = op.itp_amount ?? (op.purchase_price ?? 0) * ((op.itp_rate ?? 0.4) / 100)
    const gastosCompra =
      (op.purchase_price ?? 0) + itp +
      (op.purchase_notary_cost ?? 0) +
      (op.purchase_registry_cost ?? 0) +
      (op.purchase_gestoria_cost ?? 0)
    if (gastosCompra > 0) {
      events.push({ fecha: startDate, concepto: 'Compra inmueble + gastos', entrada: 0, salida: gastosCompra })
    }

    // Hipoteca: entrada de capital en el mes de compra
    const mortgage = mortgages[0]
    if (mortgage) {
      events.push({ fecha: startDate, concepto: `Hipoteca ${mortgage.lender ?? ''}`, entrada: mortgage.capital, salida: 0 })
      const hipCostes = (mortgage.tasacion_cost ?? 0) + (mortgage.apertura_commission_amount ?? 0) + (mortgage.other_costs ?? 0)
      if (hipCostes > 0) {
        events.push({ fecha: startDate, concepto: 'Costes hipotecarios', entrada: 0, salida: hipCostes })
      }
      // Monthly mortgage payments
      const cuota = mortgage.monthly_payment ?? calcCuota(mortgage.capital, mortgage.interest_rate, mortgage.term_months)
      const mortStart = mortgage.start_date ? new Date(mortgage.start_date) : startDate
      for (let i = 0; i < mortgage.term_months; i++) {
        const fecha = new Date(mortStart.getFullYear(), mortStart.getMonth() + i + 1, 1)
        if (fecha > endDate) break
        events.push({ fecha, concepto: 'Cuota hipoteca', entrada: 0, salida: cuota })
      }
    }

    // Reform invoices by month
    for (const inv of invoices) {
      if (inv.issue_date && inv.amount_total) {
        events.push({
          fecha: new Date(inv.issue_date),
          concepto: 'Factura reforma',
          entrada: 0,
          salida: inv.amount_total,
        })
      }
    }

    // Operation costs by month
    for (const cost of costs) {
      if (cost.date && cost.amount) {
        events.push({
          fecha: new Date(cost.date),
          concepto: cost.type,
          entrada: 0,
          salida: cost.amount,
        })
      }
    }

    // IBI/comunidad recurring (monthly spread)
    const ibi = costs.filter(c => c.type === 'ibi').reduce((s, c) => s + c.amount, 0)
    const comunidad = costs.filter(c => c.type === 'comunidad').reduce((s, c) => s + c.amount, 0)
    // These are already individual entries, skip recurring calculation

    // Sale month
    if (op.sale_price && op.sale_date) {
      const saleDate = new Date(op.sale_date)
      const gastosVenta =
        (op.sale_notary_cost ?? 0) +
        (op.sale_registry_cost ?? 0) +
        (op.sale_gestoria_cost ?? 0) +
        (op.agent_commission_amount ?? (op.sale_price ?? 0) * ((op.agent_commission_pct ?? 3) / 100)) +
        (op.plusvalia_amount ?? 0) +
        (op.is_tax_amount ?? 0)
      events.push({ fecha: saleDate, concepto: 'Venta inmueble', entrada: op.sale_price, salida: 0 })
      if (gastosVenta > 0) {
        events.push({ fecha: saleDate, concepto: 'Gastos de venta', entrada: 0, salida: gastosVenta })
      }
    }

    // Group by month
    const byMonth = new Map<string, { entrada: number; salida: number; conceptos: string[] }>()
    for (const ev of events) {
      const key = `${ev.fecha.getFullYear()}-${String(ev.fecha.getMonth() + 1).padStart(2, '0')}`
      const existing = byMonth.get(key) ?? { entrada: 0, salida: 0, conceptos: [] }
      existing.entrada += ev.entrada
      existing.salida += ev.salida
      if (!existing.conceptos.includes(ev.concepto)) existing.conceptos.push(ev.concepto)
      byMonth.set(key, existing)
    }

    // Build rows sorted by month
    const sorted = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    let acumulado = 0
    return sorted.map(([key, val]) => {
      const neto = val.entrada - val.salida
      acumulado += neto
      const [year, month] = key.split('-')
      const d = new Date(parseInt(year), parseInt(month) - 1, 1)
      return {
        mes: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        fecha: d,
        concepto: val.conceptos.join(', '),
        entrada: val.entrada,
        salida: val.salida,
        acumulado,
      }
    })
  }, [op, mortgages, costs, invoices])

  if (!op.purchase_date) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-neutral-400">
        Introduce la fecha de compra para generar el cash flow.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold mb-4">Posición de caja acumulada</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={rows} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(val) => eur(Number(val))}
              labelStyle={{ fontWeight: 'bold' }}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="acumulado"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              name="Acumulado"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-bold">Cash flow mensual</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b">
                <th className="text-left p-2 font-medium text-neutral-600">Mes</th>
                <th className="text-left p-2 font-medium text-neutral-600">Conceptos</th>
                <th className="text-right p-2 font-medium text-green-700">Entradas</th>
                <th className="text-right p-2 font-medium text-red-700">Salidas</th>
                <th className="text-right p-2 font-medium text-neutral-600">Neto</th>
                <th className="text-right p-2 font-medium text-blue-700">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const neto = row.entrada - row.salida
                return (
                  <tr key={i} className={`border-b ${row.acumulado < 0 ? 'bg-red-50/30' : ''}`}>
                    <td className="p-2 font-medium">{row.mes}</td>
                    <td className="p-2 text-neutral-500 max-w-[200px] truncate">{row.concepto}</td>
                    <td className="p-2 text-right font-mono text-green-700">
                      {row.entrada > 0 ? eur(row.entrada) : '--'}
                    </td>
                    <td className="p-2 text-right font-mono text-red-700">
                      {row.salida > 0 ? eur(row.salida) : '--'}
                    </td>
                    <td className={`p-2 text-right font-mono font-bold ${neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {neto >= 0 ? '+' : ''}{eur(neto)}
                    </td>
                    <td className={`p-2 text-right font-mono font-bold ${row.acumulado >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {eur(row.acumulado)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
