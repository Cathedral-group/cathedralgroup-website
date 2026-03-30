'use client'

import { useState } from 'react'

interface ReviewItem {
  id: string
  doc_type: string
  number: string | null
  concept: string | null
  amount_total: number | null
  vat_amount: number | null
  issue_date: string | null
  supplier_nif: string | null
  original_filename: string | null
  drive_url: string | null
  ai_confidence: number | null
  needs_review: boolean
  review_status: string
  duplicate_reason: string | null
  linked_doc_id: string | null
  proyecto_code: string | null
  categoria_gasto: string | null
  es_gasto_general: boolean
  es_rectificativa: boolean
  es_documento_propio: boolean
  created_at: string
  direction: string
  [key: string]: unknown
}

interface RevisionViewProps {
  initialData: ReviewItem[]
  projects: { value: string; label: string }[]
  suppliers: { value: string; label: string }[]
}

const DOC_TYPES = [
  'factura', 'proforma', 'ticket', 'albaran', 'certificado', 'presupuesto',
  'contrato', 'nota_simple', 'escritura', 'licencia', 'informe', 'nomina',
  'modelo_fiscal', 'seguro', 'rectificativa', 'abono', 'justificante_pago', 'otro',
]

function formatEur(val: number | null): string {
  if (val === null || val === undefined) return '--'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null): string {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <span className="text-neutral-400 text-xs">--</span>
  const pct = Math.round(confidence * 100)
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>{pct}%</span>
}

function ReviewBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-700',
    revisado: 'bg-blue-100 text-blue-700',
    confirmado: 'bg-green-100 text-green-700',
    rechazado: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {status}
    </span>
  )
}

