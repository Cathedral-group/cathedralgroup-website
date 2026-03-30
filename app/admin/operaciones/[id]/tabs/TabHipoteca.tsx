'use client'

import { useState, useMemo } from 'react'

interface Mortgage {
  id: string
  operation_id: string
  lender: string | null
  capital: number
  interest_rate: number
  tae: number | null
  term_months: number
  monthly_payment: number | null
  start_date: string | null
  tasacion_cost: number | null
  apertura_commission_pct: number | null
  apertura_commission_amount: number | null
  other_costs: number | null
  drive_contract_url: string | null
  [key: string]: unknown
}

interface Props {
  operationId: string
  mortgages: Mortgage[]
  onUpdate: (mortgages: Mortgage[]) => void
}

function eur(v: number | null | undefined) {
  if (v == null) return '--'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function calcCuota(capital: number, rate: number, months: number) {
  const r = rate / 100 / 12
  if (r === 0) return capital / months
  return (capital * r) / (1 - Math.pow(1 + r, -months))
}

interface AmortRow {
  mes: number
  fecha: string
  cuota: number
  intereses: number
  capital_amortizado: number
  saldo: number
  pagado: boolean
}

function buildAmortTable(mortgage: Mortgage): AmortRow[] {
  const r = mortgage.interest_rate / 100 / 12
  const n = mortgage.term_months
  const cuota = mortgage.monthly_payment ?? calcCuota(mortgage.capital, mortgage.interest_rate, n)
  const start = mortgage.start_date ? new Date(mortgage.start_date) : new Date()
  const now = new Date()
  const rows: AmortRow[] = []
  let saldo = mortgage.capital

  for (let i = 0; i < n; i++) {
    const fecha = new Date(start.getFullYear(), start.getMonth() + i + 1, 1)
    const intereses = saldo * r
    const cap = cuota - intereses
    saldo = Math.max(0, saldo - cap)
    rows.push({
      mes: i + 1,
      fecha: fecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
      cuota,
      intereses,
      capital_amortizado: cap,
      saldo,
      pagado: fecha <= now,
    })
  }
  return rows
}

export default function TabHipoteca({ operationId, mortgages, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(mortgages.length === 0)
  const [form, setForm] = useState<Partial<Mortgage>>({
    lender: '',
    capital: undefined,
    interest_rate: undefined,
    tae: undefined,
    term_months: undefined,
    monthly_payment: undefined,
    start_date: '',
    tasacion_cost: undefined,
    apertura_commission_pct: undefined,
    apertura_commission_amount: undefined,
    other_costs: undefined,
    drive_contract_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [showFullTable, setShowFullTable] = useState(false)
  const mortgage = mortgages[0] ?? null

  const cuotaCalc = form.capital && form.interest_rate && form.term_months
    ? calcCuota(form.capital, form.interest_rate, form.term_months)
    : null

  const amortRows = useMemo(() => mortgage ? buildAmortTable(mortgage) : [], [mortgage])
  const paidRows = amortRows.filter(r => r.pagado)
  const totalIntereses = amortRows.reduce((s, r) => s + r.intereses, 0)
  const totalPagado = paidRows.reduce((s, r) => s + r.cuota, 0)
  const interesesPagados = paidRows.reduce((s, r) => s + r.intereses, 0)
  const capitalAmortizado = paidRows.reduce((s, r) => s + r.capital_amortizado, 0)
  const saldoPendiente = mortgage ? mortgage.capital - capitalAmortizado : 0

  const saveMortgage = async () => {
    if (!form.capital || !form.interest_rate || !form.term_months) return
    setSaving(true)
    try {
      const isEdit = !!mortgage
      const body = isEdit
        ? { ...form, id: mortgage!.id }
        : { ...form, operation_id: operationId }
      const res = await fetch('/api/db/mortgages', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const { data } = await res.json()
        onUpdate([data])
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const displayRows = showFullTable ? amortRows : amortRows.slice(0, 24)

  return (
    <div className="space-y-6">
      {mortgage ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-neutral-500">Capital prestado</p>
              <p className="text-xl font-bold mt-1">{eur(mortgage.capital)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-neutral-500">Saldo pendiente</p>
              <p className="text-xl font-bold mt-1">{eur(saldoPendiente)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-neutral-500">Cuota mensual</p>
              <p className="text-xl font-bold mt-1">
                {eur(mortgage.monthly_payment ?? calcCuota(mortgage.capital, mortgage.interest_rate, mortgage.term_months))}
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-neutral-500">Intereses totales</p>
              <p className="text-xl font-bold mt-1">{eur(totalIntereses)}</p>
            </div>
          </div>

          {/* Mortgage details */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-bold mb-3">Datos del préstamo</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-neutral-500">Entidad:</span> <strong>{mortgage.lender || '--'}</strong></div>
              <div><span className="text-neutral-500">TIN:</span> <strong>{mortgage.interest_rate}%</strong></div>
              <div><span className="text-neutral-500">TAE:</span> <strong>{mortgage.tae ? `${mortgage.tae}%` : '--'}</strong></div>
              <div><span className="text-neutral-500">Plazo:</span> <strong>{mortgage.term_months} meses ({(mortgage.term_months / 12).toFixed(1)} años)</strong></div>
              <div><span className="text-neutral-500">Inicio:</span> <strong>{mortgage.start_date ?? '--'}</strong></div>
              <div><span className="text-neutral-500">Tasación:</span> <strong>{eur(mortgage.tasacion_cost)}</strong></div>
              <div><span className="text-neutral-500">Apertura:</span> <strong>{eur(mortgage.apertura_commission_amount)}</strong></div>
              <div><span className="text-neutral-500">Otros:</span> <strong>{eur(mortgage.other_costs)}</strong></div>
            </div>
            {mortgage.drive_contract_url && (
              <a href={mortgage.drive_contract_url} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-blue-600 hover:underline">
                Ver contrato hipoteca →
              </a>
            )}
          </div>

          {/* Progress */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-bold mb-3">Progreso de amortización</h3>
            <div className="relative h-3 bg-neutral-100 rounded-full overflow-hidden mb-3">
              <div
                className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, (capitalAmortizado / mortgage.capital) * 100).toFixed(1)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <p className="text-xs text-neutral-500">Total pagado</p>
                <p className="font-bold">{eur(totalPagado)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-neutral-500">Capital amortizado</p>
                <p className="font-bold text-primary">{eur(capitalAmortizado)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-neutral-500">Intereses pagados</p>
                <p className="font-bold text-amber-600">{eur(interesesPagados)}</p>
              </div>
            </div>
          </div>

          {/* Amortization table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold">Cuadro de amortización</h3>
              <span className="text-xs text-neutral-500">{paidRows.length} de {amortRows.length} cuotas pagadas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-50 border-b">
                    <th className="text-center p-2 font-medium text-neutral-600">#</th>
                    <th className="text-left p-2 font-medium text-neutral-600">Fecha</th>
                    <th className="text-right p-2 font-medium text-neutral-600">Cuota</th>
                    <th className="text-right p-2 font-medium text-neutral-600">Intereses</th>
                    <th className="text-right p-2 font-medium text-neutral-600">Capital</th>
                    <th className="text-right p-2 font-medium text-neutral-600">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map(row => (
                    <tr key={row.mes} className={`border-b ${row.pagado ? 'bg-green-50/50' : ''}`}>
                      <td className="p-2 text-center text-neutral-400">{row.mes}</td>
                      <td className="p-2">{row.fecha}</td>
                      <td className="p-2 text-right font-mono">{eur(row.cuota)}</td>
                      <td className="p-2 text-right font-mono text-amber-600">{eur(row.intereses)}</td>
                      <td className="p-2 text-right font-mono text-blue-600">{eur(row.capital_amortizado)}</td>
                      <td className="p-2 text-right font-mono">{eur(row.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {amortRows.length > 24 && !showFullTable && (
              <button
                onClick={() => setShowFullTable(true)}
                className="w-full p-3 text-xs text-neutral-500 hover:bg-neutral-50 border-t"
              >
                Ver todas las {amortRows.length} cuotas ↓
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border p-8 text-center text-neutral-400">
          No hay hipoteca registrada para esta operación.
        </div>
      )}

      {/* Add/edit mortgage form */}
      {(showForm || mortgages.length === 0) && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-bold mb-4">{mortgage ? 'Editar hipoteca' : 'Añadir hipoteca'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Entidad', field: 'lender', type: 'text' },
              { label: 'Capital prestado (€)', field: 'capital', type: 'number' },
              { label: 'Tipo nominal anual (%)', field: 'interest_rate', type: 'number' },
              { label: 'TAE (%)', field: 'tae', type: 'number' },
              { label: 'Plazo (meses)', field: 'term_months', type: 'number' },
              { label: 'Cuota mensual (€)', field: 'monthly_payment', type: 'number' },
              { label: 'Fecha inicio', field: 'start_date', type: 'date' },
              { label: 'Tasación (€)', field: 'tasacion_cost', type: 'number' },
              { label: 'Comisión apertura (%)', field: 'apertura_commission_pct', type: 'number' },
              { label: 'Comisión apertura (€)', field: 'apertura_commission_amount', type: 'number' },
              { label: 'Otros costes (€)', field: 'other_costs', type: 'number' },
              { label: 'URL contrato Drive', field: 'drive_contract_url', type: 'text' },
            ].map(({ label, field, type }) => (
              <div key={field}>
                <label className="block text-xs text-neutral-500 mb-1">{label}</label>
                <input
                  type={type}
                  step="0.01"
                  value={String(form[field as keyof Mortgage] ?? '')}
                  onChange={e => setForm(p => ({
                    ...p,
                    [field]: type === 'number' ? (e.target.value === '' ? undefined : parseFloat(e.target.value)) : e.target.value
                  }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          {cuotaCalc && !form.monthly_payment && (
            <p className="mt-2 text-xs text-neutral-500">
              Cuota calculada (método francés): <strong>{eur(cuotaCalc)}/mes</strong>
            </p>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={saveMortgage}
              disabled={saving || !form.capital || !form.interest_rate || !form.term_months}
              className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar hipoteca'}
            </button>
            {mortgage && (
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded text-sm border hover:bg-neutral-50">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {mortgage && !showForm && (
        <button onClick={() => setShowForm(true)} className="text-xs text-primary hover:underline">
          Editar datos de hipoteca
        </button>
      )}
    </div>
  )
}
