'use client'

/**
 * DocumentsHubView — Hub central de TODOS los documentos Cathedral
 *
 * Source: matview `public.documents_registry` (15 fuentes: invoices, payrolls,
 * contratos, seguros, escrituras, licencias, modelos_fiscales,
 * justificantes_pago, etc).
 *
 * Contract:
 *   - Recibe `initialData: DocumentsHubInitialData` desde `./page.tsx` (server).
 *     Forma: { activeCompanyId, firstPage, pageSize, facets, filters, kpis }.
 *   - Pagina vía /api/documentos/registry-list (cursor pagination).
 *
 * Patrón coherente Cathedral:
 *   - 5 KPI cards arriba (servidor-side, hidratados desde initialData.kpis)
 *   - Sidebar filtros izquierda sticky (NO tabs horizontales)
 *   - Quick chips arriba de la tabla
 *   - Tabla densa con checkbox selección bulk
 *   - Drawer detalle slide-out (deep-link `?doc=<source_table>:<source_id>`)
 *   - URL state sync via useSearchParams/useRouter
 *
 * Reusa patrones existentes:
 *   - KpiCard idéntico a app/admin/proyectos/ProjectsView.tsx:217
 *   - ReviewBadge dot color (amber/blue/green/red/red-dark)
 *   - Slide-out drawer pattern de DocumentsView.tsx:454-603
 *   - formatEur/formatDate idénticos a toda la base admin
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DocumentsHubInitialData } from './page'

/* ─────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────────────────────────── */

export interface DocumentRow {
  source_table: string
  source_id: string
  company_id: string
  project_id: string | null
  property_id: string | null
  doc_type: string
  fecha_relevante: string | null
  importe_principal: number | null
  contraparte_principal: string | null
  contraparte_nif: string | null
  file_hash: string | null
  ai_confidence: number | null
  review_status: string
  created_at: string
  deleted_at: string | null
  original_filename: string | null
  drive_url: string | null
}

export interface SavedView {
  id: string
  name: string
  filters: Filters
  created_at: string
}

export interface Filters {
  q: string
  docTypes: string[]
  projectId: string | null
  esGastoGeneral: boolean   // project_id IS NULL
  propertyId: string | null
  contraparte: string
  fechaDesde: string | null
  fechaHasta: string | null
  importeMin: number | null
  importeMax: number | null
  reviewStatuses: string[]
  vencimientoDias: number | null   // 30 | 60 | 90 | null
  mostrarBorrados: boolean
  quickFilter: 'todos' | 'facturas' | 'contratos' | 'seguros' | 'fiscal' | 'otros'
}

interface DocumentsHubViewProps {
  initialData: DocumentsHubInitialData
  /** Server-loaded saved views (opcional — endpoint puede no estar todavía). */
  savedViews?: SavedView[]
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CONSTANTES — taxonomía documentos
 * ───────────────────────────────────────────────────────────────────────────── */

type DocTypeMeta = {
  value: string
  label: string
  group: 'facturas' | 'contratos' | 'seguros' | 'fiscal' | 'otros'
  bg: string
  fg: string
  icon: string
}

const DOC_TYPES: DocTypeMeta[] = [
  { value: 'factura',            label: 'Factura',       group: 'facturas',  bg: 'bg-emerald-100', fg: 'text-emerald-700', icon: 'FA' },
  { value: 'rectificativa',      label: 'Rectificativa', group: 'facturas',  bg: 'bg-amber-100',   fg: 'text-amber-700',   icon: 'RE' },
  { value: 'abono',              label: 'Abono',         group: 'facturas',  bg: 'bg-rose-100',    fg: 'text-rose-700',    icon: 'AB' },
  { value: 'proforma',           label: 'Proforma',      group: 'facturas',  bg: 'bg-slate-100',   fg: 'text-slate-700',   icon: 'PF' },
  { value: 'ticket',             label: 'Ticket',        group: 'facturas',  bg: 'bg-lime-100',    fg: 'text-lime-700',    icon: 'TK' },
  { value: 'nomina',             label: 'Nómina',        group: 'otros',     bg: 'bg-indigo-100',  fg: 'text-indigo-700',  icon: 'NM' },
  { value: 'contrato',           label: 'Contrato',      group: 'contratos', bg: 'bg-blue-100',    fg: 'text-blue-700',    icon: 'CT' },
  { value: 'nota_simple',        label: 'Nota simple',   group: 'contratos', bg: 'bg-cyan-100',    fg: 'text-cyan-700',    icon: 'NS' },
  { value: 'escritura',          label: 'Escritura',     group: 'contratos', bg: 'bg-violet-100',  fg: 'text-violet-700',  icon: 'ES' },
  { value: 'licencia',           label: 'Licencia',      group: 'otros',     bg: 'bg-yellow-100',  fg: 'text-yellow-700',  icon: 'LC' },
  { value: 'certificacion_obra', label: 'Cert. obra',    group: 'otros',     bg: 'bg-fuchsia-100', fg: 'text-fuchsia-700', icon: 'CO' },
  { value: 'certificado',        label: 'Certificado',   group: 'otros',     bg: 'bg-pink-100',    fg: 'text-pink-700',    icon: 'CF' },
  { value: 'informe',            label: 'Informe',       group: 'otros',     bg: 'bg-neutral-100', fg: 'text-neutral-700', icon: 'IN' },
  { value: 'seguro',             label: 'Seguro',        group: 'seguros',   bg: 'bg-teal-100',    fg: 'text-teal-700',    icon: 'SG' },
  { value: 'modelo_fiscal',      label: 'Modelo fiscal', group: 'fiscal',    bg: 'bg-red-100',     fg: 'text-red-700',     icon: 'MF' },
  { value: 'justificante_pago',  label: 'Justif. pago',  group: 'facturas',  bg: 'bg-green-100',   fg: 'text-green-700',   icon: 'JP' },
  { value: 'albaran',            label: 'Albarán',       group: 'facturas',  bg: 'bg-stone-100',   fg: 'text-stone-700',   icon: 'AL' },
  { value: 'presupuesto',        label: 'Presupuesto',   group: 'facturas',  bg: 'bg-orange-100',  fg: 'text-orange-700',  icon: 'PR' },
  { value: 'otro',               label: 'Otro',          group: 'otros',     bg: 'bg-neutral-50',  fg: 'text-neutral-500', icon: '··' },
]

const DOC_TYPE_MAP: Record<string, DocTypeMeta> = Object.fromEntries(
  DOC_TYPES.map((t) => [t.value, t])
)

const REVIEW_STATUSES: { value: string; label: string; dot: string; bg: string; fg: string }[] = [
  { value: 'pendiente',  label: 'Pendiente',  dot: 'bg-amber-500', bg: 'bg-amber-100', fg: 'text-amber-700' },
  { value: 'revisado',   label: 'Revisado',   dot: 'bg-blue-500',  bg: 'bg-blue-100',  fg: 'text-blue-700' },
  { value: 'confirmado', label: 'Confirmado', dot: 'bg-green-500', bg: 'bg-green-100', fg: 'text-green-700' },
  { value: 'rechazado',  label: 'Rechazado',  dot: 'bg-red-500',   bg: 'bg-red-100',   fg: 'text-red-700' },
  { value: 'error',      label: 'Error',      dot: 'bg-red-700',   bg: 'bg-red-100',   fg: 'text-red-800' },
]

const REVIEW_STATUS_MAP: Record<string, typeof REVIEW_STATUSES[number]> = Object.fromEntries(
  REVIEW_STATUSES.map((s) => [s.value, s])
)

const QUICK_FILTERS: { value: Filters['quickFilter']; label: string }[] = [
  { value: 'todos',     label: 'Todos' },
  { value: 'facturas',  label: 'Facturas' },
  { value: 'contratos', label: 'Contratos' },
  { value: 'seguros',   label: 'Seguros' },
  { value: 'fiscal',    label: 'Fiscal' },
  { value: 'otros',     label: 'Otros' },
]

const TIPOS_GASTO = new Set(['factura', 'rectificativa', 'abono', 'ticket', 'nomina', 'justificante_pago'])

/* ─────────────────────────────────────────────────────────────────────────────
 * UTILIDADES
 * ───────────────────────────────────────────────────────────────────────────── */

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d)
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function quarterRange(q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const year = new Date().getFullYear()
  const m0 = (q - 1) * 3
  const from = new Date(year, m0, 1).toISOString().slice(0, 10)
  const to = new Date(year, m0 + 3, 0).toISOString().slice(0, 10)
  return { from, to }
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  docTypes: [],
  projectId: null,
  esGastoGeneral: false,
  propertyId: null,
  contraparte: '',
  fechaDesde: null,
  fechaHasta: null,
  importeMin: null,
  importeMax: null,
  reviewStatuses: [],
  vencimientoDias: null,
  mostrarBorrados: false,
  quickFilter: 'todos',
}

