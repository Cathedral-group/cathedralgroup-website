'use client'

/**
 * Componente genérico Cathedral admin para listar documentos tipados.
 *
 * Acepta una `TypedDocsConfig` que describe la tabla, columnas, filtros y KPIs.
 * Reusa el patrón visual de:
 *   · app/admin/proyectos/ProjectsView.tsx  → KPI cards
 *   · app/admin/revision/RevisionView.tsx   → review_status badge
 *   · app/admin/documentos/DocumentsView.tsx → drawer slide-out
 *
 * Trabaja con cualquier tabla Supabase que respete el esquema mínimo:
 *   - id UUID
 *   - company_id UUID
 *   - deleted_at TIMESTAMPTZ (soft delete)
 *   - created_at TIMESTAMPTZ
 *
 * CRUD vía /api/db/<table> (handler genérico ya existente).
 *
 * Paleta Cathedral:
 *   primary  #B4A898
 *   oscuro   #5A5550
 *   fondo    #D9D0C7
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { TypedDocsConfig, ColumnDef, KpiDef } from './TypedDocsConfig'
import { BADGE_COLORS_ESTADO, BADGE_COLORS_REVIEW } from './TypedDocsConfig'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formato
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(d)
  }
}

function formatEur(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatNumber(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('es-ES')
}

function badgeClass(value: string, override?: Record<string, string>): string {
  const merged = { ...BADGE_COLORS_ESTADO, ...BADGE_COLORS_REVIEW, ...(override ?? {}) }
  return merged[value] ?? 'bg-neutral-100 text-neutral-500'
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos generic row
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { id?: string; deleted_at?: string | null }

// ─────────────────────────────────────────────────────────────────────────────
// KpiCard (patrón coherente Cathedral)
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'amber' | 'red' | 'green'
}) {
  const accentCls =
    accent === 'red'
      ? 'text-red-600'
      : accent === 'amber'
      ? 'text-amber-600'
      : accent === 'green'
      ? 'text-emerald-600'
      : 'text-neutral-900'
  return (
    <div className="bg-white border border-neutral-100 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-lg font-medium mt-0.5 tabular-nums ${accentCls}`}>{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderCell(col: ColumnDef, row: Row): React.ReactNode {
  const v = row[col.key]
  if (v == null || v === '') return <span className="text-neutral-300">—</span>

  switch (col.type) {
    case 'date':
      return <span className="tabular-nums">{formatDate(String(v))}</span>
    case 'numeric':
      // Heurística: campos *_pct → con signo %, resto → EUR si label sugiere importe, si no número
      if (col.key.endsWith('_pct') || col.key.includes('porcentaje')) {
        return <span className="tabular-nums">{Number(v).toFixed(2)}%</span>
      }
      if (
        col.key.includes('importe') ||
        col.key.includes('prima') ||
        col.key.includes('honorarios') ||
        col.key.includes('valor_') ||
        col.key.includes('total') ||
        col.key.includes('fianza') ||
        col.key.includes('subtotal') ||
        col.key.includes('base_imponible') ||
        col.key.includes('retencion_') ||
        col.key.includes('capital_asegurado')
      ) {
        return <span className="tabular-nums">{formatEur(Number(v))}</span>
      }
      return <span className="tabular-nums">{formatNumber(Number(v))}</span>
    case 'boolean':
      return v ? (
        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700">
          Sí
        </span>
      ) : (
        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-500">
          No
        </span>
      )
    case 'badge': {
      const text = String(v)
      return (
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass(
            text,
            col.badgeColors
          )}`}
        >
          {text}
        </span>
      )
    }
    case 'select': {
      const opt = col.options?.find((o) => o.value === String(v))
      return <span className="text-sm">{opt?.label ?? String(v)}</span>
    }
    case 'textarea':
    case 'text':
    default:
      return <span className="text-sm">{String(v)}</span>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI compute
// ─────────────────────────────────────────────────────────────────────────────

function computeKpi(def: KpiDef, rows: Row[]): { value: string; accent?: 'amber' | 'red' | 'green' } {
  let raw = 0
  switch (def.compute) {
    case 'count':
      raw = rows.length
      break
    case 'count_filter':
      raw = rows.filter((r) => def.filter && r[def.filter.key] === def.filter.value).length
      break
    case 'sum':
      raw = rows.reduce((acc, r) => acc + (Number(r[def.field ?? '']) || 0), 0)
      break
    case 'sum_filter':
      raw = rows
        .filter((r) => def.filter && r[def.filter.key] === def.filter.value)
        .reduce((acc, r) => acc + (Number(r[def.field ?? '']) || 0), 0)
      break
  }
  const value = def.isMoney ? formatEur(raw) : formatNumber(raw)
  const accent = raw > 0 ? def.accent : undefined
  return { value, accent }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter eval
// ─────────────────────────────────────────────────────────────────────────────

interface FilterState {
  // key → { value: any, value2?: any } (value2 para range)
  [key: string]: { value: unknown; value2?: unknown } | undefined
}

function applyFilters(rows: Row[], filterState: FilterState, search: string, columns: ColumnDef[]): Row[] {
  return rows.filter((r) => {
    // Búsqueda libre sobre todas las columnas text-ish
    if (search) {
      const q = search.toLowerCase()
      const haystack = columns
        .filter((c) => c.type === 'text' || c.type === 'textarea' || c.type === 'select' || c.type === 'badge')
        .map((c) => String(r[c.key] ?? ''))
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    for (const [key, st] of Object.entries(filterState)) {
      if (!st || st.value == null || st.value === '') continue
      const cell = r[key]
      if (Array.isArray(st.value)) {
        // multi-select (no usado por ahora)
        if (!st.value.includes(cell)) return false
      } else if (st.value2 != null && st.value2 !== '') {
        // range (date_range / numeric_range)
        const num = typeof cell === 'number' ? cell : cell ? Number(cell) : null
        const a = typeof st.value === 'number' ? st.value : st.value ? Number(st.value) : null
        const b = typeof st.value2 === 'number' ? st.value2 : st.value2 ? Number(st.value2) : null
        if (num == null) return false
        if (a != null && num < a) return false
        if (b != null && num > b) return false
      } else if (typeof st.value === 'boolean') {
        if (Boolean(cell) !== st.value) return false
      } else {
        if (String(cell ?? '') !== String(st.value)) return false
      }
    }
    return true
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer detalle (lazy: solo renderiza cuando hay `selected` o `formNew`)
// ─────────────────────────────────────────────────────────────────────────────

function DetailDrawer({
  config,
  row,
  isNew,
  onClose,
  onSaved,
  onDeleted,
}: {
  config: TypedDocsConfig
  row: Row
  isNew: boolean
  onClose: () => void
  onSaved: (saved: Row) => void
  onDeleted: (id: string) => void
}) {
  const [form, setForm] = useState<Row>(() => ({ ...row }))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  const setF = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const method = isNew ? 'POST' : 'PATCH'
      const body = isNew ? form : { id: row.id, ...form }
      const res = await fetch(`/api/db/${config.table}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Error ${res.status}`)
      }
      const json = await res.json().catch(() => ({}))
      const saved: Row = (json.data as Row) ?? ({ ...form, id: row.id } as Row)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!row.id || !confirm('¿Mover a la papelera?')) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/db/${config.table}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      onDeleted(String(row.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white h-full overflow-y-auto shadow-xl pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 bg-white border-b border-neutral-100 p-6 flex justify-between items-center z-10">
          <h2 className="text-sm font-bold uppercase tracking-widest">
            {isNew ? `Nuevo ${config.newLabel ?? config.title}` : `Editar ${config.title}`}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl" aria-label="Cerrar">
            ×
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        <div className="p-6 space-y-4">
          {config.columns
            .filter((c) => !c.hideInForm)
            .map((col) => {
              const value = form[col.key]
              if (col.type === 'textarea') {
                return (
                  <div key={col.key}>
                    <label className={lbl}>
                      {col.label}
                      {col.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <textarea
                      value={(value as string) ?? ''}
                      onChange={(e) => setF(col.key, e.target.value || null)}
                      rows={3}
                      className={inp}
                      placeholder={col.placeholder}
                    />
                    {col.hint && <p className="text-[10px] text-neutral-400 mt-1">{col.hint}</p>}
                  </div>
                )
              }
              if (col.type === 'select' || col.type === 'badge') {
                return (
                  <div key={col.key}>
                    <label className={lbl}>
                      {col.label}
                      {col.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      value={(value as string) ?? ''}
                      onChange={(e) => setF(col.key, e.target.value || null)}
                      className={inp}
                    >
                      <option value="">—</option>
                      {col.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {col.hint && <p className="text-[10px] text-neutral-400 mt-1">{col.hint}</p>}
                  </div>
                )
              }
              if (col.type === 'boolean') {
                return (
                  <div key={col.key} className="flex items-center gap-3">
                    <input
                      id={`f-${col.key}`}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => setF(col.key, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <label htmlFor={`f-${col.key}`} className="text-sm">
                      {col.label}
                    </label>
                  </div>
                )
              }
              return (
                <div key={col.key}>
                  <label className={lbl}>
                    {col.label}
                    {col.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input
                    type={col.type === 'date' ? 'date' : col.type === 'numeric' ? 'number' : 'text'}
                    step={col.type === 'numeric' ? '0.01' : undefined}
                    value={value == null ? '' : String(value)}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (col.type === 'numeric') {
                        setF(col.key, raw === '' ? null : parseFloat(raw))
                      } else {
                        setF(col.key, raw === '' ? null : raw)
                      }
                    }}
                    className={inp}
                    placeholder={col.placeholder}
                  />
                  {col.hint && <p className="text-[10px] text-neutral-400 mt-1">{col.hint}</p>}
                </div>
              )
            })}

          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-neutral-900 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
            >
              {saving ? '...' : isNew ? 'Crear' : 'Guardar'}
            </button>
            {!isNew && row.id && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full border border-red-200 text-red-500 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
              >
                {deleting ? '...' : 'Mover a papelera'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  config: TypedDocsConfig
  initialData: Row[]
}

const PAGE_SIZE = 50

export default function TypedDocsView({ config, initialData }: Props) {
  const searchParams = useSearchParams()
  const [data, setData] = useState<Row[]>(initialData)
  const [search, setSearch] = useState('')
  const [filterState, setFilterState] = useState<FilterState>({})
  const [selected, setSelected] = useState<Row | null>(null)
  const [isNewOpen, setIsNewOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  // Deep-link `?id=<source_id>`: resaltar/scrollear (y abrir) esa fila al montar.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const deepLinkHandled = useRef(false)

  const visibleColumns = useMemo(() => config.columns.filter((c) => !c.hideInList), [config.columns])

  // ─── Aplicación de filtros + search ────────────────────────────────────────
  const filtered = useMemo(
    () => applyFilters(data, filterState, search, config.columns),
    [data, filterState, search, config.columns]
  )

  // ─── Paginación cursor (50 por página) ────────────────────────────────────
  const pageStart = (page - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const paged = filtered.slice(pageStart, pageEnd)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  // ─── Deep-link `?id=` → ir a la página de la fila, resaltarla y abrir detalle ─
  useEffect(() => {
    if (deepLinkHandled.current) return
    const wantedId = searchParams?.get('id')
    if (!wantedId) return
    const idx = filtered.findIndex((r) => String(r.id ?? '') === wantedId)
    if (idx < 0) return
    deepLinkHandled.current = true
    const targetPage = Math.floor(idx / PAGE_SIZE) + 1
    setPage(targetPage)
    setHighlightId(wantedId)
    const target = filtered[idx]
    if (target) setSelected(target)
    // Esperar al render de la página correcta para hacer scroll.
    const t = setTimeout(() => {
      rowRefs.current[wantedId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    // Quitar el resalte tras unos segundos.
    const t2 = setTimeout(() => setHighlightId(null), 3500)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
  }, [searchParams, filtered])

  // ─── KPI compute ──────────────────────────────────────────────────────────
  const kpiResults = useMemo(() => {
    return (config.kpis ?? []).slice(0, 4).map((k) => ({ def: k, ...computeKpi(k, data) }))
  }, [config.kpis, data])

  // ─── Handlers CRUD ────────────────────────────────────────────────────────
  const handleSaved = useCallback((saved: Row) => {
    setData((prev) => {
      const exists = prev.find((r) => r.id === saved.id)
      if (exists) return prev.map((r) => (r.id === saved.id ? saved : r))
      return [saved, ...prev]
    })
    setSelected(null)
    setIsNewOpen(false)
  }, [])

  const handleDeleted = useCallback((id: string) => {
    setData((prev) => prev.filter((r) => r.id !== id))
    setSelected(null)
  }, [])

  // ─── Filtros sidebar ──────────────────────────────────────────────────────
  const setFilter = (key: string, value: unknown, value2?: unknown) => {
    setFilterState((s) => ({ ...s, [key]: { value, value2 } }))
    setPage(1)
  }
  const clearFilter = (key: string) => {
    setFilterState((s) => {
      const copy = { ...s }
      delete copy[key]
      return copy
    })
  }

  // ─── Bulk select ──────────────────────────────────────────────────────────
  const toggleBulk = (id: string) => {
    setBulkSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const toggleBulkAll = () => {
    if (bulkSelected.size === paged.length) {
      setBulkSelected(new Set())
    } else {
      setBulkSelected(new Set(paged.map((r) => String(r.id ?? ''))))
    }
  }
  const handleBulkAction = (action: 'delete' | 'export') => {
    // Stub — UI completa pendiente
    // eslint-disable-next-line no-console
    console.log('[TypedDocsView] bulk action:', action, Array.from(bulkSelected))
    alert(`Pendiente: ${action} sobre ${bulkSelected.size} registros`)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-xl font-medium uppercase tracking-wide">
            {config.icon ? <span className="mr-2">{config.icon}</span> : null}
            {config.title}
          </h1>
          {config.subtitle && <p className="mt-1 text-sm text-neutral-500">{config.subtitle}</p>}
        </div>
        <button
          onClick={() => setIsNewOpen(true)}
          className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
        >
          + {config.newLabel ?? 'Nuevo'}
        </button>
      </div>

      {/* KPIs */}
      {kpiResults.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {kpiResults.map((k, i) => (
            <KpiCard key={i} label={k.def.label} value={k.value} hint={k.def.hint} accent={k.accent} />
          ))}
        </div>
      )}

      {/* Toolbar buscador */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Buscar..."
          className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-52"
        />
        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-amber-50 border border-amber-200 px-3 py-2">
            <span className="text-xs text-amber-700 font-medium">{bulkSelected.size} seleccionados</span>
            <button
              onClick={() => handleBulkAction('export')}
              className="text-[10px] font-bold uppercase tracking-widest text-neutral-700 hover:text-primary"
            >
              Exportar
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="text-[10px] font-bold uppercase tracking-widest text-red-600 hover:text-red-800"
            >
              Borrar
            </button>
            <button
              onClick={() => setBulkSelected(new Set())}
              className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar filtros */}
        {config.filters.length > 0 && (
          <aside className="lg:w-64 shrink-0 bg-white border border-neutral-100 p-4 space-y-4 self-start">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Filtros</h3>
            {config.filters.map((f) => {
              const st = filterState[f.key]
              if (f.type === 'select') {
                return (
                  <div key={f.key}>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-1">
                      {f.label}
                    </label>
                    <select
                      value={(st?.value as string) ?? ''}
                      onChange={(e) =>
                        e.target.value ? setFilter(f.key, e.target.value) : clearFilter(f.key)
                      }
                      className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
                    >
                      <option value="">Todos</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              }
              if (f.type === 'boolean') {
                return (
                  <div key={f.key}>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-1">
                      {f.label}
                    </label>
                    <select
                      value={
                        st?.value == null ? '' : st.value ? 'true' : 'false'
                      }
                      onChange={(e) => {
                        if (e.target.value === '') clearFilter(f.key)
                        else setFilter(f.key, e.target.value === 'true')
                      }}
                      className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
                    >
                      <option value="">Todos</option>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                )
              }
              if (f.type === 'date_range' || f.type === 'numeric_range') {
                const isDate = f.type === 'date_range'
                return (
                  <div key={f.key}>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-1">
                      {f.label}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type={isDate ? 'date' : 'number'}
                        value={(st?.value as string) ?? ''}
                        onChange={(e) => setFilter(f.key, e.target.value || null, st?.value2 ?? null)}
                        className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-xs"
                        placeholder="desde"
                      />
                      <input
                        type={isDate ? 'date' : 'number'}
                        value={(st?.value2 as string) ?? ''}
                        onChange={(e) => setFilter(f.key, st?.value ?? null, e.target.value || null)}
                        className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-xs"
                        placeholder="hasta"
                      />
                    </div>
                  </div>
                )
              }
              // text
              return (
                <div key={f.key}>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-1">
                    {f.label}
                  </label>
                  <input
                    type="text"
                    value={(st?.value as string) ?? ''}
                    onChange={(e) =>
                      e.target.value ? setFilter(f.key, e.target.value) : clearFilter(f.key)
                    }
                    className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
                  />
                </div>
              )
            })}
            {Object.keys(filterState).length > 0 && (
              <button
                onClick={() => setFilterState({})}
                className="w-full text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 pt-2 border-t border-neutral-100"
              >
                Limpiar filtros
              </button>
            )}
          </aside>
        )}

        {/* Tabla */}
        <div className="flex-1 min-w-0 bg-white border border-neutral-100 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={bulkSelected.size === paged.length && paged.length > 0}
                    onChange={toggleBulkAll}
                    className="h-3.5 w-3.5"
                    aria-label="Seleccionar todos"
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 ${
                      col.width ?? ''
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  Documento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="px-6 py-8 text-center text-sm text-neutral-400">
                    {config.emptyMessage ?? 'Sin registros'}
                  </td>
                </tr>
              ) : (
                paged.map((row) => {
                  const id = String(row.id ?? '')
                  const checked = bulkSelected.has(id)
                  const isHighlighted = highlightId != null && id === highlightId
                  return (
                    <tr
                      key={id || Math.random()}
                      ref={(el) => {
                        if (id) rowRefs.current[id] = el
                      }}
                      onClick={() => setSelected(row)}
                      className={`cursor-pointer hover:bg-neutral-50 transition-colors ${
                        isHighlighted
                          ? 'bg-amber-100 ring-2 ring-inset ring-amber-400'
                          : checked
                          ? 'bg-amber-50/30'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulk(id)}
                          className="h-3.5 w-3.5"
                          aria-label="Seleccionar fila"
                        />
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col.key} className="px-3 py-2.5 text-sm">
                          {renderCell(col, row)}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {(row.storage_path || row.drive_url) ? (
                          <a
                            href={`/api/admin/documentos/file?table=${encodeURIComponent(config.table)}&id=${encodeURIComponent(id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Ver ↗
                          </a>
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-neutral-100 bg-neutral-50/50">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Página {page} de {totalPages} ({filtered.length} registros)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹ Anterior
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drawer detalle (lazy render) */}
      {selected && (
        <DetailDrawer
          config={config}
          row={selected}
          isNew={false}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
      {isNewOpen && (
        <DetailDrawer
          config={config}
          row={{} as Row}
          isNew
          onClose={() => setIsNewOpen(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
