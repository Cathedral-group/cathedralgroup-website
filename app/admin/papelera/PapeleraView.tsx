'use client'

import { useState, useMemo } from 'react'

interface TrashedItem {
  id: string
  _table: 'leads' | 'clients' | 'suppliers' | 'projects' | 'invoices' | 'quotes'
  _type: string
  _label: string
  deleted_at: string
  [key: string]: unknown
}

const TYPE_STYLES: Record<string, string> = {
  Lead: 'bg-purple-50 text-purple-700',
  Cliente: 'bg-blue-50 text-blue-700',
  Proveedor: 'bg-orange-50 text-orange-700',
  Proyecto: 'bg-green-50 text-green-700',
  Factura: 'bg-amber-50 text-amber-700',
  Presupuesto: 'bg-neutral-100 text-neutral-700',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PapeleraView({ items: initialItems }: { items: TrashedItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [typeFilter, setTypeFilter] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const types = useMemo(() => {
    const counts: Record<string, number> = {}
    initialItems.forEach(i => { counts[i._type] = (counts[i._type] || 0) + 1 })
    return Object.entries(counts).map(([type, count]) => ({ type, count }))
  }, [initialItems])

  const filtered = useMemo(() => {
    if (!typeFilter) return items
    return items.filter(i => i._type === typeFilter)
  }, [items, typeFilter])

  const handleRestore = async (item: TrashedItem) => {
    setRestoring(item.id)
    const res = await fetch('/api/db/papelera', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, table: item._table }),
    })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== item.id))
    }
    setRestoring(null)
  }

  const handlePermanentDelete = async (item: TrashedItem) => {
    if (!confirm('Eliminar permanentemente? Esta accion no se puede deshacer.')) return
    setDeleting(item.id)
    const res = await fetch('/api/db/papelera', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, table: item._table }),
    })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== item.id))
    }
    setDeleting(null)
  }

  return (
    <>
      {/* Type filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <button
          onClick={() => setTypeFilter('')}
          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
            !typeFilter ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
          }`}
        >
          Todos ({items.length})
        </button>
        {types.map(({ type, count }) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
              typeFilter === type ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
            }`}
          >
            {type} ({count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-neutral-100 p-12 text-center">
          <p className="text-neutral-400 text-sm">La papelera esta vacia</p>
        </div>
      ) : (
        <div className="bg-white border border-neutral-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo</th>
                <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Nombre</th>
                <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fecha eliminacion</th>
                <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.map(item => (
                <tr key={`${item._table}-${item.id}`} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${TYPE_STYLES[item._type] || 'bg-neutral-100 text-neutral-600'}`}>
                      {item._type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{item._label}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(item.deleted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={restoring === item.id}
                        className="text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-800 px-3 py-1 border border-green-200 hover:bg-green-50 transition-colors disabled:opacity-50"
                      >
                        {restoring === item.id ? '...' : 'Restaurar'}
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item)}
                        disabled={deleting === item.id}
                        className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 px-3 py-1 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting === item.id ? '...' : 'Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </>
  )
}
