'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

interface CatalogItem {
  id: string
  chapter_code: string
  chapter_name: string
  description: string
  unit: string
  unit_price: number
}

interface Props {
  items: CatalogItem[]
  qualityCoefficient: number
  position: { top: number; left: number }
  onSelect: (item: { description: string; unit: string; unit_price: number; base_unit_price: number; chapter_code: string; chapter_name: string }) => void
  onClose: () => void
}

export default function CatalogDropdown({ items, qualityCoefficient, position, onSelect, onClose }: Props) {
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const chapters = useMemo(() => {
    const seen = new Map<string, string>()
    items.forEach((it) => seen.set(it.chapter_code, it.chapter_name))
    return Array.from(seen.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [items])

  useEffect(() => {
    if (chapters.length > 0 && !selectedChapter) {
      setSelectedChapter(chapters[0].code)
    }
  }, [chapters, selectedChapter])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const visibleItems = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase()
      return items.filter((it) => it.description.toLowerCase().includes(q))
    }
    if (!selectedChapter) return items
    return items.filter((it) => it.chapter_code === selectedChapter)
  }, [items, selectedChapter, search])

  const fmt = (v: number) =>
    (v * qualityCoefficient).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

  const adjustedLeft = typeof window !== 'undefined'
    ? Math.max(8, Math.min(position.left, window.innerWidth - 488))
    : position.left

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: position.top + 4, left: adjustedLeft, zIndex: 300 }}
      className="w-[480px] bg-white border border-neutral-200 shadow-2xl rounded-sm overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search bar */}
      <div className="border-b border-neutral-100 px-3 py-2">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (e.target.value) setSelectedChapter(null) }}
          placeholder="Buscar partida..."
          className="w-full text-xs bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-2 py-1.5"
          autoFocus
        />
      </div>

      <div className="flex" style={{ maxHeight: 240 }}>
        {/* Chapter sidebar — hidden when searching */}
        {!search && (
          <div className="w-44 flex-none border-r border-neutral-100 overflow-y-auto bg-neutral-50">
            {chapters.map((ch) => (
              <button
                key={ch.code}
                onMouseDown={(e) => { e.preventDefault(); setSelectedChapter(ch.code) }}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  selectedChapter === ch.code
                    ? 'bg-neutral-900 text-white font-bold'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <span className="font-mono text-[9px] block opacity-50">{ch.code}</span>
                <span className="text-[10px] leading-tight">{ch.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {visibleItems.length === 0 ? (
            <p className="px-4 py-4 text-xs text-neutral-400">Sin resultados</p>
          ) : (
            visibleItems.map((it) => (
              <button
                key={it.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect({
                    description: it.description,
                    unit: it.unit,
                    unit_price: Math.round(it.unit_price * qualityCoefficient * 100) / 100,
                    base_unit_price: it.unit_price,
                    chapter_code: it.chapter_code,
                    chapter_name: it.chapter_name,
                  })
                }}
                className="w-full text-left px-3 py-2 hover:bg-primary/5 border-b border-neutral-50 transition-colors"
              >
                <div className="text-xs text-neutral-800 leading-snug">{it.description}</div>
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  {it.unit} · {fmt(it.unit_price)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
