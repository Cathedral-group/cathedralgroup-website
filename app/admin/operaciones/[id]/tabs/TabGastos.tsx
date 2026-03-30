'use client'

import { useState } from 'react'

interface OpCost {
  id: string
  operation_id: string
  type: string
  concept: string | null
  amount: number
  date: string | null
  notes: string | null
  [key: string]: unknown
}

interface Invoice {
  id: string
  number: string | null
  concept: string | null
  amount_total: number | null
  issue_date: string | null
  supplier_nif: string | null
  doc_type: string
  original_filename: string | null
  [key: string]: unknown
}

interface Props {
  operationId: string
  reformBudget: number | null
  costs: OpCost[]
  invoices: Invoice[]
  onCostsUpdate: (costs: OpCost[]) => void
}

const COST_TYPES = [
  { value: 'itp', label: 'ITP' },
  { value: 'notaria_compra', label: 'Notaría compra' },
  { value: 'registro_compra', label: 'Registro compra' },
  { value: 'gestoria_compra', label: 'Gestoría compra' },
  { value: 'notaria_venta', label: 'Notaría venta' },
  { value: 'registro_venta', label: 'Registro venta' },
  { value: 'gestoria_venta', label: 'Gestoría venta' },
  { value: 'tasacion', label: 'Tasación' },
  { value: 'apertura_hipoteca', label: 'Apertura hipoteca' },
  { value: 'seguro_hipoteca', label: 'Seguro hipoteca' },
  { value: 'ibi', label: 'IBI' },
  { value: 'comunidad', label: 'Comunidad' },
  { value: 'seguro_inmueble', label: 'Seguro inmueble' },
  { value: 'suministros', label: 'Suministros' },
  { value: 'plusvalia', label: 'Plusvalía municipal' },
  { value: 'impuesto_sociedades', label: 'Impuesto de Sociedades' },
  { value: 'otro', label: 'Otro' },
]

function eur(v: number | null | undefined) {
  if (v == null) return '--'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export default function TabGastos({ operationId, reformBudget, costs, invoices, onCostsUpdate }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [newCost, setNewCost] = useState({ type: 'ibi', concept: '', amount: '', date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const reformaReal = invoices.reduce((s, i) => s + (i.amount_total ?? 0), 0)
  const reformPct = reformBudget && reformaReal > 0 ? Math.min(100, (reformaReal / reformBudget) * 100) : 0

  const tenenciaCosts = costs.filter(c => ['ibi','comunidad','seguro_inmueble','suministros'].includes(c.type))
  const totalTenencia = tenenciaCosts.reduce((s, c) => s + c.amount, 0)

  const addCost = async () => {
    if (!newCost.amount) return
    setSaving(true)
    try {
      const res = await fetch('/api/db/operation-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: operationId,
          type: newCost.type,
          concept: newCost.concept || null,
          amount: parseFloat(newCost.amount),
          date: newCost.date || null,
          notes: newCost.notes || null,
        }),
      })
      if (res.ok) {
        const { data } = await res.json()
        onCostsUpdate([data, ...costs])
        setNewCost({ type: 'ibi', concept: '', amount: '', date: '', notes: '' })
        setShowAdd(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteCost = async (id: string) => {
    const res = await fetch(`/api/db/operation-costs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) onCostsUpdate(costs.filter(c => c.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Reforma */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Reforma</h3>
          {reformBudget && (
            <span className="text-sm text-neutral-500">
              Presupuesto: <strong>{eur(reformBudget)}</strong>
            </span>
          )}
        </div>

        {reformBudget && (
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span>Ejecutado: {eur(reformaReal)}</span>
              <span>{reformPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${reformPct > 100 ? 'bg-red-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, reformPct)}%` }}
              />
            </div>
          </div>
        )}

        {invoices.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 text-xs text-neutral-500 font-medium">Factura</th>
                <th className="text-left p-2 text-xs text-neutral-500 font-medium">Proveedor</th>
                <th className="text-left p-2 text-xs text-neutral-500 font-medium">Concepto</th>
                <th className="text-right p-2 text-xs text-neutral-500 font-medium">Importe</th>
                <th className="text-left p-2 text-xs text-neutral-500 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b hover:bg-neutral-50">
                  <td className="p-2 font-mono text-xs">{inv.number || inv.original_filename || '--'}</td>
                  <td className="p-2 text-xs">{inv.supplier_nif || '--'}</td>
                  <td className="p-2 text-xs text-neutral-600">{inv.concept || '--'}</td>
                  <td className="p-2 text-right font-mono text-xs font-bold">{eur(inv.amount_total)}</td>
                  <td className="p-2 text-xs">{inv.issue_date ?? '--'}</td>
                </tr>
              ))}
              <tr className="bg-neutral-50">
                <td colSpan={3} className="p-2 text-xs font-bold text-right">Total reforma:</td>
                <td className="p-2 text-right font-bold font-mono">{eur(reformaReal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-400">
            No hay facturas vinculadas. Para vincular una factura a esta operación, edítala en{' '}
            <a href="/admin/facturas" className="text-primary hover:underline">Facturas</a> y asigna el campo &quot;Operación&quot;.
          </p>
        )}
      </div>

      {/* Gastos corrientes */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Gastos corrientes de tenencia</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">{eur(totalTenencia)}</span>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="text-xs bg-primary text-white px-3 py-1.5 rounded hover:bg-primary/90"
            >
              + Añadir gasto
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 bg-neutral-50 rounded-lg border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Tipo</label>
                <select
                  value={newCost.type}
                  onChange={e => setNewCost(p => ({ ...p, type: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Concepto</label>
                <input
                  type="text"
                  value={newCost.concept}
                  onChange={e => setNewCost(p => ({ ...p, concept: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Importe (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newCost.amount}
                  onChange={e => setNewCost(p => ({ ...p, amount: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Fecha</label>
                <input
                  type="date"
                  value={newCost.date}
                  onChange={e => setNewCost(p => ({ ...p, date: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addCost}
                disabled={saving || !newCost.amount}
                className="bg-primary text-white px-4 py-1.5 rounded text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-neutral-500 hover:text-neutral-700">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {costs.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 text-xs font-medium text-neutral-500">Tipo</th>
                <th className="text-left p-2 text-xs font-medium text-neutral-500">Concepto</th>
                <th className="text-right p-2 text-xs font-medium text-neutral-500">Importe</th>
                <th className="text-left p-2 text-xs font-medium text-neutral-500">Fecha</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {costs.map(c => (
                <tr key={c.id} className="border-b hover:bg-neutral-50">
                  <td className="p-2 text-xs">
                    <span className="inline-block px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 text-[10px] uppercase font-bold">
                      {COST_TYPES.find(t => t.value === c.type)?.label ?? c.type}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-neutral-600">{c.concept || '--'}</td>
                  <td className="p-2 text-right font-mono font-bold text-xs">{eur(c.amount)}</td>
                  <td className="p-2 text-xs">{c.date ?? '--'}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => deleteCost(c.id)}
                      className="text-neutral-300 hover:text-red-500 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-400">No hay gastos corrientes registrados.</p>
        )}
      </div>
    </div>
  )
}