/* ─────────────────────────────────────────────────────────────────────────────
 * BADGES
 * ───────────────────────────────────────────────────────────────────────────── */

function DocTypeBadge({ docType }: { docType: string }) {
  const t = DOC_TYPE_MAP[docType] ?? DOC_TYPE_MAP['otro']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.bg} ${t.fg}`}>
      <span className="font-mono text-[9px] opacity-70">{t.icon}</span>
      {t.label}
    </span>
  )
}

function ReviewBadge({ status }: { status: string }) {
  const s = REVIEW_STATUS_MAP[status]
  if (!s) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" /> {status || '—'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function ProjectBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-[10px] uppercase tracking-wider text-neutral-300">Gasto gral.</span>
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
      {code}
    </span>
  )
}

function KpiCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: 'amber' | 'red' | 'green' }) {
  const accentCls =
    accent === 'red' ? 'text-red-600' :
    accent === 'amber' ? 'text-amber-600' :
    accent === 'green' ? 'text-green-700' :
    'text-neutral-900'
  return (
    <div className="bg-white border border-neutral-100 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-lg font-medium mt-0.5 ${accentCls}`}>{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5 truncate" title={hint}>{hint}</p>}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * URL SYNC
 * ───────────────────────────────────────────────────────────────────────────── */

function filtersFromUrl(params: URLSearchParams): Filters {
  return {
    ...DEFAULT_FILTERS,
    q: params.get('q') ?? '',
    docTypes: params.get('types')?.split(',').filter(Boolean) ?? [],
    projectId: params.get('project') || null,
    esGastoGeneral: params.get('general') === '1',
    propertyId: params.get('property') || null,
    contraparte: params.get('party') ?? '',
    fechaDesde: params.get('from') || null,
    fechaHasta: params.get('to') || null,
    importeMin: params.get('min') ? parseFloat(params.get('min')!) : null,
    importeMax: params.get('max') ? parseFloat(params.get('max')!) : null,
    reviewStatuses: params.get('status')?.split(',').filter(Boolean) ?? [],
    vencimientoDias: params.get('venc') ? parseInt(params.get('venc')!, 10) : null,
    mostrarBorrados: params.get('papelera') === '1',
    quickFilter: (params.get('tab') as Filters['quickFilter']) ?? 'todos',
  }
}

function filtersToUrl(f: Filters): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.docTypes.length) p.set('types', f.docTypes.join(','))
  if (f.projectId) p.set('project', f.projectId)
  if (f.esGastoGeneral) p.set('general', '1')
  if (f.propertyId) p.set('property', f.propertyId)
  if (f.contraparte) p.set('party', f.contraparte)
  if (f.fechaDesde) p.set('from', f.fechaDesde)
  if (f.fechaHasta) p.set('to', f.fechaHasta)
  if (f.importeMin != null) p.set('min', String(f.importeMin))
  if (f.importeMax != null) p.set('max', String(f.importeMax))
  if (f.reviewStatuses.length) p.set('status', f.reviewStatuses.join(','))
  if (f.vencimientoDias) p.set('venc', String(f.vencimientoDias))
  if (f.mostrarBorrados) p.set('papelera', '1')
  if (f.quickFilter !== 'todos') p.set('tab', f.quickFilter)
  return p.toString()
}

