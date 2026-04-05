'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type SortField = 'name' | 'status' | 'purchase_price' | 'created_at'

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
    (op.itp_amount ?? (op.purchase_price ?? 0) * ((op.itp_rate ?? 6) / 100)) +
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
    (op.agent_commission_amount ?? (op.sale_price ?? 0) * ((op.agent_commission_pct ?? 3) / 100)) +
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
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ code: '', name: '', status: 'prospecto', address: '', property_type: 'piso', surface_m2: '' })
  const [saving, setSaving] = useState(false)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'created_at' || field === 'purchase_price' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thCls = (field: SortField, extra = '') =>
    `text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors ${
      sortField === field ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'
    } ${extra}`

  const ACTIVE_STATUSES = ['prospecto','comprada','en_reforma','en_venta']

  const filtered = useMemo(() => {
    const list = ops.filter(op => {
      if (filter === 'activas' && !ACTIVE_STATUSES.includes(op.status)) return false
      if (filter === 'vendidas' && op.status !== 'vendida') return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !(op.code ?? '').toLowerCase().includes(q) &&
          !(op.name ?? '').toLowerCase().includes(q) &&
          !(op.address ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })

    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' })
          break
        case 'status':
          cmp = (a.status ?? '').localeCompare(b.status ?? '')
          break
        case 'purchase_price':
          cmp = (a.purchase_price ?? 0) - (b.purchase_price ?? 0)
          break
        case 'created_at':
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [ops, filter, search, sortField, sortDir])

  const totalActivas = ops.filter(o => ACTIVE_STATUSES.includes(o.status)).length
  const activeOps = ops.filter(o => ACTIVE_STATUSES.includes(o.status))
  const hasInversionData = activeOps.some(o => o.purchase_price != null)
  const totalInversion = activeOps.reduce((s, o) => s + calcKpis(o).totalInvertido, 0)
  const vendidas = ops.filter(o => o.status === 'vendida')
  const vendidaRois = vendidas.map(o => calcKpis(o).roi).filter((r): r is number => r !== null)
  const roiMedio = vendidaRois.length > 0
    ? vendidaRois.reduce((s, r) => s + r, 0) / vendidaRois.length
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
          surface_m2: newForm.surface_m2.trim() ? parseFloat(newForm.surface_m2) : null,
        }),
      })
      if (res.ok) {
        const { data } = await res.json()
        if (!data?.id) return
        setOps(prev => [data, ...prev])
        setShowNew(false)
        setNewForm({ code: '', name: '', status: 'prospecto', address: '', property_type: 'piso', surface_m2: '' })
        router.push(`/admin/operaciones/${data.id}`)
      } else {
        const errBody = await res.json().catch(() => ({}))
        alert('Error al crear la operación: ' + (errBody.error || `Error ${res.status}`))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Operaciones</h1>
        <button
          onClick={() => setShowNew(true)}
          className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
        >
          + Nueva operación
        </button>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-neutral-100 p-5 hover:border-primary hover:shadow-sm transition-all">
          <p className="text-xl font-bold text-neutral-900">{totalActivas}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-2">Operaciones activas</p>
        </div>
        <div className="bg-white border border-neutral-100 p-5 hover:border-primary hover:shadow-sm transition-all">
          <p className="text-xl font-bold text-neutral-900">{hasInversionData ? eur(totalInversion) : '—'}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-2">Inversión total viva</p>
        </div>
        <div className="bg-white border border-neutral-100 p-5 hover:border-primary hover:shadow-sm transition-all">
          <p className={`text-xl font-bold ${roiMedio != null && roiMedio >= 0 ? 'text-green-600' : 'text-neutral-900'}`}>
            {roiMedio != null ? `${roiMedio.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-2">ROI medio vendidas</p>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2">
          {(['todas','activas','vendidas'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                filter === f ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-500 hover:border-primary'
              }`}
            >
              {f === 'todas' ? `Todas (${ops.length})` : f === 'activas' ? `Activas (${ops.filter(o => ACTIVE_STATUSES.includes(o.status)).length})` : `Vendidas (${ops.filter(o => o.status === 'vendida').length})`}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="bg-neutral-50 border border-neutral-200 focus:ring-1 focus:ring-primary focus:outline-none px-4 py-2 text-sm w-52"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <th onClick={() => handleSort('name')} className={thCls('name')}>Operación{sortIcon('name')}</th>
                <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hidden md:table-cell">Dirección</th>
                <th onClick={() => handleSort('status')} className={thCls('status')}>Estado{sortIcon('status')}</th>
                <th onClick={() => handleSort('purchase_price')} className={thCls('purchase_price', 'hidden sm:table-cell text-right')}>Precio compra{sortIcon('purchase_price')}</th>
                <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total invertido</th>
                <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Benef. neto</th>
                <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.map(op => {
                const { totalInvertido, benefNeto, roi } = calcKpis(op)
                const st = STATUS_MAP[op.status] ?? STATUS_MAP.prospecto
                return (
                  <tr
                    key={op.id}
                    onClick={() => router.push(`/admin/operaciones/${op.id}`)}
                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{op.name}</div>
                      <div className="text-[10px] text-neutral-400 font-mono uppercase tracking-widest">{op.code}</div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-neutral-500 max-w-[200px] truncate">{op.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm tabular-nums text-right">{eur(op.purchase_price)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-medium">{eur(totalInvertido || null)}</td>
                    <td className={`px-4 py-3 text-sm tabular-nums text-right font-bold ${
                      benefNeto == null ? 'text-neutral-300' : benefNeto >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {benefNeto != null ? eur(benefNeto) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-sm tabular-nums text-right font-bold ${
                      roi == null ? 'text-neutral-300' : roi >= 15 ? 'text-green-600' : roi >= 0 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {roi != null ? `${roi.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-neutral-400">
                    No hay operaciones. Crea la primera con &ldquo;+ Nueva operación&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New operation modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowNew(false); setNewForm({ code: '', name: '', status: 'prospecto', address: '', property_type: 'piso', surface_m2: '' }) }} />
          <div className="relative bg-white shadow-xl w-full max-w-md p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-5">Nueva operación</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">Código *</label>
                  <input
                    type="text"
                    placeholder="FLIP-2026-001"
                    value={newForm.code}
                    onChange={e => setNewForm(p => ({ ...p, code: e.target.value }))}
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">Estado</label>
                  <select
                    value={newForm.status}
                    onChange={e => setNewForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  >
                    {Object.entries(STATUS_MAP).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">Nombre *</label>
                <input
                  type="text"
                  placeholder="Piso Carabanchel 2d/1b"
                  value={newForm.name}
                  onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">Dirección</label>
                <input
                  type="text"
                  value={newForm.address}
                  onChange={e => setNewForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">Tipo</label>
                  <select
                    value={newForm.property_type}
                    onChange={e => setNewForm(p => ({ ...p, property_type: e.target.value }))}
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  >
                    {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">m²</label>
                  <input
                    type="number"
                    value={newForm.surface_m2}
                    onChange={e => setNewForm(p => ({ ...p, surface_m2: e.target.value }))}
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={createOp}
                disabled={saving || !newForm.code || !newForm.name}
                className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
              >
                {saving ? 'Creando...' : 'Crear operación'}
              </button>
              <button
                onClick={() => { setShowNew(false); setNewForm({ code: '', name: '', status: 'prospecto', address: '', property_type: 'piso', surface_m2: '' }) }}
                className="text-neutral-500 hover:text-neutral-700 text-xs font-bold uppercase tracking-widest"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
