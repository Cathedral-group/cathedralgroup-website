'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'

interface QualityCoefficient {
  id: string
  level: string
  coefficient: number
  label: string
  description: string | null
}

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

type Tab = 'coeficientes' | 'catalogo'

// ── Coeficientes tab ──────────────────────────────────────────────────────────
function CoeficientesTab({ initial }: { initial: QualityCoefficient[] }) {
  const [data, setData] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  const update = (id: string, field: string, value: string | number) =>
    setData((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))

  const handleSave = async (row: QualityCoefficient) => {
    setSaving(row.id)
    try {
      const res = await fetch('/api/db/quality-coefficients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, coefficient: row.coefficient, label: row.label, description: row.description }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Error ${res.status}`) }
      const { data: updated } = await res.json()
      if (updated) setData((prev) => prev.map((r) => r.id === row.id ? updated : r))
      setSaved(row.id)
      setTimeout(() => setSaved(null), 2000)
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(null)
    }
  }

  const levelColors: Record<string, string> = {
    estandar: 'bg-neutral-100 text-neutral-700',
    premium: 'bg-blue-100 text-blue-700',
    lujo: 'bg-amber-100 text-amber-700',
  }

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-6">Ajusta los coeficientes de calidad que se aplican a los precios base del catálogo de partidas.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        {data.map((row) => (
          <div key={row.id} className="bg-white border border-neutral-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${levelColors[row.level] ?? 'bg-neutral-100'}`}>
                {row.level}
              </span>
              {saved === row.id && <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest">✓ Guardado</span>}
            </div>
            <div className="space-y-4">
              <div>
                <label className={lbl}>Nombre</label>
                <input type="text" value={row.label} onChange={(e) => update(row.id, 'label', e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Coeficiente</label>
                <div className="relative">
                  <input type="number" value={row.coefficient} onChange={(e) => update(row.id, 'coefficient', parseFloat(e.target.value) || 1)} step="0.1" min="0.1" className={inp + ' pr-8'} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-bold">×</span>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1.5">Precio final = precio base × {row.coefficient}</p>
              </div>
              <div>
                <label className={lbl}>Descripción</label>
                <textarea value={row.description ?? ''} onChange={(e) => update(row.id, 'description', e.target.value)} rows={3} className={inp} />
              </div>
            </div>
            <button onClick={() => handleSave(row)} disabled={saving === row.id}
              className="mt-5 w-full bg-neutral-900 text-white py-2.5 text-[10px] font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50">
              {saving === row.id ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        ))}
      </div>
      <section className="bg-neutral-50 border border-neutral-100 p-6 max-w-2xl">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Referencia de coeficientes</h3>
        <div className="space-y-2 text-sm text-neutral-600">
          <p><strong>Estándar ×1.0</strong> — Materiales de alta calidad, ejecución profesional. Precio base del catálogo. Equivale a ~650-800 €/m² en reforma completa.</p>
          <p><strong>Premium ×2.0</strong> — Materiales de selección, acabados cuidados, plazos más amplios. ~1.000-1.300 €/m².</p>
          <p><strong>Lujo ×3.0</strong> — Primera selección de materiales, técnicas artesanales, control de calidad exhaustivo. ~1.500-2.000 €/m².</p>
        </div>
        <p className="text-[10px] text-neutral-400 mt-3">Los coeficientes se aplican principalmente a mano de obra especializada y tiempo de ejecución.</p>
      </section>
    </div>
  )
}

// ── Catalog tab ───────────────────────────────────────────────────────────────
function CatalogTab() {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [chapter, setChapter] = useState<string>('all')
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    fetch('/api/db/catalog')
      .then((r) => r.json())
      .then((d) => { setItems(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const chapters = useMemo(() => {
    const seen = new Map<string, string>()
    items.forEach((it) => seen.set(it.chapter_code, it.chapter_name))
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (chapter !== 'all' && it.chapter_code !== chapter) return false
      if (search) {
        const q = search.toLowerCase()
        return (it.description + ' ' + (it.code ?? '') + ' ' + (it.subcategory ?? '')).toLowerCase().includes(q)
      }
      return true
    })
  }, [items, chapter, search])

  const updateField = useCallback((id: string, field: keyof CatalogItem, value: string | number) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, [field]: value } : it))
    setDirty((prev) => new Set(prev).add(id))
  }, [])

  const saveItem = useCallback(async (item: CatalogItem) => {
    setSaving((prev) => new Set(prev).add(item.id))
    try {
      const res = await fetch('/api/db/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          unit_price: item.unit_price,
          description: item.description,
          unit: item.unit,
          notes: item.notes,
        }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setSaved((prev) => new Set(prev).add(item.id))
      setDirty((prev) => { const n = new Set(prev); n.delete(item.id); return n })
      setTimeout(() => setSaved((prev) => { const n = new Set(prev); n.delete(item.id); return n }), 2000)
    } catch {
      // silent — retry on next blur
    } finally {
      setSaving((prev) => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }, [])

  const handleBlur = useCallback((item: CatalogItem) => {
    if (!dirty.has(item.id)) return
    clearTimeout(saveTimers.current[item.id])
    saveTimers.current[item.id] = setTimeout(() => saveItem(item), 300)
  }, [dirty, saveItem])

  const inputCls = 'w-full bg-transparent focus:bg-white focus:ring-1 focus:ring-primary outline-none px-2 py-1.5 text-sm rounded transition-all'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">
        Cargando catálogo…
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar partida…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-neutral-200 rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
          className="border border-neutral-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">Todas las secciones ({items.length})</option>
          {chapters.map(([code, name]) => {
            const count = items.filter(it => it.chapter_code === code).length
            return <option key={code} value={code}>{code} — {name} ({count})</option>
          })}
        </select>
        <span className="text-[10px] text-neutral-400 uppercase tracking-widest">
          {filtered.length} partidas
        </span>
        <span className="text-[10px] text-neutral-400 ml-auto">
          Los precios se guardan automáticamente al salir del campo
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-100 overflow-auto rounded">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-widest">
              <th className="text-left px-3 py-3 w-28">Sección</th>
              <th className="text-left px-3 py-3 w-28">Subcategoría</th>
              <th className="text-left px-3 py-3 w-20">Código</th>
              <th className="text-left px-3 py-3">Descripción</th>
              <th className="text-center px-3 py-3 w-16">Ud.</th>
              <th className="text-right px-3 py-3 w-32">Precio base €</th>
              <th className="text-left px-3 py-3 w-40">Notas</th>
              <th className="text-center px-3 py-3 w-14"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, idx) => {
              const isSaving = saving.has(item.id)
              const isSaved = saved.has(item.id)
              const isDirty = dirty.has(item.id)
              const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'
              return (
                <tr key={item.id} className={`${rowBg} hover:bg-blue-50 transition-colors border-b border-neutral-100`}>
                  <td className="px-3 py-1.5">
                    <span className="text-[10px] font-bold text-neutral-400">{item.chapter_code}</span>
                    <span className="text-[10px] text-neutral-500 block truncate max-w-[100px]">{item.chapter_name}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="text-[11px] text-neutral-500 truncate block max-w-[100px]">{item.subcategory || '—'}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="text-[11px] font-mono text-neutral-400">{item.code || '—'}</span>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateField(item.id, 'description', e.target.value)}
                      onBlur={() => handleBlur(item)}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(e) => updateField(item.id, 'unit', e.target.value)}
                      onBlur={() => handleBlur(item)}
                      className={inputCls + ' text-center w-14'}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => updateField(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      onBlur={() => handleBlur(item)}
                      className={inputCls + ' text-right font-bold text-primary w-28'}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={item.notes ?? ''}
                      onChange={(e) => updateField(item.id, 'notes', e.target.value)}
                      onBlur={() => handleBlur(item)}
                      className={inputCls + ' text-xs text-neutral-400'}
                    />
                  </td>
                  <td className="px-2 py-1 text-center w-14">
                    {isSaving && <span className="text-[10px] text-neutral-400">…</span>}
                    {isSaved && <span className="text-[10px] text-green-600 font-bold">✓</span>}
                    {isDirty && !isSaving && !isSaved && <span className="text-[10px] text-amber-500">●</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-neutral-300 text-sm">Sin resultados para esta búsqueda</div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ConfigView({ initial }: { initial: QualityCoefficient[] }) {
  const [tab, setTab] = useState<Tab>('coeficientes')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'coeficientes', label: 'Coeficientes de calidad' },
    { key: 'catalogo', label: 'Catálogo de precios' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide mb-4">Configuración</h1>
        <div className="flex border-b border-neutral-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'coeficientes' && <CoeficientesTab initial={initial} />}
      {tab === 'catalogo' && <CatalogTab />}
    </div>
  )
}