export default function RevisionView({ initialData, projects, suppliers }: RevisionViewProps) {
  const [items, setItems] = useState<ReviewItem[]>(initialData)
  const [selected, setSelected] = useState<ReviewItem | null>(null)
  const [category, setCategory] = useState<string>('todos_pendientes')
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<ReviewItem>>({})

  // Check if item was re-sent after deletion
  const isReenviada = (item: ReviewItem) =>
    item.duplicate_reason === 'reenviada_tras_borrar'

  // Days remaining before auto-delete (30 days from creation)
  const daysRemaining = (item: ReviewItem) => {
    if (!isReenviada(item)) return null
    const created = new Date(item.created_at)
    const autoDelete = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
    const now = new Date()
    return Math.max(0, Math.ceil((autoDelete.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  }

  // Categorize items by problem type
  const categorize = (item: ReviewItem) => {
    if (isReenviada(item)) return 'reenviadas'
    if (item.duplicate_reason) return 'duplicados'
    if (item.ai_confidence !== null && item.ai_confidence < 0.5) return 'no_legibles'
    if (item.doc_type === 'otro') return 'sin_clasificar'
    if (!item.supplier_nif && !item.number) return 'datos_incompletos'
    if (item.needs_review) return 'baja_confianza'
    return 'otros'
  }

  const pending = items.filter(i => i.review_status === 'pendiente')
  const counts = {
    todos_pendientes: pending.length,
    duplicados: pending.filter(i => categorize(i) === 'duplicados').length,
    no_legibles: pending.filter(i => categorize(i) === 'no_legibles').length,
    sin_clasificar: pending.filter(i => categorize(i) === 'sin_clasificar').length,
    datos_incompletos: pending.filter(i => categorize(i) === 'datos_incompletos').length,
    baja_confianza: pending.filter(i => categorize(i) === 'baja_confianza').length,
    reenviadas: pending.filter(i => categorize(i) === 'reenviadas').length,
    resueltos: items.filter(i => i.review_status !== 'pendiente').length,
  }

  // Sort: reenviadas always last
  const sortItems = (list: ReviewItem[]) => {
    const normal = list.filter(i => !isReenviada(i))
    const reenv = list.filter(i => isReenviada(i))
    return [...normal, ...reenv]
  }

  const filtered = sortItems(
    category === 'resueltos'
      ? items.filter(i => i.review_status !== 'pendiente')
      : category === 'todos_pendientes'
        ? pending
        : category === 'reenviadas'
          ? pending.filter(i => isReenviada(i))
          : pending.filter(i => categorize(i) === category)
  )

  const openItem = (item: ReviewItem) => {
    setSelected(item)
    setEditForm({
      doc_type: item.doc_type,
      number: item.number,
      supplier_nif: item.supplier_nif,
      amount_total: item.amount_total,
      issue_date: item.issue_date,
      proyecto_code: item.proyecto_code,
      categoria_gasto: item.categoria_gasto,
      concept: item.concept,
      es_gasto_general: item.es_gasto_general,
    })
  }

  const saveAndApprove = async (status: 'confirmado' | 'rechazado') => {
    if (!selected) return
    setSaving(true)
    try {
      const body = {
        id: selected.id,
        ...editForm,
        review_status: status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
        needs_review: false,
      }
      const res = await fetch('/api/db/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === selected.id ? { ...i, ...body } as ReviewItem : i))
        setSelected(null)
      }
    } finally {
      setSaving(false)
    }
  }

  const categories: { key: string; label: string; icon: string; color: string }[] = [
    { key: 'todos_pendientes', label: 'Todos pendientes', icon: '', color: 'bg-amber-100 text-amber-700' },
    { key: 'duplicados', label: 'Duplicados', icon: '', color: 'bg-red-100 text-red-700' },
    { key: 'no_legibles', label: 'No legibles', icon: '', color: 'bg-orange-100 text-orange-700' },
    { key: 'sin_clasificar', label: 'Sin clasificar', icon: '', color: 'bg-purple-100 text-purple-700' },
    { key: 'datos_incompletos', label: 'Datos incompletos', icon: '', color: 'bg-blue-100 text-blue-700' },
    { key: 'baja_confianza', label: 'Baja confianza', icon: '', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'reenviadas', label: 'Reenviadas', icon: '', color: 'bg-neutral-200 text-neutral-500' },
    { key: 'resueltos', label: 'Resueltos', icon: '', color: 'bg-green-100 text-green-700' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-800">Revision de Documentos</h1>
        <p className="text-sm text-neutral-500 mt-1">{counts.todos_pendientes} documentos pendientes de revision</p>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map(cat => {
          const count = counts[cat.key as keyof typeof counts] || 0
          if (count === 0 && cat.key !== 'todos_pendientes' && cat.key !== 'resueltos') return null
          const isActive = category === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive ? cat.color + ' ring-2 ring-offset-1 ring-neutral-300' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b">
                <th className="text-left p-3 font-medium text-neutral-600">Archivo</th>
                <th className="text-left p-3 font-medium text-neutral-600">Tipo</th>
                <th className="text-left p-3 font-medium text-neutral-600">Proveedor</th>
                <th className="text-right p-3 font-medium text-neutral-600">Importe</th>
                <th className="text-center p-3 font-medium text-neutral-600">IA</th>
                <th className="text-center p-3 font-medium text-neutral-600">Estado</th>
                <th className="text-left p-3 font-medium text-neutral-600">Motivo</th>
                <th className="text-left p-3 font-medium text-neutral-600">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  onClick={() => openItem(item)}
                  className={`border-b cursor-pointer transition-colors ${isReenviada(item) ? 'bg-neutral-50 opacity-60 hover:opacity-80' : 'hover:bg-neutral-50'}`}
                >
                  <td className="p-3">
                    <div className="max-w-[200px] truncate text-xs font-mono">{item.original_filename || '--'}</div>
                  </td>
                  <td className="p-3">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100">
                      {item.doc_type}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{item.supplier_nif || '--'}</td>
                  <td className="p-3 text-right font-mono text-xs">{formatEur(item.amount_total)}</td>
                  <td className="p-3 text-center"><ConfidenceBadge confidence={item.ai_confidence} /></td>
                  <td className="p-3 text-center"><ReviewBadge status={item.review_status} /></td>
                  <td className="p-3">
                    {(() => {
                      const cat = categorize(item)
                      if (cat === 'reenviadas') {
                        const days = daysRemaining(item)
                        return (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-200 text-neutral-500">
                            Reenviada · se borra en {days}d
                          </span>
                        )
                      }
                      const catMap: Record<string, { label: string; cls: string }> = {
                        duplicados: { label: 'Duplicado', cls: 'bg-red-100 text-red-700' },
                        no_legibles: { label: 'No legible', cls: 'bg-orange-100 text-orange-700' },
                        sin_clasificar: { label: 'Sin clasificar', cls: 'bg-purple-100 text-purple-700' },
                        datos_incompletos: { label: 'Datos incompletos', cls: 'bg-blue-100 text-blue-700' },
                        baja_confianza: { label: 'Baja confianza', cls: 'bg-yellow-100 text-yellow-700' },
                        otros: { label: 'Otro', cls: 'bg-neutral-100 text-neutral-500' },
                      }
                      const info = catMap[cat] || catMap.otros
                      return (
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${info.cls}`}>
                          {info.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="p-3 text-xs">{formatDate(item.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-400">
                    No hay documentos pendientes de revision
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-out detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold">Revisar documento</h2>
              <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-600 text-xl">&times;</button>
            </div>

            <div className="p-4 space-y-4">
              {/* File info */}
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Archivo original</p>
                <p className="text-sm font-mono break-all">{selected.original_filename || 'Sin nombre'}</p>
                {selected.drive_url && (
                  <a href={selected.drive_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-600 hover:underline">
                    Ver en Google Drive &rarr;
                  </a>
                )}
              </div>

              {/* AI extraction */}
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-2">Datos extraidos por IA (confianza: {Math.round((selected.ai_confidence || 0) * 100)}%)</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-neutral-400">Tipo:</span> {selected.doc_type}</div>
                  <div><span className="text-neutral-400">Numero:</span> {selected.number || '--'}</div>
                  <div><span className="text-neutral-400">NIF:</span> {selected.supplier_nif || '--'}</div>
                  <div><span className="text-neutral-400">Importe:</span> {formatEur(selected.amount_total)}</div>
                  <div><span className="text-neutral-400">IVA:</span> {formatEur(selected.vat_amount)}</div>
                  <div><span className="text-neutral-400">Fecha:</span> {formatDate(selected.issue_date)}</div>
                  <div className="col-span-2"><span className="text-neutral-400">Concepto:</span> {selected.concept || '--'}</div>
                </div>
                {selected.duplicate_reason && (
                  <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-700">
                    Posible duplicado: {selected.duplicate_reason}
                    {selected.linked_doc_id && <span className="block mt-1 font-mono text-[10px]">Vinculado a: {selected.linked_doc_id}</span>}
                  </div>
                )}
              </div>

              {/* Edit form */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Corregir / Clasificar</p>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Tipo de documento</label>
                  <select
                    value={editForm.doc_type || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, doc_type: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">NIF proveedor</label>
                    <input
                      type="text"
                      value={editForm.supplier_nif || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, supplier_nif: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Numero</label>
                    <input
                      type="text"
                      value={editForm.number || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, number: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Importe total</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.amount_total ?? ''}
                      onChange={e => setEditForm(prev => ({ ...prev, amount_total: parseFloat(e.target.value) || 0 }))}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Fecha emision</label>
                    <input
                      type="date"
                      value={editForm.issue_date || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, issue_date: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Proyecto</label>
                  <select
                    value={editForm.proyecto_code || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, proyecto_code: e.target.value || null }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Sin proyecto</option>
                    {projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Concepto</label>
                  <input
                    type="text"
                    value={editForm.concept || ''}
                    onChange={e => setEditForm(prev => ({ ...prev, concept: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => saveAndApprove('confirmado')}
                  disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded font-medium text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => saveAndApprove('rechazado')}
                  disabled={saving}
                  className="flex-1 bg-red-50 text-red-600 py-2.5 rounded font-medium text-sm hover:bg-red-100 disabled:opacity-50"
                >
                  Rechazar (duplicado)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
