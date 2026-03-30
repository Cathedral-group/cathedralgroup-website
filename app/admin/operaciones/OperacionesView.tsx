'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FlippingOp {
  id: string
  code: string
  name: string
  status: string
  address: string | null
  property_type: string | null
  surface_m2: number | null
  purchase_price: number | null
  purchase_date: string | null
  itp_amount: number | null
  itp_rate: number | null
  purchase_notary_cost: number | null
  purchase_registry_cost: number | null
  purchase_gestoria_cost: number | null
  reform_budget_estimated: number | null
  sale_price: number | null
  sale_date: string | null
  agent_commission_amount: number | null
  agent_commission_pct: number | null
  sale_notary_cost: number | null
  sale_registry_cost: number | null
  sale_gestoria_cost: number | null
  plusvalia_amount: number | null
  is_tax_amount: number | null
  created_at: string
  [key: string]: unknown
}

interface Props {
  initialData: FlippingOp[]
  projects: { id: string; code: string; name: string }[]
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  prospecto:  { label: 'Prospecto',   cls: 'bg-neutral-100 text-neutral-600' },
  comprada:   { label: 'Comprada',    cls: 'bg-blue-100 text-blue-700' },
  en_reforma: { label: 'En reforma',  cls: 'bg-amber-100 text-amber-700' },
  en_venta:   { label: 'En venta',    cls: 'bg-purple-100 text-purple-700' },
  vendida:    { label: 'Vendida',     cls: 'bg-green-100 text-green-700' },
  cancelada:  { label: 'Cancelada',   cls: 'bg-red-100 text-red-700' },
}

const PROPERTY_TYPES = ['piso','local','chalet','atico','planta_baja','nave','otro']

