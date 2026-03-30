'use client'

import { useState, useEffect, useMemo } from 'react'

interface CatalogItem {
  id: string
  chapter_code: string
  chapter_name: string
  subcategory: string | null
  code: string | null
  description: string
  unit: string
  unit_price: number
  notes: string | null
}

interface CatalogModalProps {
  qualityCoefficient: number
  qualityLabel: string
  onAdd: (items: { description: string; unit: string; unit_price: number; base_unit_price: number; chapter_code: string; chapter_name: string }[]) => void
  onClose: () => void
}

export default function CatalogModal({ qualityCoefficient, qualityLabel, onAdd, onClose }: CatalogModalProps) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [selectedSubcat, setSelectedSubcat] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/db/catalog')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d) => { setItems(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const chapters = useMemo(() => {
    const seen = new Map<string, string>()
    items.forEach((it) => seen.set(it.chapter_code, it.chapter_name))
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
  }, [items])

  const subcats = useMemo(() => {
    if (!selectedChapter) return []
    const seen = new Set<string>()
    items.filter((it) => it.chapter_code === selectedChapter && it.subcategory).forEach((it) => seen.add(it.subcategory!))
    return Array.from(seen).sort()
  }, [items, selectedChapter])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (search) {
        const q = search.toLowerCase()
        if (!`${it.description} ${it.code ?? ''}`.toLowerCase().includes(q)) return false
        return true
      }
      if (selectedChapter && it.chapter_code !== selectedChapter) return false
      if (selectedSubcat && it.subcategory !== selectedSubcat) return false
      return true
    })
  }, [items, selectedChapter, selectedSubcat, search])

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = () => {
    const toAdd = items
      .filter((it) => selected.has(it.id))
      .map((it) => ({
        description: it.description,
        unit: it.unit,
        unit_price: Math.round(it.unit_price * qualityCoefficient * 100) / 100,
        base_unit_price: it.unit_price,
        chapter_code: it.chapter_code,
        chapter_name: it.chapter_name,
      }))
    onAdd(toAdd)
  }

  const formatEur = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex flex-col items-stretch" onClick={onClose}>
      <div
        className="relative bg-white w-full max-w-4xl mx-auto my-0 sm:my-4 md:my-8 rounded-lg shadow-2xl flex flex-col overflow-hidden flex-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none border-b border-neutral-100 px-6 py-4 flex items-center gap-4">
          <h2 className="text-sm font-bold uppercase tracking-widest">Catálogo de partidas</h2>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded">
            {qualityLabel} ×{qualityCoefficient}
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedChapter(null); setSelectedSubcat(null) }}
            placeholder="Buscar partida..."
            className="ml-auto bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-full max-w-[220px]"
          />
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-xl leading-none">&#x2715;</button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Chapter sidebar */}
          {!search && (
            <div className="w-28 sm:w-44 flex-none border-r border-neutral-100 overflow-y-auto bg-neutral-50">
              <button
                onClick={() => { setSelectedChapter(null); setSelectedSubcat(null) }}
                className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${!selectedChapter ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
              >
                Todos
              </button>
              {chapters.map((ch) => (
                <button
                  key={ch.code}
                  onClick={() => { setSelectedChapter(ch.code); setSelectedSubcat(null) }}
                  className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${selectedChapter === ch.code ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-600 hover:bg-neutral-100'}`}
                >
                  <span className="font-mono text-[10px] text-neutral-400 block">{ch.code}</span>
                  {ch.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Subcategory filter */}
            {selectedChapter && subcats.length > 0 && (
              <div className="flex-none border-b border-neutral-100 px-4 py-2 flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedSubcat(null)}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${!selectedSubcat ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                >
                  Todas
                </button>
                {subcats.map((sc) => (
                  <button
                    key={sc}
                    onClick={() => setSelectedSubcat(sc)}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${selectedSubcat === sc ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            )}

            {/* Items list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-sm text-neutral-400">Cargando catálogo...</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-neutral-400">Sin resultados</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      <th className="w-8 px-4 py-2"></th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Descripción</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hidden sm:table-cell">Ud.</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Precio base</th>
                      <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Precio {qualityLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {filtered.map((it) => {
                      const isSelected = selected.has(it.id)
                      const adjustedPrice = Math.round(it.unit_price * qualityCoefficient * 100) / 100
                      return (
                        <tr
                          key={it.id}
                          onClick={() => toggleItem(it.id)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-neutral-50'}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className={`w-4 h-4 border rounded transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-neutral-300'} flex items-center justify-center`}>
                              {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-neutral-800">{it.description}</p>
                            {it.code && <p className="text-[10px] text-neutral-400 font-mono">{it.code}</p>}
                          </td>
                          <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-neutral-500">{it.unit}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400 text-xs">{formatEur(it.unit_price)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatEur(adjustedPrice)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none border-t border-neutral-100 px-6 py-4 flex items-center justify-between">
          <span className="text-sm text-neutral-500">
            {selected.size > 0 ? `${selected.size} partida${selected.size > 1 ? 's' : ''} seleccionada${selected.size > 1 ? 's' : ''}` : 'Selecciona partidas para añadir'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="border border-neutral-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className="bg-neutral-900 text-white px-5 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-40"
            >
              Añadir {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