/* Construye query string para /api/documentos/registry-list */
function filtersToApi(f: Filters, cursor: string | null): string {
  const p = new URLSearchParams()

  // Quick filter expande a doc_types del grupo (si no hay docTypes explícitos)
  let docTypesEffective = f.docTypes
  if (f.quickFilter !== 'todos') {
    const groupTypes = DOC_TYPES.filter((t) => t.group === f.quickFilter).map((t) => t.value)
    docTypesEffective = f.docTypes.length
      ? f.docTypes.filter((t) => groupTypes.includes(t))
      : groupTypes
  }
  if (docTypesEffective.length) p.set('doc_type', docTypesEffective.join(','))

  if (f.projectId) {
    p.set('project_id', f.projectId)
  } else if (f.esGastoGeneral) {
    // Server-side filter: project_id IS NULL (paginación exacta)
    p.set('project_filter', 'without')
  }
  if (f.propertyId) p.set('property_id', f.propertyId)
  if (f.reviewStatuses.length) p.set('review_status', f.reviewStatuses.join(','))
  if (f.fechaDesde) p.set('from', f.fechaDesde)
  if (f.fechaHasta) p.set('to', f.fechaHasta)
  if (f.importeMin != null) p.set('min_amount', String(f.importeMin))
  if (f.importeMax != null) p.set('max_amount', String(f.importeMax))
  if (f.vencimientoDias) p.set('vencimiento_dias', String(f.vencimientoDias))
  if (f.q) p.set('search', f.q)
  if (f.contraparte && !f.q) p.set('search', f.contraparte)
  if (f.mostrarBorrados) p.set('include_deleted', 'true')
  if (cursor) p.set('cursor', cursor)
  return p.toString()
}

/* ─────────────────────────────────────────────────────────────────────────────
 * COMPONENTE PRINCIPAL
 * ───────────────────────────────────────────────────────────────────────────── */

