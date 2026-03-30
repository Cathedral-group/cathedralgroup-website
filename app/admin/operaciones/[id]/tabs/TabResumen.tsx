'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface FlippingOp {
  purchase_price?: number | null
  purchase_notary_cost?: number | null
  purchase_registry_cost?: number | null
  purchase_gestoria_cost?: number | null
  itp_amount?: number | null
  itp_rate?: number | null
  reform_budget_estimated?: number | null
  reserva_amount?: number | null
  reserva_date?: string | null
  arras_amount?: number | null
  arras_date?: string | null
  sale_price?: number | null
  sale_notary_cost?: number | null
  sale_registry_cost?: number | null
  sale_gestoria_cost?: number | null
  agent_commission_amount?: number | null
  agent_commission_pct?: number | null
  plusvalia_amount?: number | null
  is_tax_amount?: number | null
  purchase_date?: string | null
  sale_date?: string | null
  reform_start_date?: string | null
  reform_end_date?: string | null
  status: string
}

interface Mortgage {
  capital: number
  tasacion_cost?: number | null
  apertura_commission_amount?: number | null
  other_costs?: number | null
  interest_rate: number
  term_months: number
  start_date?: string | null
}

interface OpCost {
  amount: number
  type: string
}

interface Invoice {
  amount_total?: number | null
}

interface Props {
  op: FlippingOp
  mortgages: Mortgage[]
  costs: OpCost[]
  invoices: Invoice[]
}

