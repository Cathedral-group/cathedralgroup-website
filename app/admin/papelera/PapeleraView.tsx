'use client'

import { useState, useMemo } from 'react'

interface TrashedItem {
  id: string
  _table: 'leads' | 'clients' | 'suppliers' | 'projects' | 'invoices' | 'quotes' | 'documents'
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
  Documento: 'bg-teal-50 text-teal-700',
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

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-neutral-100 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="text-lg font-medium text-neutral-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function PapeleraView({ items: initialItems }: { items: TrashedItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [typeFilter, setTypeFilter] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  // ─── Patrón coherente Cathedral: 4 modos
  const [viewMode, setViewMode] = useState<'tipo' | 'antiguedad' | 'mes' | 'lista'>('tipo')

  const types = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach(i => { counts[i._type] = (counts[i._type] || 0) + 1 })
    return Object.entries(counts).map(([type, count]) => ({ type, count }))
  }, [items])

  const filtered = useMemo(() => {
    if (!typeFilter) return items
    return items.filter(i => i._type === typeFilter)
  }, [items, typeFilter])

  /* ───────── KPIs (patrón Cathedral) ───────── */
  const kpis = useMemo(() => {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const hoy = items.filter(i => now - new Date(i.deleted_at).getTime() < oneDay).length
    const semana = items.filter(i => now - new Date(i.deleted_at).getTime() < 7 * oneDay).length
    const mes = items.filter(i => now - new Date(i.deleted_at).getTime() < 30 * oneDay).length
    return { total: items.length, hoy, semana, mes }
  }, [items])

  /* ───────── Agrupación según viewMode ───────── */
  function trashGroupKey(it: TrashedItem): { key: string; label: string } {
    if (viewMode === 'tipo') {
      return { key: it._type, label: it._type }
    }
    if (viewMode === 'antiguedad') {
      const days = Math.floor((Date.now() - new Date(it.deleted_at).getTime()) / (24 * 60 * 60 * 1000))
      if (days < 1) return { key: '1_hoy', label: 'Hoy' }
      if (days < 7) return { key: '2_semana', label: 'Esta semana' }
      if (days < 30) return { key: '3_mes', label: 'Este mes' }
      if (days < 90) return { key: '4_trimestre', label: 'Hace 1-3 meses' }
      return { key: '5_antiguo', label: 'Más de 3 meses' }
    }
    if (viewMode === 'mes') {
      const d = new Date(it.deleted_at)
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${meses[d.getMonth()]} ${d.getFullYear()}` }
    }
    return { key: 'all', label: 'Todos' }
  }

  const grouped = useMemo(() => {
    if (viewMode === 'lista') return null
    const groups: Record<string, { label: string; items: TrashedItem[] }> = {}
    for (const it of filtered) {
      const { key, label } = trashGroupKey(it)
      if (!groups[key]) groups[key] = { label, items: [] }
      groups[key].items.push(it)
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, viewMode])

  const handleRestore = async (item: TrashedItem) => {
    setRestoring(item.id)
    const res = await fetch('/api/db/papelera', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, table: item._table }),
    })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== item.id))
    } else {
      alert('Error al restaurar. Inténtalo de nuevo.')
    }
    setRestoring(null)
  }

  const handleClearAll = async () => {
    if (!confirm(`¿Eliminar permanentemente ${filtered.length} elemento${filtered.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    setClearingAll(true)
    try {
      const res = await fetch('/api/db/papelera', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: filtered.map(i => ({ id: i.id, table: i._table })) }),
      })
      if (res.ok) {
        const deletedIds = new Set(filtered.map(i => i.id))
        setItems(prev => prev.filter(i => !deletedIds.has(i.id)))
      } else {
        alert('Error al eliminar. Inténtalo de nuevo.')
      }
    } catch { alert('Error al eliminar. Inténtalo de nuevo.') }
    setClearingAll(false)
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
    } else {
      alert('Error al eliminar. Inténtalo de nuevo.')
    }
    setDeleting(null)
  }

  return (
    <>
      {/* ─── KPIs Cathedral ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Total papelera" value={String(kpis.total)} />
        <KpiCard label="Hoy" value={String(kpis.hoy)} />
        <KpiCard label="Esta semana" value={String(kpis.semana)} />
        <KpiCard label="Este mes" value={String(kpis.mes)} />
      </div>

      {/* ─── Selector de modos coherente ─── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-1">Vista:</span>
        {(['tipo', 'antiguedad', 'mes', 'lista'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ${
              viewMode === mode
                ? 'bg-neutral-900 text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            Por {mode === 'antiguedad' ? 'antigüedad' : mode}
          </button>
        ))}

        {viewMode === 'lista' && (
          <>
            <div className="w-px h-5 bg-neutral-200 mx-1" />
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
          </>
        )}
      </div>

      {filtered.length > 0 && viewMode === 'lista' && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleClearAll}
            disabled={clearingAll}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors disabled:opacity-50"
          >
            {clearingAll ? 'Eliminando...' : `Vaciar todo (${filtered.length})`}
          </button>
        </div>
      )}

      {/* ─── Vista lista (tabla original) ─── */}
      {viewMode === 'lista' && (
        filtered.length === 0 ? (
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
      ))}

      {/* ─── Vista agrupada (tipo / antigüedad / mes) ─── */}
      {viewMode !== 'lista' && grouped && (
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 && (
            <div className="bg-white border border-neutral-100 p-12 text-center">
              <p className="text-neutral-400 text-sm">La papelera está vacía</p>
            </div>
          )}
          {Object.entries(grouped)
            .sort((a, b) => {
              // Para "antiguedad" y "mes": orden lógico por clave (que tiene prefijo numérico o fecha)
              if (viewMode === 'antiguedad') return a[0].localeCompare(b[0])
              if (viewMode === 'mes') return b[0].localeCompare(a[0]) // mes desc
              return a[1].label.localeCompare(b[1].label, 'es')
            })
            .map(([key, group]) => (
              <div key={key} className="bg-white border border-neutral-100">
                <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-700">{group.label}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      {group.items.length} elemento{group.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-neutral-50">
                  {group.items.map((it) => (
                    <div key={`${it._table}-${it.id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 transition-colors">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${TYPE_STYLES[it._type] || 'bg-neutral-100 text-neutral-600'}`}>
                        {it._type}
                      </span>
                      <span className="text-sm font-medium flex-1 truncate">{it._label}</span>
                      <span className="text-xs text-neutral-500 hidden sm:inline">{formatDate(it.deleted_at)}</span>
                      <button
                        onClick={() => handleRestore(it)}
                        disabled={restoring === it.id}
                        className="text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-800 px-3 py-1 border border-green-200 hover:bg-green-50 transition-colors disabled:opacity-50"
                      >
                        {restoring === it.id ? '...' : 'Restaurar'}
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(it)}
                        disabled={deleting === it.id}
                        className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 px-3 py-1 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting === it.id ? '...' : 'Eliminar'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  )
}