export default function DocumentsHubView({
  initialData,
  savedViews: initialSavedViews = [],
}: DocumentsHubViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const companyId = initialData.activeCompanyId
  const projects = initialData.filters.projects
  const properties = initialData.filters.properties
  const topContrapartes = initialData.filters.topContrapartes
  const facetDocType = initialData.facets.doc_type
  const facetReview = initialData.facets.review_status
  const kpiTotal = initialData.kpis.total
  const kpiPendientes = initialData.kpis.pendientes
  const kpiImporteMes = initialData.kpis.importeMes

  /* State */
  const [rows, setRows] = useState<DocumentRow[]>(() => (initialData.firstPage ?? []) as unknown as DocumentRow[])
  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromUrl(new URLSearchParams(searchParams?.toString() ?? ''))
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeDocKey, setActiveDocKey] = useState<string | null>(searchParams?.get('doc') ?? null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState((initialData.firstPage?.length ?? 0) >= initialData.pageSize)
  const [loadingMore, setLoadingMore] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedView[]>(initialSavedViews)
  const [savedViewsOpen, setSavedViewsOpen] = useState(false)
  const [filteredTotal, setFilteredTotal] = useState<number | null>(null)

  /* Debounced search input */
  const [searchInput, setSearchInput] = useState(filters.q)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Virtualization: ref al contenedor scroll de la tabla */
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setFilters((f) => (f.q === searchInput ? f : { ...f, q: searchInput }))
    }, 350)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchInput])

  /* Sync URL when filters change */
  useEffect(() => {
    const qs = filtersToUrl(filters)
    const docPart = activeDocKey ? `${qs ? '&' : ''}doc=${activeDocKey}` : ''
    const full = qs + docPart
    const url = full ? `?${full}` : window.location.pathname
    router.replace(url, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeDocKey])

  /* ─── Detect "primera carga sin filtros" para no refetch innecesario ─── */
  const isInitialFilters = useMemo(() => {
    return JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS) && !searchParams?.toString()
  }, [filters, searchParams])

  /* ─── Fetch al cambiar filtros ─── */
  useEffect(() => {
    if (isInitialFilters) return  // ya hidratado server-side
    let cancelled = false
    const fetchPage = async () => {
      try {
        const qs = filtersToApi(filters, null)
        const res = await fetch(`/api/documentos/registry-list?${qs}`, {
          headers: { 'X-Active-Company-Id': companyId },
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = await res.json()
        const data: DocumentRow[] = json.data ?? []
        if (!cancelled) {
          // Filtros project_filter=without y vencimiento_dias se aplican server-side
          // → paginación exacta (no se filtran rows post-fetch).
          setRows(data)
          setNextCursor(json.next_cursor ?? null)
          setHasMore(!!json.next_cursor)
          setFilteredTotal(typeof json.total_count === 'number' ? json.total_count : null)
        }
      } catch (err) {
        console.error('[DocumentsHubView] fetch error', err)
      }
    }
    fetchPage()
    return () => {
      cancelled = true
    }
  }, [filters, companyId, isInitialFilters])

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const qs = filtersToApi(filters, nextCursor)
      const res = await fetch(`/api/documentos/registry-list?${qs}`, {
        headers: { 'X-Active-Company-Id': companyId },
        cache: 'no-store',
      })
      if (res.ok) {
        const json = await res.json()
        const data: DocumentRow[] = json.data ?? []
        setRows((prev) => [...prev, ...data])
        setNextCursor(json.next_cursor ?? null)
        setHasMore(!!json.next_cursor)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  /* ─── KPIs (4 server-side + 2 client-side derivados) ─── */
  const kpis = useMemo(() => {
    /* Tipo más frecuente: usa facets server-side (más fiel que la página actual) */
    let tipoTopValue: string | null = null
    let tipoTopCount = 0
    for (const [k, v] of Object.entries(facetDocType)) {
      if (v > tipoTopCount) {
        tipoTopValue = k
        tipoTopCount = v
      }
    }
    const tipoTopLabel = tipoTopValue ? DOC_TYPE_MAP[tipoTopValue]?.label ?? tipoTopValue : '—'

    /* Contraparte top mes: usa los registros actualmente cargados como aproximación */
    const monthStart = initialData.kpis.monthStartIso
    const partyAccum = new Map<string, { name: string; sum: number; count: number }>()
    for (const r of rows) {
      if (!r.fecha_relevante || r.fecha_relevante < monthStart) continue
      const key = r.contraparte_nif || r.contraparte_principal
      if (!key) continue
      const prev = partyAccum.get(key) ?? { name: r.contraparte_principal ?? key, sum: 0, count: 0 }
      prev.sum += r.importe_principal ?? 0
      prev.count += 1
      partyAccum.set(key, prev)
    }
    const partyTop = Array.from(partyAccum.values()).sort((a, b) => b.sum - a.sum)[0]

    return {
      total: kpiTotal,
      pendientes: kpiPendientes,
      gastoMes: kpiImporteMes,
      tipoTopLabel,
      tipoTopCount,
      partyTopName: partyTop?.name ?? (topContrapartes[0]?.name ?? '—'),
      partyTopSum: partyTop?.sum ?? 0,
    }
  }, [rows, facetDocType, kpiTotal, kpiPendientes, kpiImporteMes, initialData.kpis.monthStartIso, topContrapartes])

  /* ─── Filtros helpers ─── */
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [k]: v }))
  }
  const toggleDocType = (v: string) => {
    setFilters((prev) => ({
      ...prev,
      docTypes: prev.docTypes.includes(v) ? prev.docTypes.filter((t) => t !== v) : [...prev.docTypes, v],
    }))
  }
  const toggleReviewStatus = (v: string) => {
    setFilters((prev) => ({
      ...prev,
      reviewStatuses: prev.reviewStatuses.includes(v)
        ? prev.reviewStatuses.filter((s) => s !== v)
        : [...prev.reviewStatuses, v],
    }))
  }
  const applyDatePreset = (preset: 'hoy' | '7d' | '30d' | 'q1' | 'q2' | 'q3' | 'q4' | 'clear') => {
    if (preset === 'clear') {
      setFilters((f) => ({ ...f, fechaDesde: null, fechaHasta: null }))
      return
    }
    if (preset === 'hoy') {
      const today = new Date().toISOString().slice(0, 10)
      setFilters((f) => ({ ...f, fechaDesde: today, fechaHasta: today }))
      return
    }
    if (preset === '7d') {
      setFilters((f) => ({ ...f, fechaDesde: isoDaysAgo(7), fechaHasta: null }))
      return
    }
    if (preset === '30d') {
      setFilters((f) => ({ ...f, fechaDesde: isoDaysAgo(30), fechaHasta: null }))
      return
    }
    const q = preset === 'q1' ? 1 : preset === 'q2' ? 2 : preset === 'q3' ? 3 : 4
    const r = quarterRange(q)
    setFilters((f) => ({ ...f, fechaDesde: r.from, fechaHasta: r.to }))
  }
  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS)
    setSearchInput('')
  }

  /* ─── Selección bulk ─── */
  const rowKey = (r: DocumentRow) => `${r.source_table}:${r.source_id}`
  const visibleKeys = rows.map(rowKey)
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedIds.has(k))

  const toggleSelected = (k: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleKeys))
  }
  const clearSelection = () => setSelectedIds(new Set())

  /* ─── Bulk actions (stub endpoint /api/documentos/bulk) ─── */
  const handleBulkAction = async (action: 'reclassify' | 'set-party' | 'confirm' | 'trash') => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    let body: Record<string, unknown> = { ids, action }

    if (action === 'reclassify') {
      const project = window.prompt('Mover a proyecto (código o "general" para sin proyecto):')
      if (project == null) return
      body = { ids, action, project }
    } else if (action === 'set-party') {
      const party = window.prompt('Contraparte (nombre o NIF):')
      if (party == null) return
      body = { ids, action, party }
    } else if (action === 'confirm') {
      if (!window.confirm(`¿Confirmar ${ids.length} documento(s) como revisado(s)?`)) return
    } else if (action === 'trash') {
      if (!window.confirm(`¿Mover ${ids.length} documento(s) a la papelera?`)) return
    }

    try {
      const res = await fetch('/api/documentos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Active-Company-Id': companyId },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Error ${res.status}`)
      }
      clearSelection()
      // Forzar refetch
      setFilters((f) => ({ ...f }))
    } catch (err) {
      alert('Error en acción masiva: ' + (err instanceof Error ? err.message : 'desconocido'))
    }
  }

  /* ─── Saved views (stub endpoint /api/documentos/saved-views) ─── */
  const saveCurrentView = async () => {
    const name = window.prompt('Nombre de la vista guardada:')
    if (!name) return
    try {
      const res = await fetch('/api/documentos/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters }),
      })
      if (res.ok) {
        const json = await res.json()
        const sv: SavedView = json.data ?? json
        setSavedViews((prev) => [sv, ...prev])
      }
    } catch (err) {
      console.error('[DocumentsHubView] saveCurrentView', err)
    }
  }
  const loadSavedView = (sv: SavedView) => {
    setFilters({ ...DEFAULT_FILTERS, ...sv.filters })
    setSearchInput(sv.filters.q ?? '')
    setSavedViewsOpen(false)
  }
  const deleteSavedView = async (sv: SavedView) => {
    if (!window.confirm(`¿Eliminar vista "${sv.name}"?`)) return
    try {
      await fetch(`/api/documentos/saved-views?id=${sv.id}`, { method: 'DELETE' })
      setSavedViews((prev) => prev.filter((v) => v.id !== sv.id))
    } catch (err) {
      console.error('[DocumentsHubView] deleteSavedView', err)
    }
  }

  /* ─── Drawer detalle ─── */
  const activeDoc = useMemo(() => {
    if (!activeDocKey) return null
    return rows.find((r) => rowKey(r) === activeDocKey) ?? null
  }, [activeDocKey, rows])

  /* Lookup project code para badge */
  const projectCodeById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.id, p.code)
    return m
  }, [projects])

  /* Cuenta filtros activos */
  const activeFiltersCount = useMemo(() => {
    let c = 0
    if (filters.q) c++
    if (filters.docTypes.length) c++
    if (filters.projectId) c++
    if (filters.esGastoGeneral) c++
    if (filters.propertyId) c++
    if (filters.contraparte) c++
    if (filters.fechaDesde || filters.fechaHasta) c++
    if (filters.importeMin != null || filters.importeMax != null) c++
    if (filters.reviewStatuses.length) c++
    if (filters.vencimientoDias) c++
    if (filters.mostrarBorrados) c++
    if (filters.quickFilter !== 'todos') c++
    return c
  }, [filters])

  /* Mapa source_table → ruta canónica de edición */
  const sourceTableRoute = (r: DocumentRow): string => {
    const m: Record<string, string> = {
      invoices: `/admin/facturas?id=${r.source_id}`,
      payrolls: `/admin/personal/nominas?id=${r.source_id}`,
      contratos: `/admin/documentos/contratos?id=${r.source_id}`,
      escrituras: `/admin/documentos/escrituras?id=${r.source_id}`,
      seguros: `/admin/documentos/seguros?id=${r.source_id}`,
      licencias: `/admin/documentos/licencias?id=${r.source_id}`,
      modelos_fiscales: `/admin/fiscal?id=${r.source_id}`,
      justificantes_pago: `/admin/facturas?id=${r.source_id}`,
    }
    return m[r.source_table] ?? `/admin/documentos/${r.source_table}/${r.source_id}`
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * RENDER
   * ───────────────────────────────────────────────────────────────────────── */

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm'

  return (
    <div>
      {/* Header secundario con saved views (el h1 vive en page.tsx) */}
      <div className="flex items-center justify-end mb-3">
        <div className="relative">
          <button
            onClick={() => setSavedViewsOpen((v) => !v)}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border border-neutral-200 bg-white hover:border-neutral-400 transition-colors"
          >
            Vistas {savedViews.length > 0 ? `(${savedViews.length})` : ''} ▾
          </button>
          {savedViewsOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-neutral-200 shadow-lg w-72">
              <div className="px-3 py-2 border-b border-neutral-100">
                <button
                  onClick={saveCurrentView}
                  className="w-full text-left text-[10px] font-bold uppercase tracking-widest text-primary hover:text-neutral-900 py-1.5"
                >
                  + Guardar vista actual
                </button>
              </div>
              {savedViews.length === 0 ? (
                <p className="px-3 py-3 text-xs text-neutral-400">Sin vistas guardadas</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {savedViews.map((sv) => (
                    <li key={sv.id} className="flex items-center justify-between px-3 py-2 hover:bg-neutral-50">
                      <button onClick={() => loadSavedView(sv)} className="text-sm text-neutral-700 flex-1 text-left truncate">
                        {sv.name}
                      </button>
                      <button
                        onClick={() => deleteSavedView(sv)}
                        className="text-neutral-300 hover:text-red-500 ml-2 text-sm"
                        title="Eliminar vista"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── 5 KPI cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Total documentos" value={String(kpis.total)} />
        <KpiCard
          label="Pendientes revisar"
          value={String(kpis.pendientes)}
          accent={kpis.pendientes > 0 ? 'amber' : undefined}
        />
        <KpiCard label="Gasto mes actual" value={formatEur(kpis.gastoMes)} />
        <KpiCard
          label="Tipo más frecuente"
          value={kpis.tipoTopLabel}
          hint={`${kpis.tipoTopCount} doc${kpis.tipoTopCount === 1 ? '' : 's'}`}
        />
        <KpiCard label="Contraparte top mes" value={kpis.partyTopName || '—'} hint={formatEur(kpis.partyTopSum)} />
      </div>

      {/* ─── Layout sidebar izquierda + main ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
        {/* ──────────── SIDEBAR FILTROS ──────────── */}
        <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto bg-white border border-neutral-100 p-4 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">
              Filtros {activeFiltersCount > 0 && <span className="text-primary">({activeFiltersCount})</span>}
            </p>
            {activeFiltersCount > 0 && (
              <button onClick={clearAllFilters} className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-red-500">
                Limpiar
              </button>
            )}
          </div>

          {/* Tipo (chips facets — usa counts server-side de facetDocType) */}
          <div>
            <p className={lbl}>Tipo de documento</p>
            <div className="flex flex-wrap gap-1">
              {DOC_TYPES.map((t) => {
                const active = filters.docTypes.includes(t.value)
                const count = facetDocType[t.value] ?? 0
                if (count === 0 && !active) return null
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleDocType(t.value)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      active ? `${t.bg} ${t.fg} ring-1 ring-current` : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    {t.label}
                    <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Proyecto */}
          <div>
            <p className={lbl}>Proyecto</p>
            <select
              value={filters.esGastoGeneral ? '__general__' : (filters.projectId ?? '')}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__general__') {
                  setFilters((f) => ({ ...f, projectId: null, esGastoGeneral: true }))
                } else {
                  setFilters((f) => ({ ...f, projectId: v || null, esGastoGeneral: false }))
                }
              }}
              className={inp}
            >
              <option value="">Todos</option>
              <option value="__general__">Gasto general (sin proyecto)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>

          {/* Propiedad */}
          {properties.length > 0 && (
            <div>
              <p className={lbl}>Propiedad</p>
              <select
                value={filters.propertyId ?? ''}
                onChange={(e) => setF('propertyId', e.target.value || null)}
                className={inp}
              >
                <option value="">Todas</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo ?? p.descripcion ?? p.direccion ?? p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Contraparte */}
          <div>
            <p className={lbl}>Contraparte</p>
            <input
              type="search"
              value={filters.contraparte}
              onChange={(e) => setF('contraparte', e.target.value)}
              placeholder="Proveedor, cliente, NIF..."
              className={inp}
              list="party-suggestions"
            />
            <datalist id="party-suggestions">
              {topContrapartes.map((c) => (
                <option key={c.nif ?? c.name} value={c.name} />
              ))}
            </datalist>
          </div>

          {/* Rango fecha */}
          <div>
            <p className={lbl}>Rango fecha</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {(['hoy', '7d', '30d', 'q1', 'q2', 'q3', 'q4'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => applyDatePreset(p)}
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-neutral-50 text-neutral-500 hover:bg-neutral-100"
                >
                  {p === '7d' || p === '30d' ? p : p.toUpperCase()}
                </button>
              ))}
              {(filters.fechaDesde || filters.fechaHasta) && (
                <button
                  onClick={() => applyDatePreset('clear')}
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 text-red-500 hover:bg-red-50"
                >
                  ×
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.fechaDesde ?? ''}
                onChange={(e) => setF('fechaDesde', e.target.value || null)}
                className={inp}
              />
              <input
                type="date"
                value={filters.fechaHasta ?? ''}
                onChange={(e) => setF('fechaHasta', e.target.value || null)}
                className={inp}
              />
            </div>
          </div>

          {/* Rango importe */}
          <div>
            <p className={lbl}>Rango importe (€)</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Min"
                value={filters.importeMin ?? ''}
                onChange={(e) => setF('importeMin', e.target.value ? parseFloat(e.target.value) : null)}
                className={inp}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Max"
                value={filters.importeMax ?? ''}
                onChange={(e) => setF('importeMax', e.target.value ? parseFloat(e.target.value) : null)}
                className={inp}
              />
            </div>
          </div>

          {/* Estado revisión (chips con count facet) */}
          <div>
            <p className={lbl}>Estado revisión</p>
            <div className="flex flex-wrap gap-1">
              {REVIEW_STATUSES.map((s) => {
                const active = filters.reviewStatuses.includes(s.value)
                const count = facetReview[s.value] ?? 0
                return (
                  <button
                    key={s.value}
                    onClick={() => toggleReviewStatus(s.value)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      active ? `${s.bg} ${s.fg} ring-1 ring-current` : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                    {count > 0 && <span className="opacity-60">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Vencimiento próximo */}
          <div>
            <p className={lbl}>Vencimiento próximo</p>
            <div className="flex flex-wrap gap-1">
              {[30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setF('vencimientoDias', filters.vencimientoDias === d ? null : d)}
                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 ${
                    filters.vencimientoDias === d
                      ? 'bg-amber-100 text-amber-700 ring-1 ring-current'
                      : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                  }`}
                >
                  ≤{d}d
                </button>
              ))}
            </div>
          </div>

          {/* Papelera */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.mostrarBorrados}
              onChange={(e) => setF('mostrarBorrados', e.target.checked)}
              className="accent-primary"
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
              Mostrar borrados (papelera)
            </span>
          </label>
        </aside>

        {/* ──────────── MAIN ──────────── */}
        <section className="space-y-4">
          {/* Quick filters horizontales + búsqueda */}
          <div className="flex items-center gap-2 flex-wrap">
            {QUICK_FILTERS.map((qf) => (
              <button
                key={qf.value}
                onClick={() => setF('quickFilter', qf.value)}
                className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ${
                  filters.quickFilter === qf.value
                    ? 'bg-neutral-900 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {qf.label}
              </button>
            ))}
            <div className="ml-auto w-full sm:w-auto">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar filename, número, contraparte..."
                className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-full sm:w-80"
              />
            </div>
          </div>

          {filteredTotal != null && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {filteredTotal.toLocaleString('es-ES')} documento{filteredTotal === 1 ? '' : 's'} con filtros aplicados
            </p>
          )}

          {/* Tabla densa (virtualizada cuando rows > 100) */}
          <DocumentsTable
            rows={rows}
            selectedIds={selectedIds}
            allVisibleSelected={allVisibleSelected}
            activeDocKey={activeDocKey}
            projectCodeById={projectCodeById}
            tableScrollRef={tableScrollRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            rowKey={rowKey}
            toggleSelected={toggleSelected}
            toggleSelectAll={toggleSelectAll}
            setActiveDocKey={setActiveDocKey}
            handleLoadMore={handleLoadMore}
          />
        </section>
      </div>

      {/* ─── Bulk action bar flotante ─── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-neutral-900 text-white shadow-2xl flex items-center gap-1 px-4 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest mr-2">
            {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => handleBulkAction('reclassify')}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-neutral-800"
          >
            Reclasificar
          </button>
          <button
            onClick={() => handleBulkAction('set-party')}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-neutral-800"
          >
            Contraparte
          </button>
          <button
            onClick={() => handleBulkAction('confirm')}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-neutral-800 text-green-300"
          >
            Confirmar
          </button>
          <button
            onClick={() => handleBulkAction('trash')}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-neutral-800 text-red-300"
          >
            Papelera
          </button>
          <button
            onClick={clearSelection}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 ml-2 border-l border-neutral-700"
          >
            ×
          </button>
        </div>
      )}

      {/* ─── Drawer detalle slide-out ─── */}
      {activeDoc && (
        <DocumentDrawer
          doc={activeDoc}
          projectCode={activeDoc.project_id ? (projectCodeById.get(activeDoc.project_id) ?? null) : null}
          onClose={() => setActiveDocKey(null)}
          editRoute={sourceTableRoute(activeDoc)}
          onChanged={() => setFilters((f) => ({ ...f }))}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * TABLA con virtualización (@tanstack/react-virtual)
 *
 * Estrategia:
 *  - rows ≤ 100  → render normal con <table>/<tbody> (no overhead virtualizer,
 *    mejor accesibilidad para search-in-page Cmd+F).
 *  - rows > 100  → virtualización: contenedor scroll con altura total =
 *    rows * ROW_HEIGHT, solo render virtualItems visibles vía absolute-position.
 *    Usa grid divs en lugar de <table> para compatibilidad con position absolute.
 *
 * estimateSize=48 ≈ alto fila (py-2.5 + contenido 2 líneas).
 * overscan=8 mantiene smoothness al scrollear rápido.
 * ───────────────────────────────────────────────────────────────────────────── */

const VIRTUALIZE_THRESHOLD = 100
const ROW_HEIGHT_PX = 48
const COL_TEMPLATE = '40px 180px minmax(200px, 1fr) 110px 120px 100px 130px 50px'

interface DocumentsTableProps {
  rows: DocumentRow[]
  selectedIds: Set<string>
  allVisibleSelected: boolean
  activeDocKey: string | null
  projectCodeById: Map<string, string>
  tableScrollRef: React.RefObject<HTMLDivElement | null>
  hasMore: boolean
  loadingMore: boolean
  rowKey: (r: DocumentRow) => string
  toggleSelected: (k: string) => void
  toggleSelectAll: () => void
  setActiveDocKey: (k: string | null) => void
  handleLoadMore: () => void
}

function DocumentsTable({
  rows,
  selectedIds,
  allVisibleSelected,
  activeDocKey,
  projectCodeById,
  tableScrollRef,
  hasMore,
  loadingMore,
  rowKey,
  toggleSelected,
  toggleSelectAll,
  setActiveDocKey,
  handleLoadMore,
}: DocumentsTableProps) {
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD

  // Hook SIEMPRE invocado (preserva orden hooks); solo consumido si shouldVirtualize.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 8,
  })

  // ─── Empty state ────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-neutral-100 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="px-3 py-3 w-10">
                <input type="checkbox" checked={false} disabled className="accent-primary opacity-30" />
              </th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contraparte</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fecha</th>
              <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Importe</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Proyecto</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-sm text-neutral-400">
                Sin documentos que coincidan con los filtros
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  // ─── Modo no virtualizado: <table>/<tbody> idéntico al original ──────────
  if (!shouldVirtualize) {
    return (
      <div className="bg-white border border-neutral-100 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="accent-primary"
                />
              </th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contraparte</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fecha</th>
              <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Importe</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Proyecto</th>
              <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {rows.map((r) => {
              const k = rowKey(r)
              const isSelected = selectedIds.has(k)
              const isActive = activeDocKey === k
              const projectCode = r.project_id ? (projectCodeById.get(r.project_id) ?? null) : null
              return (
                <tr
                  key={k}
                  onClick={() => setActiveDocKey(k)}
                  className={`cursor-pointer transition-colors ${
                    isActive ? 'bg-neutral-50' : isSelected ? 'bg-blue-50/40' : 'hover:bg-neutral-50'
                  }`}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(k)}
                      className="accent-primary"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <DocTypeBadge docType={r.doc_type} />
                    {r.original_filename && (
                      <p className="text-[10px] text-neutral-400 mt-0.5 truncate max-w-[200px]" title={r.original_filename}>
                        {r.original_filename}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-sm">
                    <p className="truncate max-w-[220px]" title={r.contraparte_principal ?? ''}>
                      {r.contraparte_principal || <span className="text-neutral-300">—</span>}
                    </p>
                    {r.contraparte_nif && (
                      <p className="text-[10px] text-neutral-400 font-mono">{r.contraparte_nif}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-neutral-600 whitespace-nowrap">
                    {formatDate(r.fecha_relevante)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-neutral-700 text-right tabular-nums whitespace-nowrap">
                    {formatEur(r.importe_principal)}
                  </td>
                  <td className="px-3 py-2.5">
                    <ProjectBadge code={projectCode} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ReviewBadge status={r.review_status} />
                    {r.ai_confidence != null && (
                      <p className="text-[10px] text-neutral-400 mt-0.5">conf {Math.round(r.ai_confidence * 100)}%</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {r.drive_url && (
                      <a
                        href={r.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-neutral-400 hover:text-neutral-700"
                        title="Ver en Drive"
                      >
                        ↗
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {hasMore && (
          <div className="px-4 py-3 border-t border-neutral-100 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              {loadingMore ? 'Cargando...' : `Cargar más (${rows.length})`}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── Modo virtualizado: header grid + body absoluto ──────────────────────
  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div className="bg-white border border-neutral-100">
      {/* Header (grid, replica anchos del body) */}
      <div
        className="border-b border-neutral-100 grid items-center bg-white"
        style={{ gridTemplateColumns: COL_TEMPLATE }}
      >
        <div className="px-3 py-3 flex items-center justify-center">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="accent-primary"
          />
        </div>
        <div className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo</div>
        <div className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contraparte</div>
        <div className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fecha</div>
        <div className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-neutral-400">Importe</div>
        <div className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Proyecto</div>
        <div className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</div>
        <div className="px-3 py-3"></div>
      </div>

      {/* Scroll container (parent virtualizer) */}
      <div
        ref={tableScrollRef}
        className="overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: 'calc(100vh - 360px)', minHeight: '400px' }}
        role="rowgroup"
      >
        <div style={{ height: `${totalSize}px`, width: '100%', position: 'relative' }}>
          {virtualItems.map((vi) => {
            const r = rows[vi.index]
            if (!r) return null
            const k = rowKey(r)
            const isSelected = selectedIds.has(k)
            const isActive = activeDocKey === k
            const projectCode = r.project_id ? (projectCodeById.get(r.project_id) ?? null) : null
            return (
              <div
                key={k}
                data-index={vi.index}
                onClick={() => setActiveDocKey(k)}
                className={`cursor-pointer transition-colors border-b border-neutral-50 ${
                  isActive ? 'bg-neutral-50' : isSelected ? 'bg-blue-50/40' : 'bg-white hover:bg-neutral-50'
                }`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT_PX}px`,
                  transform: `translateY(${vi.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: COL_TEMPLATE,
                  alignItems: 'center',
                }}
              >
                <div
                  className="px-3 py-2.5 flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(k)}
                    className="accent-primary"
                  />
                </div>
                <div className="px-3 py-2.5 overflow-hidden">
                  <DocTypeBadge docType={r.doc_type} />
                  {r.original_filename && (
                    <p className="text-[10px] text-neutral-400 mt-0.5 truncate" title={r.original_filename}>
                      {r.original_filename}
                    </p>
                  )}
                </div>
                <div className="px-3 py-2.5 text-sm overflow-hidden">
                  <p className="truncate" title={r.contraparte_principal ?? ''}>
                    {r.contraparte_principal || <span className="text-neutral-300">—</span>}
                  </p>
                  {r.contraparte_nif && (
                    <p className="text-[10px] text-neutral-400 font-mono truncate">{r.contraparte_nif}</p>
                  )}
                </div>
                <div className="px-3 py-2.5 text-sm text-neutral-600 whitespace-nowrap">
                  {formatDate(r.fecha_relevante)}
                </div>
                <div className="px-3 py-2.5 text-sm text-neutral-700 text-right tabular-nums whitespace-nowrap">
                  {formatEur(r.importe_principal)}
                </div>
                <div className="px-3 py-2.5">
                  <ProjectBadge code={projectCode} />
                </div>
                <div className="px-3 py-2.5">
                  <ReviewBadge status={r.review_status} />
                  {r.ai_confidence != null && (
                    <p className="text-[10px] text-neutral-400 mt-0.5">conf {Math.round(r.ai_confidence * 100)}%</p>
                  )}
                </div>
                <div className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  {r.drive_url && (
                    <a
                      href={r.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-neutral-400 hover:text-neutral-700"
                      title="Ver en Drive"
                    >
                      ↗
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {hasMore && (
        <div className="px-4 py-3 border-t border-neutral-100 text-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            {loadingMore ? 'Cargando...' : `Cargar más (${rows.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DRAWER DETALLE — stub navegable
 *
 * Muestra metadata, PDF embed iframe drive_url y botones Aprobar/Rechazar/
 * Reclasificar. La edición campo-a-campo se delega a la sub-vista canónica
 * según source_table (revisión / facturas / documentos/{tipo}).
 * ───────────────────────────────────────────────────────────────────────────── */

function DocumentDrawer({
  doc,
  projectCode,
  onClose,
  editRoute,
  onChanged,
}: {
  doc: DocumentRow
  projectCode: string | null
  onClose: () => void
  editRoute: string
  onChanged: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const patchStatus = async (status: 'confirmado' | 'rechazado') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/documentos/${doc.source_table}/${doc.source_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: status }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Error ${res.status}`)
      }
      onChanged()
      onClose()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'desconocido'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-[60%] bg-white h-full overflow-y-auto shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <DocTypeBadge docType={doc.doc_type} />
            <h2 className="text-sm font-bold uppercase tracking-widest truncate">
              {doc.original_filename || doc.contraparte_principal || `${doc.source_table} / ${doc.source_id.slice(0, 8)}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-2xl leading-none" aria-label="Cerrar">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha relevante" value={formatDate(doc.fecha_relevante)} />
            <Field label="Importe" value={formatEur(doc.importe_principal)} />
            <Field label="Contraparte" value={doc.contraparte_principal ?? '—'} />
            <Field label="NIF contraparte" value={doc.contraparte_nif ?? '—'} mono />
            <Field label="Proyecto" value={projectCode ?? 'Gasto general'} />
            <Field label="Estado revisión" value={doc.review_status} />
            <Field label="Confianza IA" value={doc.ai_confidence != null ? `${Math.round(doc.ai_confidence * 100)}%` : '—'} />
            <Field label="Origen (source_table)" value={doc.source_table} mono />
            <Field label="Creado" value={formatDate(doc.created_at)} />
            <Field label="File hash" value={doc.file_hash ? doc.file_hash.slice(0, 12) + '…' : '—'} mono />
          </div>

          {/* PDF embed (iframe drive_url) */}
          {doc.drive_url ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Documento original</p>
              <iframe
                src={doc.drive_url}
                title="Documento original"
                className="w-full h-[60vh] border border-neutral-100 bg-neutral-50"
              />
              <a
                href={doc.drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs text-primary hover:underline"
              >
                Abrir en Drive ↗
              </a>
            </div>
          ) : (
            <p className="text-xs text-neutral-400 italic">Sin documento original adjunto</p>
          )}

          {/* Audit log (stub) */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Historial</p>
            <ul className="text-xs text-neutral-500 space-y-1">
              <li>· Creado {formatDate(doc.created_at)} ({doc.source_table})</li>
              {doc.review_status !== 'pendiente' && <li>· Estado actual: {doc.review_status}</li>}
              {doc.deleted_at && <li className="text-red-500">· Borrado (papelera): {formatDate(doc.deleted_at)}</li>}
            </ul>
          </div>

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-neutral-100">
            <button
              onClick={() => router.push(editRoute)}
              className="bg-neutral-900 text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
            >
              Abrir / Editar →
            </button>
            <button
              onClick={() => patchStatus('confirmado')}
              disabled={busy || doc.review_status === 'confirmado'}
              className="border border-green-200 text-green-700 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Aprobar
            </button>
            <button
              onClick={() => patchStatus('rechazado')}
              disabled={busy || doc.review_status === 'rechazado'}
              className="border border-red-200 text-red-500 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Rechazar
            </button>
            <button
              onClick={() => router.push(editRoute)}
              className="border border-neutral-200 text-neutral-600 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-neutral-50 transition-colors"
            >
              Reclasificar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">{label}</p>
      <p className={`text-sm text-neutral-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}