function eur(v: number | null | undefined) {
  if (v == null || v === 0) return '--'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function pct(v: number | null) {
  if (v == null) return '--'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function calcAll(op: FlippingOp, mortgages: Mortgage[], costs: OpCost[], invoices: Invoice[]) {
  const itp = op.itp_amount ?? (op.purchase_price ?? 0) * ((op.itp_rate ?? 6) / 100)
  const totalCompra =
    (op.purchase_price ?? 0) + itp +
    (op.purchase_notary_cost ?? 0) +
    (op.purchase_registry_cost ?? 0) +
    (op.purchase_gestoria_cost ?? 0)

  const hipCostes = mortgages.reduce((s, m) =>
    s + (m.tasacion_cost ?? 0) + (m.apertura_commission_amount ?? 0) + (m.other_costs ?? 0), 0)

  // Reform: from invoices linked to this operation
  const reformaReal = invoices.reduce((s, i) => s + (i.amount_total ?? 0), 0)
  const reformaTotal = reformaReal || (op.reform_budget_estimated ?? 0)

  // Holding costs
  const tenencia = costs
    .filter(c => ['ibi','comunidad','seguro_inmueble','suministros'].includes(c.type))
    .reduce((s, c) => s + c.amount, 0)

  // Interest paid (approximation: use mortgage data)
  let interesesPagados = 0
  if (mortgages.length > 0 && mortgages[0].start_date) {
    const m = mortgages[0]
    const r = m.interest_rate / 100 / 12
    const n = Math.max(1, m.term_months || 1)
    const cuota = r > 0 ? m.capital * r / (1 - Math.pow(1 + r, -n)) : m.capital / n
    const now = new Date()
    const start = new Date(m.start_date!)
    const monthsPaid = Math.min(
      Math.max(0, Math.floor((now.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000))),
      n
    )
    let saldo = m.capital
    for (let i = 0; i < monthsPaid; i++) {
      const intMes = saldo * r
      interesesPagados += intMes
      saldo -= (cuota - intMes)
    }
  }

  const gastosVenta =
    (op.sale_notary_cost ?? 0) +
    (op.sale_registry_cost ?? 0) +
    (op.sale_gestoria_cost ?? 0) +
    (op.agent_commission_amount ?? (op.sale_price ?? 0) * ((op.agent_commission_pct ?? 3) / 100)) +
    (op.plusvalia_amount ?? 0) +
    (op.is_tax_amount ?? 0)

  const totalInvertido = totalCompra + hipCostes + reformaTotal + tenencia + interesesPagados
  const benefBruto = op.sale_price ? op.sale_price - (op.purchase_price ?? 0) : null
  const benefNeto = op.sale_price ? op.sale_price - totalInvertido - gastosVenta : null
  const roi = benefNeto != null && totalInvertido > 0 ? (benefNeto / totalInvertido) * 100 : null

  // Duration
  let meses: number | null = null
  if (op.purchase_date) {
    const end = op.sale_date ? new Date(op.sale_date) : new Date()
    const start = new Date(op.purchase_date)
    meses = Math.max(1, Math.round((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000)))
  }
  const roiAnual = roi != null && meses ? (Math.pow(1 + roi / 100, 12 / meses) - 1) * 100 : null

  return {
    itp, totalCompra, hipCostes, reformaTotal, tenencia, interesesPagados,
    gastosVenta, totalInvertido, benefBruto, benefNeto, roi, roiAnual, meses
  }
}

const COLORS = ['#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444', '#6B7280']

export default function TabResumen({ op, mortgages, costs, invoices }: Props) {
  const k = calcAll(op, mortgages, costs, invoices)

  const pieData = [
    { name: 'Compra', value: Math.round(k.totalCompra) },
    { name: 'Reforma', value: Math.round(k.reformaTotal) },
    { name: 'Hipoteca costes', value: Math.round(k.hipCostes) },
    { name: 'Tenencia', value: Math.round(k.tenencia + k.interesesPagados) },
    { name: 'Venta costes', value: Math.round(k.gastosVenta) },
  ].filter(d => d.value > 0)

  const STATUS_STEPS = [
    { key: 'comprada', label: 'Compra', date: op.purchase_date },
    { key: 'en_reforma', label: 'Inicio reforma', date: op.reform_start_date },
    { key: 'en_venta', label: 'Fin reforma', date: op.reform_end_date },
    { key: 'vendida', label: 'Venta', date: op.sale_date },
  ]
  const STATUS_ORDER = ['prospecto','comprada','en_reforma','en_venta','vendida']
  const currentIdx = STATUS_ORDER.indexOf(op.status)

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-neutral-500">Total invertido</p>
          <p className="text-xl font-bold mt-1">{eur(k.totalInvertido)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${k.benefNeto == null ? 'bg-white' : k.benefNeto >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-neutral-500">Beneficio neto</p>
          <p className={`text-xl font-bold mt-1 ${k.benefNeto == null ? '' : k.benefNeto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {eur(k.benefNeto)}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${k.roi == null ? 'bg-white' : k.roi >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-neutral-500">ROI</p>
          <p className={`text-xl font-bold mt-1 ${k.roi == null ? '' : k.roi >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {pct(k.roi)}
          </p>
          {k.roiAnual != null && (
            <p className="text-[10px] text-neutral-500 mt-0.5">{pct(k.roiAnual)} anual</p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-neutral-500">Duración</p>
          <p className="text-xl font-bold mt-1">{k.meses != null ? `${k.meses} meses` : '--'}</p>
        </div>
      </div>

      {/* Cost breakdown table + donut */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Breakdown table */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-bold text-neutral-700 mb-3">Desglose de costes</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {[
                { label: 'Precio de compra', val: op.purchase_price },
                { label: `ITP (${op.itp_rate ?? 0.4}%)`, val: k.itp },
                { label: 'Notaría + registro compra', val: (op.purchase_notary_cost ?? 0) + (op.purchase_registry_cost ?? 0) + (op.purchase_gestoria_cost ?? 0) },
                { label: 'Costes hipotecarios', val: k.hipCostes || null },
                { label: 'Reforma (facturas)', val: k.reformaTotal || null },
                { label: 'Gastos tenencia', val: (k.tenencia + k.interesesPagados) || null },
                { label: '— Intereses hipoteca', val: k.interesesPagados || null, indent: true },
                { label: 'Gastos de venta', val: k.gastosVenta || null },
              ].map((row, i) => row.val ? (
                <tr key={i}>
                  <td className={`py-1.5 text-neutral-600 ${row.indent ? 'pl-4 text-xs text-neutral-400' : ''}`}>{row.label}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{eur(row.val)}</td>
                </tr>
              ) : null)}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-300">
                <td className="py-2 font-bold">Total invertido</td>
                <td className="py-2 text-right font-bold font-mono">{eur(k.totalInvertido)}</td>
              </tr>
              {op.sale_price && (
                <>
                  <tr>
                    <td className="py-1.5 font-bold text-green-700">Precio de venta</td>
                    <td className="py-1.5 text-right font-bold font-mono text-green-700">{eur(op.sale_price)}</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="py-1.5 font-bold">Beneficio neto</td>
                    <td className={`py-1.5 text-right font-bold font-mono ${(k.benefNeto ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {eur(k.benefNeto)}
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>

        {/* Donut chart */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-bold text-neutral-700 mb-3">Distribución de costes</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val) => eur(Number(val))} />
                <Legend iconSize={10} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-bold text-neutral-700 mb-4">Línea de tiempo</h3>
        <div className="flex items-center gap-0">
          {STATUS_STEPS.map((step, i) => {
            const stepIdx = STATUS_ORDER.indexOf(i === 0 ? 'comprada' : i === 1 ? 'en_reforma' : i === 2 ? 'en_venta' : 'vendida')
            const done = currentIdx >= stepIdx
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    done ? 'bg-primary border-primary text-white' : 'bg-white border-neutral-300 text-neutral-400'
                  }`}>
                    {i + 1}
                  </div>
                  <p className={`text-[10px] mt-1 text-center font-medium ${done ? 'text-primary' : 'text-neutral-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {step.date ? new Date(step.date).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'2-digit' }) : '--'}
                  </p>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 ${done ? 'bg-primary' : 'bg-neutral-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