function eur(v: number | null | undefined) {
  if (v == null) return '--'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function calcKpis(op: FlippingOp) {
  const totalCompra =
    (op.purchase_price ?? 0) +
    (op.itp_amount ?? (op.purchase_price ?? 0) * ((op.itp_rate ?? 0.4) / 100)) +
    (op.purchase_notary_cost ?? 0) +
    (op.purchase_registry_cost ?? 0) +
    (op.purchase_gestoria_cost ?? 0)
  const reforma = op.reform_budget_estimated ?? 0
  const totalInvertido = totalCompra + reforma
  const ingreso = op.sale_price ?? 0
  const gastosVenta =
    (op.sale_notary_cost ?? 0) +
    (op.sale_registry_cost ?? 0) +
    (op.sale_gestoria_cost ?? 0) +
    (op.agent_commission_amount ?? 0) +
    (op.plusvalia_amount ?? 0) +
    (op.is_tax_amount ?? 0)
  const benefNeto = op.sale_price ? ingreso - totalInvertido - gastosVenta : null
  const roi = benefNeto != null && totalInvertido > 0 ? (benefNeto / totalInvertido) * 100 : null
  return { totalInvertido, benefNeto, roi }
}

export default function OperacionesView({ initialData, projects }: Props) {
  const router = useRouter()
  const [ops, setOps] = useState<FlippingOp[]>(initialData)
  const [filter, setFilter] = useState<'activas' | 'vendidas' | 'todas'>('todas')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ code: '', name: '', status: 'prospecto', address: '', property_type: 'piso', surface_m2: '' })
  const [saving, setSaving] = useState(false)

  const ACTIVE_STATUSES = ['prospecto','comprada','en_reforma','en_venta']
  const filtered = ops.filter(op => {
    if (filter === 'activas') return ACTIVE_STATUSES.includes(op.status)
    if (filter === 'vendidas') return op.status === 'vendida'
    return true
  })

  const totalActivas = ops.filter(o => ACTIVE_STATUSES.includes(o.status)).length
  const totalInversion = ops
    .filter(o => ACTIVE_STATUSES.includes(o.status))
    .reduce((s, o) => s + calcKpis(o).totalInvertido, 0)
  const vendidas = ops.filter(o => o.status === 'vendida')
  const roiMedio = vendidas.length > 0
    ? vendidas.reduce((s, o) => s + (calcKpis(o).roi ?? 0), 0) / vendidas.length
    : null

  const createOp = async () => {
    if (!newForm.code || !newForm.name) return
    setSaving(true)
    try {
      const res = await fetch('/api/db/flipping-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newForm,
          surface_m2: newForm.surface_m2 ? parseFloat(newForm.surface_m2) : null,
        }),
      })
      if (res.ok) {
        const { data } = await res.json()
        setOps(prev => [data, ...prev])
        setShowNew(false)
        setNewForm({ code: '', name: '', status: 'prospecto', address: '', property_type: 'piso', surface_m2: '' })
        router.push(`/admin/operaciones/${data.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Operaciones de Flipping</h1>
          <p className="text-sm text-neutral-500 mt-1">Compraventa de inmuebles con reforma</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          + Nueva operación
        </button>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500 mb-1">Operaciones activas</p>
          <p className="text-2xl font-bold">{totalActivas}</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500 mb-1">Inversión total viva</p>
          <p className="text-2xl font-bold">{eur(totalInversion)}</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500 mb-1">ROI medio (vendidas)</p>
          <p className="text-2xl font-bold">
            {roiMedio != null ? `${roiMedio.toFixed(1)}%` : '--'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['todas','activas','vendidas'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
              filter === f ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {f === 'todas' ? 'Todas' : f === 'activas' ? 'Activas' : 'Vendidas'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b">
                <th className="text-left p-3 font-medium text-neutral-600">Operación</th>
                <th className="text-left p-3 font-medium text-neutral-600">Dirección</th>
                <th className="text-left p-3 font-medium text-neutral-600">Estado</th>
                <th className="text-right p-3 font-medium text-neutral-600">Precio compra</th>
                <th className="text-right p-3 font-medium text-neutral-600">Total invertido</th>
                <th className="text-right p-3 font-medium text-neutral-600">Benef. neto</th>
                <th className="text-right p-3 font-medium text-neutral-600">ROI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(op => {
                const { totalInvertido, benefNeto, roi } = calcKpis(op)
                const st = STATUS_MAP[op.status] ?? STATUS_MAP.prospecto
                return (
                  <tr
                    key={op.id}
                    onClick={() => router.push(`/admin/operaciones/${op.id}`)}
                    className="border-b hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    <td className="p-3">
                      <div className="font-medium">{op.name}</div>
                      <div className="text-xs text-neutral-400 font-mono">{op.code}</div>
                    </td>
                    <td className="p-3 text-xs text-neutral-600">{op.address || '--'}</td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{eur(op.purchase_price)}</td>
                    <td className="p-3 text-right font-mono text-xs">{eur(totalInvertido || null)}</td>
                    <td className={`p-3 text-right font-mono text-xs font-bold ${
                      benefNeto == null ? 'text-neutral-400' : benefNeto >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {benefNeto != null ? eur(benefNeto) : '--'}
                    </td>
                    <td className={`p-3 text-right font-mono text-xs font-bold ${
                      roi == null ? 'text-neutral-400' : roi >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {roi != null ? `${roi.toFixed(1)}%` : '--'}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-neutral-400">
                    No hay operaciones. Crea la primera con &quot;+ Nueva operación&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New operation modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNew(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Nueva operación</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Código *</label>
                  <input
                    type="text"
                    placeholder="FLIP-2026-001"
                    value={newForm.code}
                    onChange={e => setNewForm(p => ({ ...p, code: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Estado</label>
                  <select
                    value={newForm.status}
                    onChange={e => setNewForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {Object.entries(STATUS_MAP).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Nombre *</label>
                <input
                  type="text"
                  placeholder="Piso Carabanchel 2d/1b"
                  value={newForm.name}
                  onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Dirección</label>
                <input
                  type="text"
                  value={newForm.address}
                  onChange={e => setNewForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Tipo</label>
                  <select
                    value={newForm.property_type}
                    onChange={e => setNewForm(p => ({ ...p, property_type: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">m²</label>
                  <input
                    type="number"
                    value={newForm.surface_m2}
                    onChange={e => setNewForm(p => ({ ...p, surface_m2: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={createOp}
                disabled={saving || !newForm.code || !newForm.name}
                className="flex-1 bg-primary text-white py-2.5 rounded font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Creando...' : 'Crear operación'}
              </button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2.5 rounded text-sm border hover:bg-neutral-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
