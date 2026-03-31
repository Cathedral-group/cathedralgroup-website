'use client'

import { useMemo, useState } from 'react'
import { ComposedChart, Bar, Area, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts'

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
  reserva_amount?: number | null
  reserva_date?: string | null
  arras_amount?: number | null
  arras_date?: string | null
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
  neto: number
  acumulado: number
}

function CashFlowTooltip({ active, payload, label, rows }: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string | number
  rows: CashFlowRow[]
}) {
  if (!active || !payload?.length) return null
  const row = rows.find(r => r.mes === String(label))
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-bold text-neutral-700 mb-2">{label}</p>
      {row && <p className="text-neutral-400 mb-2 truncate max-w-[180px]">{row.concepto}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-bold">{Number(p.value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</span>
        </div>
      ))}
    </div>
  )
}

export default function TabCashFlow({ op, mortgages, costs, invoices }: Props) {
  const [projDate, setProjDate] = useState(op.sale_date ?? '')
  const [projPrice, setProjPrice] = useState(op.sale_price != null ? String(op.sale_price) : '')

  // Effective sale data: use actual if available, else projection inputs
  const effectiveSaleDate = op.sale_date || (projDate || null)
  const effectiveSalePrice = op.sale_price ?? (projPrice ? parseFloat(projPrice) : null)
  const isProjection = !op.sale_date && (!!projDate || !!projPrice)

  const rows = useMemo(() => {
    if (!op.purchase_date) return []

    const events: { fecha: Date; concepto: string; entrada: number; salida: number }[] = []
    const startDate = new Date(op.purchase_date + 'T00:00:00')
    const endDate = effectiveSaleDate ? new Date(effectiveSaleDate + 'T00:00:00') : new Date(startDate.getFullYear(), startDate.getMonth() + 12, 1)

    // Mes compra: gastos compra
    const itp = op.itp_amount ?? (op.purchase_price ?? 0) * ((op.itp_rate ?? 6) / 100)
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
      const mortStart = mortgage.start_date ? new Date(mortgage.start_date + 'T00:00:00') : startDate
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
          fecha: new Date(inv.issue_date + 'T00:00:00'),
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
          fecha: new Date(cost.date + 'T00:00:00'),
          concepto: cost.type,
          entrada: 0,
          salida: cost.amount,
        })
      }
    }

    // IBI/comunidad are already included as individual cost entries above

    // Reserva
    if (op.reserva_amount && op.reserva_date) {
      events.push({ fecha: new Date(op.reserva_date + 'T00:00:00'), concepto: 'Señal de reserva', entrada: op.reserva_amount, salida: 0 })
    }

    // Arras
    if (op.arras_amount && op.arras_date) {
      events.push({ fecha: new Date(op.arras_date + 'T00:00:00'), concepto: 'Contrato de arras', entrada: op.arras_amount, salida: 0 })
    }

    // Sale month (real or projected)
    if (effectiveSalePrice && effectiveSaleDate) {
      const saleDate = new Date(effectiveSaleDate + 'T00:00:00')
      const gastosVenta =
        (op.sale_notary_cost ?? 0) +
        (op.sale_registry_cost ?? 0) +
        (op.sale_gestoria_cost ?? 0) +
        (op.agent_commission_amount ?? effectiveSalePrice * ((op.agent_commission_pct ?? 3) / 100)) +
        (op.plusvalia_amount ?? 0) +
        (op.is_tax_amount ?? 0)
      const alreadyReceived = (op.reserva_amount ?? 0) + (op.arras_amount ?? 0)
      const remainder = effectiveSalePrice - alreadyReceived
      events.push({ fecha: saleDate, concepto: isProjection ? 'Venta estimada (resto)' : 'Escritura venta (resto)', entrada: Math.max(0, remainder), salida: 0 })
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
        neto,
        acumulado,
      }
    })
  }, [op, mortgages, costs, invoices, effectiveSaleDate, effectiveSalePrice, isProjection])

  if (!op.purchase_date) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-neutral-400">
        Introduce la fecha de compra para generar el cash flow.
      </div>
    )
  }

  const lastRow = rows[rows.length - 1]
  const now = new Date()
  const peakOut = rows.length > 0 ? Math.min(...rows.map(r => r.acumulado)) : 0
  const finalAcum = lastRow?.acumulado ?? null
  const todayRow = [...rows].reverse().find(r => r.fecha <= now)
  const currentPos = todayRow?.acumulado ?? null
  const projRoi = peakOut < 0 && finalAcum != null ? (finalAcum / Math.abs(peakOut)) * 100 : null
  const nowMes = now.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  const toMes = (d: string) => new Date(d).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })

  return (
    <div className="space-y-6">
      {/* Projection panel — only shown if no real sale yet */}
      {!op.sale_date && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-600 font-bold text-sm">Proyección de venta</span>
            <span className="text-xs text-amber-500">— introduce valores estimados para simular el cash flow futuro</span>
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Fecha estimada de venta</label>
              <input
                type="date"
                value={projDate}
                onChange={e => setProjDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Precio estimado de venta</label>
              <div className="relative">
                <input
                  type="number"
                  value={projPrice}
                  onChange={e => setProjPrice(e.target.value)}
                  placeholder="ej. 185000"
                  className="border rounded px-3 py-2 text-sm pr-8 w-44"
                />
                <span className="absolute right-3 top-2 text-xs text-neutral-400">€</span>
              </div>
            </div>
            {lastRow && projPrice && (
              <div className={`ml-auto px-4 py-2 rounded-lg text-sm font-bold ${lastRow.acumulado >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                Resultado proyectado: {lastRow.acumulado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Chart */}
      <div className="bg-white rounded-xl border p-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Posición hoy</p>
            <p className={`text-base font-bold mt-0.5 ${currentPos == null ? 'text-neutral-400' : currentPos >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {currentPos != null ? eur(currentPos) : '--'}
            </p>
          </div>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">Pico de inversión</p>
            <p className="text-base font-bold mt-0.5 text-red-600">
              {peakOut < 0 ? eur(peakOut) : '--'}
            </p>
          </div>
          <div className={`rounded-lg p-3 ${finalAcum == null ? 'bg-neutral-50' : finalAcum >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">
              {isProjection ? 'Resultado estimado' : 'Resultado final'}
            </p>
            <p className={`text-base font-bold mt-0.5 ${finalAcum == null ? 'text-neutral-400' : finalAcum >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {finalAcum != null ? eur(finalAcum) : '--'}
            </p>
          </div>
          <div className={`rounded-lg p-3 ${projRoi == null ? 'bg-neutral-50' : projRoi >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wide">ROI sobre inversión</p>
            <p className={`text-base font-bold mt-0.5 ${projRoi == null ? 'text-neutral-400' : projRoi >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {projRoi != null ? `${projRoi >= 0 ? '+' : ''}${projRoi.toFixed(1)}%` : '--'}
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={rows} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => `${(v / 1000).toFixed(0)}k€`}
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={(props) => <CashFlowTooltip {...props} rows={rows} />} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

            <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} />
            <ReferenceLine
              x={nowMes}
              stroke="#6B7280"
              strokeDasharray="4 3"
              label={{ value: 'Hoy', position: 'insideTopRight', fontSize: 9, fill: '#9CA3AF' }}
            />
            {op.purchase_date && (
              <ReferenceLine x={toMes(op.purchase_date)} stroke="#3B82F6" strokeDasharray="3 3"
                label={{ value: 'Compra', position: 'insideTopLeft', fontSize: 9, fill: '#3B82F6' }} />
            )}
            {op.reform_start_date && (
              <ReferenceLine x={toMes(op.reform_start_date)} stroke="#F59E0B" strokeDasharray="3 3"
                label={{ value: 'Reforma', position: 'insideTopLeft', fontSize: 9, fill: '#F59E0B' }} />
            )}
            {effectiveSaleDate && (
              <ReferenceLine x={toMes(effectiveSaleDate)} stroke="#10B981" strokeDasharray="3 3"
                label={{ value: isProjection ? 'Venta est.' : 'Venta', position: 'insideTopRight', fontSize: 9, fill: '#10B981' }} />
            )}

            <Bar dataKey="neto" name="Neto mes" maxBarSize={18} radius={[2, 2, 0, 0]}>
              {rows.map((row, i) => (
                <Cell key={i} fill={row.neto >= 0 ? '#10B981' : '#EF4444'} fillOpacity={0.65} />
              ))}
            </Bar>
            <Area
              type="monotone"
              dataKey="acumulado"
              name="Acumulado"
              stroke="#3B82F6"
              strokeWidth={2.5}
              fill="url(#gradAcum)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </ComposedChart>
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
