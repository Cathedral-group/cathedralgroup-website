'use client'

import { useState, useMemo, useEffect } from 'react'
import TabPanel from '@/components/admin/TabPanel'
import ProgressBar from '@/components/admin/ProgressBar'
import LinkedSelect from '@/components/admin/LinkedSelect'

/* ───────── Types ───────── */

interface Project {
  id: string
  code: string
  name: string
  client_id?: string | null
  type?: string | null
  status?: string | null
  address?: string | null
  description?: string | null
  budget_estimated?: number | null
  sale_price?: number | null
  start_date?: string | null
  end_date_planned?: string | null
  end_date_real?: string | null
  notes?: string | null
  drive_folder_url?: string | null
  created_at: string
  [key: string]: unknown
}

interface Client {
  id: string
  name: string
}

interface Financial {
  project_id?: string
  total_invoiced?: number
  total_spent?: number
  margin_pct?: number
  [key: string]: unknown
}

interface Invoice {
  id: string
  number?: string | null
  concept?: string | null
  direction?: string | null
  amount_base?: number | null
  vat_amount?: number | null
  amount_total?: number | null
  payment_status?: string | null
  proyecto_code?: string | null
  project_id?: string | null
}

function getNetAmt(inv: Pick<Invoice, 'amount_base' | 'vat_amount' | 'amount_total'>): number {
  if (inv.amount_base != null) return Number(inv.amount_base)
  const total = inv.amount_total ? Number(inv.amount_total) : 0
  const vat = inv.vat_amount ? Number(inv.vat_amount) : 0
  return total > 0 && vat > 0 ? total - vat : total
}

interface Phase {
  id: string
  project_id: string
  name: string
  status?: string | null
  start_date?: string | null
  end_date?: string | null
  [key: string]: unknown
}

interface ProjectLocation {
  project_id: string
  lat: number
  lng: number
  radio_m: number
  direccion: string | null
}

/* ───────── Geofence helpers (Nominatim OSM via /api/admin/geocode) ───────── */

interface GeocodeSuggestion {
  lat: number
  lng: number
  display: string
  type?: string
}

async function geocodeAddressSuggestions(query: string): Promise<GeocodeSuggestion[]> {
  if (!query || query.trim().length < 3) return []
  try {
    const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { results?: GeocodeSuggestion[] }
    return data.results ?? []
  } catch {
    return []
  }
}

function getMyLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Tu navegador no soporta geolocalización'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.message || 'No se pudo obtener tu ubicación')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

/* ───────── Constants ───────── */

const STATUSES = ['presupuesto', 'en_curso', 'completado', 'finalizado', 'cancelado']
const TYPES = ['reforma', 'reforma_cliente', 'interiorismo', 'cambio_uso', 'obra_nueva', 'promocion', 'desarrollo', 'compra_reforma_venta']
const PHASE_STATUSES = ['pendiente', 'en_curso', 'completado']

const STATUS_STYLES: Record<string, string> = {
  presupuesto: 'bg-neutral-100 text-neutral-700',
  en_curso: 'bg-blue-50 text-blue-700',
  completado: 'bg-green-50 text-green-700',
  cancelado: 'bg-red-50 text-red-700',
}

const TYPE_STYLES: Record<string, string> = {
  reforma: 'bg-primary/10 text-primary',
  reforma_cliente: 'bg-primary/10 text-primary',
  interiorismo: 'bg-purple-50 text-purple-700',
  cambio_uso: 'bg-amber-50 text-amber-700',
  obra_nueva: 'bg-blue-50 text-blue-700',
  promocion: 'bg-green-50 text-green-700',
  desarrollo: 'bg-blue-50 text-blue-700',
  compra_reforma_venta: 'bg-orange-50 text-orange-700',
}

function Badge({ value, styles }: { value: string; styles: Record<string, string> }) {
  const s = styles[value] || 'bg-neutral-100 text-neutral-600'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${s}`}>
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function marginColor(pct: number) {
  if (pct >= 20) return 'text-green-600'
  if (pct >= 10) return 'text-amber-600'
  return 'text-red-600'
}

function marginBarColor(pct: number) {
  if (pct >= 20) return 'bg-green-500'
  if (pct >= 10) return 'bg-amber-500'
  return 'bg-red-500'
}

function currency(v?: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

type SortField = 'name' | 'type' | 'status' | 'budget_estimated' | 'start_date' | 'created_at'

/* ───────── Component ───────── */

interface Props {
  projects: Project[]
  clients: Client[]
  financials: Financial[]
  invoices: Invoice[]
  phases: Phase[]
  locations: ProjectLocation[]
}

/**
 * KPI mínimo para la cabecera de la página.
 * Sigue la paleta cromática Cathedral (sin colorinas, monocromo + acentos suaves).
 */
function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-neutral-100 px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="text-lg font-medium text-neutral-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function ProjectsView({ projects: initialProjects, clients, financials, invoices: initialInvoices, phases: initialPhases, locations: initialLocations }: Props) {
  const [projects, setProjects] = useState(initialProjects)
  const [allPhases, setAllPhases] = useState(initialPhases)
  const [allLocations, setAllLocations] = useState(initialLocations)
  const [selected, setSelected] = useState<Project | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set())
  // Por defecto ocultar proyectos cancelados de la vista principal — historial accesible vía toggle
  const [showCancelled, setShowCancelled] = useState(false)
  // ─── Patrón coherente Cathedral: 4 modos de vista (igual que Personal y Facturas)
  const [viewMode, setViewMode] = useState<'estado' | 'tipo' | 'año' | 'lista'>('estado')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Project>>({})
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState({ code: '', name: '', type: '', status: 'presupuesto', client_id: '' })
  const [savingNew, setSavingNew] = useState(false)

  // Ubicación en form Nuevo (opcional)
  const [newLoc, setNewLoc] = useState({ lat: '', lng: '', radio_m: 300, direccion: '' })
  const [newLocSearch, setNewLocSearch] = useState('')
  const [newLocBusy, setNewLocBusy] = useState<'mine' | 'search' | null>(null)
  const [newLocMsg, setNewLocMsg] = useState<string | null>(null)
  const [newLocSuggestions, setNewLocSuggestions] = useState<GeocodeSuggestion[]>([])
  const [newLocShowSugg, setNewLocShowSugg] = useState(false)

  // Ubicación en tab del detail (carga al abrir un proyecto)
  const [locForm, setLocForm] = useState({ lat: '', lng: '', radio_m: 300, direccion: '' })
  const [locSearch, setLocSearch] = useState('')
  const [locBusy, setLocBusy] = useState<'mine' | 'search' | 'save' | 'delete' | null>(null)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const [locSuggestions, setLocSuggestions] = useState<GeocodeSuggestion[]>([])
  const [locShowSugg, setLocShowSugg] = useState(false)

  // Phase inline form
  const [showPhaseForm, setShowPhaseForm] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)
  const [phaseForm, setPhaseForm] = useState({ name: '', status: 'pendiente', start_date: '', end_date: '' })

  /* ───────── Derived data ───────── */

  const financialMap = useMemo(() => {
    const m: Record<string, Financial> = {}
    financials.forEach((f) => { if (f.project_id) m[f.project_id] = f })
    return m
  }, [financials])

  const clientMap = useMemo(() => {
    const m: Record<string, string> = {}
    clients.forEach((c) => { m[c.id] = c.name })
    return m
  }, [clients])

  const locationMap = useMemo(() => {
    const m: Record<string, ProjectLocation> = {}
    allLocations.forEach((l) => { m[l.project_id] = l })
    return m
  }, [allLocations])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'start_date' || field === 'created_at' || field === 'budget_estimated' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thCls = (field: SortField, extra = '') =>
    `text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors ${
      sortField === field ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'
    } ${extra}`

  const cancelledCount = useMemo(
    () => projects.filter((p) => (p.status || '') === 'cancelado').length,
    [projects],
  )

  const filtered = useMemo(() => {
    let list = projects
    // Ocultar cancelados por defecto. Mostrarlos sólo si: toggle activo, o filtro explícito 'cancelado'
    if (!showCancelled && statusFilter !== 'cancelado') {
      list = list.filter((p) => (p.status || '') !== 'cancelado')
    }
    if (hiddenStatuses.size > 0) list = list.filter((p) => !hiddenStatuses.has(p.status || 'presupuesto'))
    if (statusFilter) list = list.filter((p) => (p.status || 'presupuesto') === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.code?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          clientMap[p.client_id || '']?.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es', { sensitivity: 'base' })
          break
        case 'type':
          cmp = (a.type ?? '').localeCompare(b.type ?? '')
          break
        case 'status':
          cmp = (a.status ?? '').localeCompare(b.status ?? '')
          break
        case 'budget_estimated':
          cmp = (a.budget_estimated ?? 0) - (b.budget_estimated ?? 0)
          break
        case 'start_date':
          cmp = (a.start_date ?? '').localeCompare(b.start_date ?? '')
          break
        case 'created_at':
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, statusFilter, search, clientMap, hiddenStatuses, sortField, sortDir, financialMap, showCancelled])

  /* ───────── KPIs (cabecera de la página, patrón Cathedral) ───────── */
  const kpis = useMemo(() => {
    const activos = projects.filter((p) => ['en_curso', 'presupuesto'].includes(p.status || 'presupuesto')).length
    const enCurso = projects.filter((p) => p.status === 'en_curso').length
    const finalizados = projects.filter((p) => p.status === 'finalizado').length
    const valorCartera = projects
      .filter((p) => p.status !== 'cancelado')
      .reduce((s, p) => s + (Number(p.budget_estimated) || 0), 0)
    const m2Total = projects.reduce(
      (s, p) => s + (Number((p as Record<string, unknown>).metros_cuadrados) || 0),
      0,
    )
    return { total: projects.length, activos, enCurso, finalizados, valorCartera, m2Total }
  }, [projects])

  /* ───────── Agrupación según viewMode ───────── */
  // Devuelve clave de agrupación para un proyecto según el modo activo.
  function groupKey(p: Project): { key: string; label: string } {
    if (viewMode === 'estado') {
      const k = p.status || 'sin_estado'
      return { key: k, label: k.replace(/_/g, ' ').toUpperCase() }
    }
    if (viewMode === 'tipo') {
      // El prefijo del code marca el tipo: OBR/FLP/PRO/OBN/CDU
      const prefix = (p.code || '').split('-')[0] || 'OTRO'
      const map: Record<string, string> = {
        OBR: 'Obra / Reforma cliente',
        FLP: 'Flipping',
        PRO: 'Promoción',
        OBN: 'Obra nueva',
        CDU: 'Cambio de uso',
      }
      return { key: prefix, label: map[prefix] || `Tipo ${prefix}` }
    }
    if (viewMode === 'año') {
      // Extraer año del code (OBR-2024-001 → 2024); si no hay code, usar start_date o created_at
      const fromCode = (p.code || '').match(/-(\d{4})-/)?.[1]
      const fromDate = (p.start_date || p.created_at || '').slice(0, 4)
      const año = fromCode || fromDate || 'Sin año'
      return { key: año, label: año }
    }
    return { key: 'all', label: 'Todos' }
  }

  const grouped = useMemo(() => {
    if (viewMode === 'lista') return null
    const groups: Record<string, { label: string; items: Project[] }> = {}
    for (const p of filtered) {
      const { key, label } = groupKey(p)
      if (!groups[key]) groups[key] = { label, items: [] }
      groups[key].items.push(p)
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, viewMode])

  /* ───────── Helpers ───────── */

  function openDetail(project: Project) {
    setSelected(project)
    setEditForm({ ...project })
    setActiveTab('general')
    setShowPhaseForm(false)
    setEditingPhaseId(null)
    setPhaseForm({ name: '', status: 'pendiente', start_date: '', end_date: '' })
    // Pre-cargar form de ubicación con lo que haya en BD para este proyecto
    const loc = locationMap[project.id]
    setLocForm({
      lat: loc ? String(loc.lat) : '',
      lng: loc ? String(loc.lng) : '',
      radio_m: loc?.radio_m ?? 300,
      direccion: loc?.direccion ?? '',
    })
    setLocSearch('')
    setLocBusy(null)
    setLocMsg(null)
  }

  function closeDetail() {
    setSelected(null)
    setEditForm({})
  }

  /* ───────── CRUD ───────── */

  async function saveProject() {
    if (!selected) return
    setSaving(true)
    const ef = editForm as Record<string, unknown>
    const payload: Record<string, unknown> = {}
    const FIELDS = ['code', 'name', 'client_id', 'type', 'status', 'address', 'description',
      'budget_estimated', 'sale_price', 'start_date', 'end_date_planned', 'end_date_real',
      'notes', 'drive_folder_url']
    for (const f of FIELDS) payload[f] = ef[f] ?? null
    try {
      const res = await fetch('/api/db/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...payload }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const updated = { ...selected, ...payload }
      setProjects((prev) => prev.map((p) => (p.id === selected.id ? updated : p)))
      setSelected(updated)
    } catch (err) {
      console.error('saveProject:', err)
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteProject() {
    if (!selected || !confirm('Mover este proyecto a la papelera?')) return
    try {
      const res = await fetch('/api/db/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setProjects((prev) => prev.filter((p) => p.id !== selected.id))
      closeDetail()
    } catch (err) {
      console.error('deleteProject:', err)
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  // Phases CRUD
  async function savePhase() {
    if (!selected) return
    try {
      if (editingPhaseId) {
        const res = await fetch('/api/db/project-phases', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPhaseId, ...phaseForm }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        setAllPhases((prev) => prev.map((ph) => (ph.id === editingPhaseId ? { ...ph, ...phaseForm } : ph)))
      } else {
        const res = await fetch('/api/db/project-phases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...phaseForm, project_id: selected.id }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        const { data } = await res.json()
        if (data) setAllPhases((prev) => [...prev, data as Phase])
      }
      setShowPhaseForm(false)
      setEditingPhaseId(null)
      setPhaseForm({ name: '', status: 'pendiente', start_date: '', end_date: '' })
    } catch (err) {
      console.error('savePhase:', err)
      alert('Error al guardar fase: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  async function deletePhase(phaseId: string) {
    try {
      const res = await fetch('/api/db/project-phases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: phaseId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setAllPhases((prev) => prev.filter((ph) => ph.id !== phaseId))
    } catch (err) {
      console.error('deletePhase:', err)
      alert('Error al eliminar fase: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    }
  }

  async function createProject() {
    if (!newForm.code || !newForm.name) return
    setSavingNew(true)
    try {
      const res = await fetch('/api/db/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newForm.code,
          name: newForm.name,
          type: newForm.type || null,
          status: newForm.status,
          client_id: newForm.client_id || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const { data } = await res.json()
      const created = data as Project | undefined
      if (created) {
        setProjects(prev => [created, ...prev])

        // Si rellenó ubicación, encadenar PUT location
        const lat = newLoc.lat ? Number(newLoc.lat) : NaN
        const lng = newLoc.lng ? Number(newLoc.lng) : NaN
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const locRes = await fetch(`/api/admin/proyectos/${encodeURIComponent(created.code)}/location`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat, lng,
              radio_m: newLoc.radio_m || 300,
              direccion: newLoc.direccion || null,
            }),
          })
          if (locRes.ok) {
            setAllLocations(prev => [
              ...prev.filter(l => l.project_id !== created.id),
              {
                project_id: created.id,
                lat, lng,
                radio_m: newLoc.radio_m || 300,
                direccion: newLoc.direccion || null,
              },
            ])
          } else {
            const lb = await locRes.json().catch(() => ({}))
            alert('Proyecto creado, pero falló guardar ubicación: ' + (lb.error || locRes.status))
          }
        }

        setShowNewForm(false)
        setNewForm({ code: '', name: '', type: '', status: 'presupuesto', client_id: '' })
        setNewLoc({ lat: '', lng: '', radio_m: 300, direccion: '' })
        setNewLocSearch('')
        setNewLocMsg(null)
      }
    } catch (err) {
      console.error('createProject:', err)
      alert('Error al crear proyecto: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSavingNew(false)
    }
  }

  /* ─── Geofence: helpers de los dos formularios ─── */

  async function newLoc_useMyLocation() {
    setNewLocBusy('mine'); setNewLocMsg(null)
    try {
      const pos = await getMyLocation()
      setNewLoc(prev => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }))
      setNewLocMsg(`Precisión ≈ ${Math.round(pos.accuracy)} m`)
    } catch (e) {
      setNewLocMsg(e instanceof Error ? e.message : 'Error obteniendo ubicación')
    } finally {
      setNewLocBusy(null)
    }
  }

  async function newLoc_searchAddress() {
    const q = newLocSearch.trim()
    if (q.length < 3) { setNewLocMsg('Escribe al menos 3 caracteres'); return }
    setNewLocBusy('search'); setNewLocMsg(null)
    try {
      const results = await geocodeAddressSuggestions(q)
      if (results.length === 0) {
        setNewLocMsg('No se encontraron resultados. Prueba con calle + número, o calle + Madrid.')
        setNewLocSuggestions([]); setNewLocShowSugg(false)
        return
      }
      setNewLocSuggestions(results); setNewLocShowSugg(true)
      setNewLocMsg(`${results.length} resultado${results.length === 1 ? '' : 's'} — elige uno`)
    } catch (e) {
      setNewLocMsg(e instanceof Error ? e.message : 'Error buscando dirección')
    } finally {
      setNewLocBusy(null)
    }
  }

  // Auto-buscar mientras escribe (debounce 500ms, sólo si form Nuevo está abierto)
  useEffect(() => {
    if (!showNewForm) return
    const q = newLocSearch.trim()
    if (q.length < 3) {
      setNewLocSuggestions([])
      setNewLocShowSugg(false)
      return
    }
    // Si ya elegimos esta sugerencia, no re-buscar
    if (newLocSuggestions.some(s => s.display === newLocSearch)) return
    const t = setTimeout(async () => {
      const results = await geocodeAddressSuggestions(q)
      setNewLocSuggestions(results)
      setNewLocShowSugg(results.length > 0)
      if (results.length === 0) {
        setNewLocMsg('Sin resultados. Prueba añadir el barrio o el código postal.')
      } else {
        setNewLocMsg(null)
      }
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newLocSearch, showNewForm])

  // Auto-buscar mientras escribe en tab Ubicación del detail
  useEffect(() => {
    if (!selected || activeTab !== 'ubicacion') return
    const q = locSearch.trim()
    if (q.length < 3) {
      setLocSuggestions([])
      setLocShowSugg(false)
      return
    }
    if (locSuggestions.some(s => s.display === locSearch)) return
    const t = setTimeout(async () => {
      const results = await geocodeAddressSuggestions(q)
      setLocSuggestions(results)
      setLocShowSugg(results.length > 0)
      if (results.length === 0) {
        setLocMsg('Sin resultados. Prueba añadir el barrio o el código postal.')
      } else {
        setLocMsg(null)
      }
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locSearch, selected, activeTab])

  function newLoc_pickSuggestion(s: GeocodeSuggestion) {
    setNewLoc(prev => ({
      ...prev,
      lat: s.lat.toFixed(6),
      lng: s.lng.toFixed(6),
      direccion: prev.direccion || s.display,
    }))
    setNewLocSearch(s.display)
    setNewLocShowSugg(false)
    setNewLocMsg(`📍 ${s.display}`)
  }

  async function locForm_useMyLocation() {
    setLocBusy('mine'); setLocMsg(null)
    try {
      const pos = await getMyLocation()
      setLocForm(prev => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }))
      setLocMsg(`Precisión ≈ ${Math.round(pos.accuracy)} m`)
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : 'Error obteniendo ubicación')
    } finally {
      setLocBusy(null)
    }
  }

  async function locForm_searchAddress() {
    const q = locSearch.trim()
    if (q.length < 3) { setLocMsg('Escribe al menos 3 caracteres'); return }
    setLocBusy('search'); setLocMsg(null)
    try {
      const results = await geocodeAddressSuggestions(q)
      if (results.length === 0) {
        setLocMsg('No se encontraron resultados. Prueba con calle + número, o calle + Madrid.')
        setLocSuggestions([]); setLocShowSugg(false)
        return
      }
      setLocSuggestions(results); setLocShowSugg(true)
      setLocMsg(`${results.length} resultado${results.length === 1 ? '' : 's'} — elige uno`)
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : 'Error buscando dirección')
    } finally {
      setLocBusy(null)
    }
  }

  function locForm_pickSuggestion(s: GeocodeSuggestion) {
    setLocForm(prev => ({
      ...prev,
      lat: s.lat.toFixed(6),
      lng: s.lng.toFixed(6),
      direccion: prev.direccion || s.display,
    }))
    setLocSearch(s.display)
    setLocShowSugg(false)
    setLocMsg(`📍 ${s.display}`)
  }

  async function saveLocation() {
    if (!selected) return
    const lat = Number(locForm.lat); const lng = Number(locForm.lng)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) { setLocMsg('Latitud inválida'); return }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) { setLocMsg('Longitud inválida'); return }
    const radio = Number(locForm.radio_m || 300)
    if (!Number.isInteger(radio) || radio < 50 || radio > 2000) { setLocMsg('Radio inválido (50-2000 m)'); return }
    setLocBusy('save'); setLocMsg(null)
    try {
      const res = await fetch(`/api/admin/proyectos/${encodeURIComponent(selected.code)}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radio_m: radio, direccion: locForm.direccion || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setAllLocations(prev => [
        ...prev.filter(l => l.project_id !== selected.id),
        { project_id: selected.id, lat, lng, radio_m: radio, direccion: locForm.direccion || null },
      ])
      setLocMsg('✓ Ubicación guardada')
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : 'Error guardando ubicación')
    } finally {
      setLocBusy(null)
    }
  }

  async function deleteLocation() {
    if (!selected) return
    if (!confirm('¿Eliminar la ubicación / geofence de este proyecto?')) return
    setLocBusy('delete'); setLocMsg(null)
    try {
      const res = await fetch(`/api/admin/proyectos/${encodeURIComponent(selected.code)}/location`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setAllLocations(prev => prev.filter(l => l.project_id !== selected.id))
      setLocForm({ lat: '', lng: '', radio_m: 300, direccion: '' })
      setLocMsg('Ubicación eliminada')
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : 'Error eliminando ubicación')
    } finally {
      setLocBusy(null)
    }
  }

  function startEditPhase(phase: Phase) {
    setEditingPhaseId(phase.id)
    setPhaseForm({
      name: phase.name || '',
      status: phase.status || 'pendiente',
      start_date: phase.start_date || '',
      end_date: phase.end_date || '',
    })
    setShowPhaseForm(true)
  }

  /* ───────── Table columns ───────── */

  const columns = [
    { key: 'code', label: 'Codigo' },
    { key: 'name', label: 'Nombre' },
    {
      key: 'client_id',
      label: 'Cliente',
      render: (val: unknown) => <span>{clientMap[String(val)] || '—'}</span>,
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (val: unknown) => val ? <Badge value={String(val)} styles={TYPE_STYLES} /> : <span>—</span>,
    },
    {
      key: 'status',
      label: 'Estado',
      render: (val: unknown) => <Badge value={String(val || 'presupuesto')} styles={STATUS_STYLES} />,
    },
    {
      key: 'budget_estimated',
      label: 'Importe',
      render: (val: unknown) => <span>{currency(val as number)}</span>,
    },
    {
      key: '_spent',
      label: 'Gastado',
      render: (_: unknown, row: Record<string, unknown>) => {
        const fin = financialMap[String(row.id)]
        return <span>{currency(fin?.total_spent as number)}</span>
      },
    },
    {
      key: '_margin',
      label: 'Margen %',
      render: (_: unknown, row: Record<string, unknown>) => {
        const fin = financialMap[String(row.id)]
        const pct = fin?.margin_pct as number | undefined
        if (pct == null) return <span>—</span>
        return <span className={`font-medium ${marginColor(pct)}`}>{pct.toFixed(1)}%</span>
      },
    },
    {
      key: '_progress',
      label: 'Progreso',
      render: (_: unknown, row: Record<string, unknown>) => {
        const projectPhases = allPhases.filter((ph) => ph.project_id === String(row.id))
        if (projectPhases.length === 0) return <span className="text-neutral-400">—</span>
        const completed = projectPhases.filter((ph) => ph.status === 'completado').length
        const pct = Math.round((completed / projectPhases.length) * 100)
        return (
          <div className="w-20">
            <ProgressBar value={pct} height="h-1.5" />
            <span className="text-[10px] text-neutral-400">{pct}%</span>
          </div>
        )
      },
    },
  ]

  /* ───────── Sub-views per tab ───────── */

  const projectPhases = selected ? allPhases.filter((ph) => ph.project_id === selected.id) : []
  const completedPhases = projectPhases.filter((ph) => ph.status === 'completado').length
  const phasePct = projectPhases.length > 0 ? Math.round((completedPhases / projectPhases.length) * 100) : 0

  const projectInvoices = selected ? initialInvoices.filter((inv) =>
    inv.project_id === selected.id || inv.proyecto_code === selected.code
  ) : []
  const totalInvoiced = projectInvoices.filter((i) => i.direction === 'emitida').reduce((s, i) => s + getNetAmt(i), 0)
  const totalSpent = projectInvoices.filter((i) => i.direction === 'recibida').reduce((s, i) => s + getNetAmt(i), 0)
  const invoiceMargin = totalInvoiced > 0 ? ((totalInvoiced - totalSpent) / totalInvoiced) * 100 : 0

  /* ───────── Field helper ───────── */

  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inputCls = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  function Field({ label, name, type = 'text' }: { label: string; name: keyof Project; type?: string }) {
    if (type === 'textarea') {
      return (
        <div>
          <label className={labelCls}>{label}</label>
          <textarea
            value={String(editForm[name] ?? '')}
            onChange={(e) => setEditForm({ ...editForm, [name]: e.target.value })}
            rows={3}
            className={inputCls}
          />
        </div>
      )
    }
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <input
          type={type}
          value={String(editForm[name] ?? '')}
          onChange={(e) => setEditForm({ ...editForm, [name]: type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value })}
          className={inputCls}
        />
      </div>
    )
  }

  /* ───────── RENDER ───────── */

  return (
    <>
      {/* Header + Search */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-medium">Proyectos</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar proyecto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-56"
          />
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-neutral-900 text-white px-5 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors whitespace-nowrap"
          >
            + Nuevo
          </button>
        </div>
      </div>

      {/* New project inline form */}
      {showNewForm && (
        <div className="bg-white border border-neutral-200 p-6 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4">Nuevo proyecto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelCls}>Código *</label>
              <input value={newForm.code} onChange={e => setNewForm({...newForm, code: e.target.value})} className={inputCls} placeholder="Ej: MAD-2026-001" />
            </div>
            <div>
              <label className={labelCls}>Nombre *</label>
              <input value={newForm.name} onChange={e => setNewForm({...newForm, name: e.target.value})} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={newForm.type} onChange={e => setNewForm({...newForm, type: e.target.value})} className={inputCls}>
                <option value="">Seleccionar</option>
                {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select value={newForm.status} onChange={e => setNewForm({...newForm, status: e.target.value})} className={inputCls}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Cliente</label>
              <select value={newForm.client_id} onChange={e => setNewForm({...newForm, client_id: e.target.value})} className={inputCls}>
                <option value="">Sin cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* ─── Bloque Ubicación / Geofence (opcional) ─── */}
          <div className="border-t border-neutral-100 pt-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                📍 Ubicación de la obra <span className="text-neutral-300">— opcional, pero recomendable para fichaje</span>
              </h4>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-1 relative">
              <input
                value={newLocSearch}
                onChange={e => { setNewLocSearch(e.target.value); setNewLocShowSugg(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); newLoc_searchAddress() } }}
                placeholder="Calle + número (ej: Buenavista 24)"
                className={inputCls + ' flex-1'}
              />
              <button
                type="button"
                onClick={newLoc_searchAddress}
                disabled={newLocBusy !== null || newLocSearch.trim().length < 3}
                className="bg-white border border-neutral-300 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50 whitespace-nowrap"
              >
                {newLocBusy === 'search' ? '...' : '🔍 Buscar'}
              </button>
              <button
                type="button"
                onClick={newLoc_useMyLocation}
                disabled={newLocBusy !== null}
                className="bg-white border border-neutral-300 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50 whitespace-nowrap"
                title="Usa el GPS del dispositivo (ideal si estás en la obra)"
              >
                {newLocBusy === 'mine' ? '...' : '📍 Mi ubicación'}
              </button>
            </div>

            {newLocShowSugg && newLocSuggestions.length > 0 && (
              <div className="mb-3 border border-neutral-200 bg-white max-h-72 overflow-y-auto rounded shadow-sm">
                {newLocSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => newLoc_pickSuggestion(s)}
                    className="block w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-50 last:border-b-0 text-sm"
                  >
                    <span className="text-stone-900">📍 {s.display}</span>
                    <span className="ml-2 text-[10px] font-mono text-stone-400">
                      {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Latitud</label>
                <input
                  type="number" step="0.0000001"
                  value={newLoc.lat}
                  onChange={e => setNewLoc({ ...newLoc, lat: e.target.value })}
                  className={inputCls + ' font-mono text-xs'}
                  placeholder="40.4168"
                />
              </div>
              <div>
                <label className={labelCls}>Longitud</label>
                <input
                  type="number" step="0.0000001"
                  value={newLoc.lng}
                  onChange={e => setNewLoc({ ...newLoc, lng: e.target.value })}
                  className={inputCls + ' font-mono text-xs'}
                  placeholder="-3.7038"
                />
              </div>
              <div>
                <label className={labelCls}>Radio (m)</label>
                <input
                  type="number" min="50" max="2000" step="50"
                  value={newLoc.radio_m}
                  onChange={e => setNewLoc({ ...newLoc, radio_m: parseInt(e.target.value, 10) || 300 })}
                  className={inputCls + ' tabular-nums'}
                />
              </div>
              <div>
                <label className={labelCls}>Dirección (opcional)</label>
                <input
                  value={newLoc.direccion}
                  onChange={e => setNewLoc({ ...newLoc, direccion: e.target.value })}
                  className={inputCls}
                  placeholder="C/ Ejemplo 12, Madrid"
                />
              </div>
            </div>

            {newLocMsg && (
              <p className="mt-2 text-xs text-neutral-600">{newLocMsg}</p>
            )}
            <p className="mt-2 text-[10px] text-neutral-400">
              Default radio 300 m — Madrid centro tiene mucha imprecisión GPS por edificios.
              Si lo dejas vacío, los fichajes ahí se registran como <em>sin ubicación</em> (no se bloquea).
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={createProject}
              disabled={savingNew || !newForm.code || !newForm.name}
              className="bg-neutral-900 text-white px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
            >
              {savingNew ? '...' : 'Crear proyecto'}
            </button>
            <button onClick={() => { setShowNewForm(false); setNewLoc({ lat: '', lng: '', radio_m: 300, direccion: '' }); setNewLocSearch(''); setNewLocMsg(null) }} className="text-neutral-500 hover:text-neutral-700 text-xs font-bold uppercase tracking-widest">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── KPIs (patrón coherente Cathedral) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Proyectos" value={String(kpis.total)} />
        <KpiCard label="Activos" value={String(kpis.activos)} hint="presupuesto + en curso" />
        <KpiCard label="En curso" value={String(kpis.enCurso)} />
        <KpiCard label="Finalizados" value={String(kpis.finalizados)} />
        <KpiCard label="Valor cartera" value={currency(kpis.valorCartera) || '—'} hint="excluye cancelados" />
      </div>

      {/* ─── Selector de modos (patrón Personal/Facturas: 4 chips) ─── */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-1">Vista:</span>
        {(['estado', 'tipo', 'año', 'lista'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ${
              viewMode === mode
                ? 'bg-neutral-900 text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            Por {mode}
          </button>
        ))}

        {/* Filtro adicional por estado, solo visible en modo 'lista' */}
        {viewMode === 'lista' && (
          <>
            <div className="w-px h-5 bg-neutral-200 mx-2" />
            <button
              onClick={() => setStatusFilter('')}
              className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
                !statusFilter ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
              }`}
            >
              Todos ({projects.length})
            </button>
            {STATUSES.map((s) => {
              const count = projects.filter((p) => (p.status || 'presupuesto') === s).length
              if (count === 0) return null
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 transition-colors ${
                    statusFilter === s ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-primary'
                  }`}
                >
                  {s.replace(/_/g, ' ')} ({count})
                </button>
              )
            })}
          </>
        )}

        {cancelledCount > 0 && (
          <button
            onClick={() => setShowCancelled((v) => !v)}
            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ml-auto ${
              showCancelled
                ? 'bg-neutral-200 text-neutral-700'
                : 'bg-white border border-neutral-200 text-neutral-500 hover:border-neutral-400'
            }`}
            title="Los proyectos cancelados están ocultos por defecto en la vista principal"
          >
            {showCancelled ? `✓ Cancelados visibles (${cancelledCount})` : `Mostrar cancelados (${cancelledCount})`}
          </button>
        )}

        <span className={`text-xs text-neutral-400 ${cancelledCount > 0 ? '' : 'ml-auto'}`}>
          {filtered.length} de {projects.length}
        </span>
      </div>

      {/* ─── Vista según modo seleccionado ─── */}
      {viewMode === 'lista' ? (
        // MODO LISTA: tabla plana ordenable (vista original)
        <div className="bg-white border border-neutral-100 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Código</th>
                <th onClick={() => handleSort('name')} className={thCls('name')}>Nombre{sortIcon('name')}</th>
                <th onClick={() => handleSort('type')} className={thCls('type')}>Tipo{sortIcon('type')}</th>
                <th onClick={() => handleSort('status')} className={thCls('status')}>Estado{sortIcon('status')}</th>
                <th onClick={() => handleSort('budget_estimated')} className={thCls('budget_estimated')}>Presupuesto{sortIcon('budget_estimated')}</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Margen</th>
                <th onClick={() => handleSort('start_date')} className={thCls('start_date')}>Inicio{sortIcon('start_date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-400">Sin proyectos</td></tr>
              ) : (
                filtered.map((p) => {
                  const fin = financialMap[p.id]
                  const hasGeo = !!locationMap[p.id]
                  return (
                    <tr key={p.id} onClick={() => openDetail(p)} className="cursor-pointer hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{p.code}</td>
                      <td className="px-4 py-3 text-sm max-w-[280px]">
                        <span className="truncate">{p.name}</span>
                        {!hasGeo && (
                          <span
                            className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
                            title="Los fichajes en este proyecto no podrán validar ubicación"
                          >
                            Sin ubicación
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{p.type && <Badge value={p.type} styles={TYPE_STYLES} />}</td>
                      <td className="px-4 py-3"><Badge value={p.status || 'presupuesto'} styles={STATUS_STYLES} /></td>
                      <td className="px-4 py-3 text-sm tabular-nums">{currency(p.budget_estimated)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums">
                        {fin?.margin_pct != null ? (
                          <span className={marginColor(fin.margin_pct)}>{fin.margin_pct.toFixed(0)}%</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {p.start_date ? new Date(p.start_date + 'T00:00:00').toLocaleDateString('es-ES') : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // MODOS AGRUPADOS (estado / tipo / zona): tarjetas por grupo
        <div className="space-y-4">
          {grouped && Object.keys(grouped).length === 0 && (
            <div className="bg-white border border-neutral-100 px-4 py-8 text-center text-sm text-neutral-400">
              Sin proyectos
            </div>
          )}
          {grouped &&
            Object.entries(grouped)
              .sort((a, b) => {
                // Para "año": orden descendente (2026 → 2024)
                if (viewMode === 'año') return b[1].label.localeCompare(a[1].label)
                return a[1].label.localeCompare(b[1].label, 'es')
              })
              .map(([key, group]) => {
                const totalImporte = group.items.reduce(
                  (s, p) => s + (Number(p.budget_estimated) || 0),
                  0,
                )
                return (
                  <div key={key} className="bg-white border border-neutral-100">
                    {/* Cabecera del grupo */}
                    <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-700">
                          {group.label}
                        </h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                          {group.items.length} proyecto{group.items.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-xs tabular-nums text-neutral-500">
                        {currency(totalImporte)}
                      </span>
                    </div>
                    {/* Filas del grupo */}
                    <div className="divide-y divide-neutral-50">
                      {group.items.map((p) => {
                        const fin = financialMap[p.id]
                        const hasGeo = !!locationMap[p.id]
                        return (
                          <div
                            key={p.id}
                            onClick={() => openDetail(p)}
                            className="px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors flex items-center gap-4"
                          >
                            <span className="text-xs font-mono text-neutral-500 w-32 shrink-0">
                              {p.code}
                            </span>
                            <span className="text-sm flex-1 min-w-0 flex items-center gap-2">
                              <span className="truncate">{p.name}</span>
                              {!hasGeo && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 whitespace-nowrap shrink-0"
                                  title="Los fichajes en este proyecto no podrán validar ubicación"
                                >
                                  Sin ubicación
                                </span>
                              )}
                            </span>
                            {p.type && <Badge value={p.type} styles={TYPE_STYLES} />}
                            <Badge value={p.status || 'presupuesto'} styles={STATUS_STYLES} />
                            <span className="text-xs tabular-nums text-neutral-500 w-24 text-right">
                              {currency(p.budget_estimated)}
                            </span>
                            {fin?.margin_pct != null && (
                              <span className={`text-xs font-medium tabular-nums w-12 text-right ${marginColor(fin.margin_pct)}`}>
                                {fin.margin_pct.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
        </div>
      )}

      {/* Detail slide-out panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={closeDetail}>
          <div
            className="w-full md:max-w-xl bg-white h-full overflow-y-auto p-4 md:p-8 pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">{selected.code}</p>
                <h2 className="text-lg font-medium">{selected.name}</h2>
                {selected.client_id && (
                  <p className="text-sm text-neutral-500">{clientMap[selected.client_id]}</p>
                )}
              </div>
              <button onClick={closeDetail} className="text-neutral-400 hover:text-neutral-900 text-lg">
                ✕
              </button>
            </div>

            {/* Acceso rápido vista de documentos del proyecto */}
            <div className="mb-4 flex flex-wrap gap-2">
              <a href={`/admin/proyectos/${selected.code}/documentos`}
                className="text-xs bg-neutral-900 text-white px-3 py-2 rounded hover:bg-neutral-700">
                📄 Ver documentos del proyecto
              </a>
              {selected.drive_folder_url && (
                <a href={selected.drive_folder_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded hover:bg-blue-100">
                  📁 Carpeta Drive ↗
                </a>
              )}
            </div>

            {/* Quick status change */}
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Estado</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={async () => {
                      const res = await fetch('/api/db/projects', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selected.id, status: s }),
                      })
                      if (!res.ok) {
                        const body = await res.json().catch(() => ({}))
                        alert('Error al cambiar estado: ' + (body.error || `Error ${res.status}`))
                        return
                      }
                      setProjects(prev => prev.map(p => p.id === selected.id ? { ...p, status: s } : p))
                      setSelected({ ...selected, status: s })
                      setEditForm({ ...editForm, status: s })
                    }}
                    className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 transition-colors ${
                      (selected.status || 'presupuesto') === s
                        ? 'bg-neutral-900 text-white'
                        : 'bg-white border border-neutral-200 text-neutral-500 hover:border-primary'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <TabPanel
              tabs={[
                { key: 'general', label: 'General' },
                { key: 'ubicacion', label: 'Ubicación' },
                { key: 'fases', label: 'Fases' },
                { key: 'facturas', label: 'Facturas' },
                { key: 'documentos', label: 'Documentos' },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              {/* ─── Tab: General ─── */}
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Código" name="code" />
                    <Field label="Nombre" name="name" />
                  </div>

                  <LinkedSelect
                    label="Cliente"
                    options={clients.map((c) => ({ value: c.id, label: c.name }))}
                    value={editForm.client_id as string || null}
                    onChange={(v) => setEditForm({ ...editForm, client_id: v || null })}
                    placeholder="Seleccionar cliente..."
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Tipo</label>
                      <select
                        value={String(editForm.type ?? '')}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value || null })}
                        className={inputCls}
                      >
                        <option value="">Seleccionar...</option>
                        {TYPES.map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Estado</label>
                      <select
                        value={String(editForm.status ?? '')}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value || null })}
                        className={inputCls}
                      >
                        <option value="">Seleccionar...</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <Field label="Dirección" name="address" />
                  <Field label="Descripción del proyecto" name="description" type="textarea" />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Presupuesto estimado" name="budget_estimated" type="number" />
                    <Field label="Precio de venta" name="sale_price" type="number" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Fecha inicio" name="start_date" type="date" />
                    <Field label="Fin planificado" name="end_date_planned" type="date" />
                    <Field label="Fin real" name="end_date_real" type="date" />
                  </div>

                  <Field label="Notas" name="notes" type="textarea" />
                  <Field label="Carpeta Google Drive (URL)" name="drive_folder_url" />
                </div>
              )}

              {/* ─── Tab: Ubicación / Geofence ─── */}
              {activeTab === 'ubicacion' && (
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500">
                    Coordenadas GPS del proyecto. Cuando un trabajador ficha aquí, comprobamos si está
                    dentro del radio (aviso informativo, <strong>no bloquea</strong> el fichaje).
                  </p>

                  {!locationMap[selected.id] && (
                    <div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      ⚠ Sin geofence configurado. Los fichajes en este proyecto se registran como
                      <em> sin ubicación válida</em>.
                    </div>
                  )}

                  {/* Buscar dirección / Mi ubicación */}
                  <div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={locSearch}
                        onChange={e => { setLocSearch(e.target.value); setLocShowSugg(false) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); locForm_searchAddress() } }}
                        placeholder="Calle + número (ej: Buenavista 24)"
                        className={inputCls + ' flex-1'}
                      />
                      <button
                        type="button"
                        onClick={locForm_searchAddress}
                        disabled={locBusy !== null || locSearch.trim().length < 3}
                        className="bg-white border border-neutral-300 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50 whitespace-nowrap"
                      >
                        {locBusy === 'search' ? '...' : '🔍 Buscar'}
                      </button>
                      <button
                        type="button"
                        onClick={locForm_useMyLocation}
                        disabled={locBusy !== null}
                        className="bg-white border border-neutral-300 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50 whitespace-nowrap"
                        title="Usa el GPS del dispositivo (ideal si estás en la obra)"
                      >
                        {locBusy === 'mine' ? '...' : '📍 Mi ubicación'}
                      </button>
                    </div>

                    {locShowSugg && locSuggestions.length > 0 && (
                      <div className="mt-2 border border-neutral-200 bg-white max-h-72 overflow-y-auto rounded shadow-sm">
                        {locSuggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => locForm_pickSuggestion(s)}
                            className="block w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-50 last:border-b-0 text-sm"
                          >
                            <span className="text-stone-900">📍 {s.display}</span>
                            <span className="ml-2 text-[10px] font-mono text-stone-400">
                              {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className={labelCls}>Latitud *</label>
                      <input
                        type="number" step="0.0000001"
                        value={locForm.lat}
                        onChange={e => setLocForm({ ...locForm, lat: e.target.value })}
                        className={inputCls + ' font-mono text-xs'}
                        placeholder="40.4168"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Longitud *</label>
                      <input
                        type="number" step="0.0000001"
                        value={locForm.lng}
                        onChange={e => setLocForm({ ...locForm, lng: e.target.value })}
                        className={inputCls + ' font-mono text-xs'}
                        placeholder="-3.7038"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Radio (m)</label>
                      <input
                        type="number" min="50" max="2000" step="50"
                        value={locForm.radio_m}
                        onChange={e => setLocForm({ ...locForm, radio_m: parseInt(e.target.value, 10) || 300 })}
                        className={inputCls + ' tabular-nums'}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Dirección</label>
                      <input
                        value={locForm.direccion}
                        onChange={e => setLocForm({ ...locForm, direccion: e.target.value })}
                        className={inputCls}
                        placeholder="C/ Ejemplo 12, Madrid"
                      />
                    </div>
                  </div>

                  {locForm.lat && locForm.lng && (
                    <a
                      href={`https://www.google.com/maps?q=${locForm.lat},${locForm.lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver en Google Maps →
                    </a>
                  )}

                  {locMsg && (
                    <p className="text-xs text-neutral-600">{locMsg}</p>
                  )}

                  <p className="text-[10px] text-neutral-400">
                    Default radio 300 m — Madrid centro tiene mucha imprecisión GPS por edificios.
                  </p>

                  <div className="flex gap-3 pt-3 border-t border-neutral-100">
                    <button
                      onClick={saveLocation}
                      disabled={locBusy !== null}
                      className="bg-neutral-900 text-white px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary disabled:opacity-50 transition-colors"
                    >
                      {locBusy === 'save' ? 'Guardando...' : 'Guardar ubicación'}
                    </button>
                    {locationMap[selected.id] && (
                      <button
                        onClick={deleteLocation}
                        disabled={locBusy !== null}
                        className="bg-white border border-red-200 text-red-600 px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {locBusy === 'delete' ? '...' : 'Eliminar'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ─── Tab: Fases ─── */}
              {activeTab === 'fases' && (
                <div className="space-y-4">
                  {/* Progress */}
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1">
                      <ProgressBar value={phasePct} />
                    </div>
                    <span className="text-sm font-medium">{completedPhases}/{projectPhases.length} fases</span>
                  </div>

                  {/* Phase list */}
                  {projectPhases.map((phase) => (
                    <div key={phase.id} className="flex items-center justify-between bg-neutral-50 p-3">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => startEditPhase(phase)}
                      >
                        <p className="text-sm font-medium">{phase.name}</p>
                        <p className="text-[10px] text-neutral-400">
                          {phase.start_date || '—'} → {phase.end_date || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge value={phase.status || 'pendiente'} styles={{
                          pendiente: 'bg-neutral-100 text-neutral-600',
                          en_curso: 'bg-blue-50 text-blue-700',
                          completado: 'bg-green-50 text-green-700',
                        }} />
                        <button
                          onClick={() => deletePhase(phase.id)}
                          className="text-neutral-300 hover:text-red-500 text-sm ml-2"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  {projectPhases.length === 0 && !showPhaseForm && (
                    <p className="text-sm text-neutral-400 py-4 text-center">Sin fases definidas</p>
                  )}

                  {/* Phase form */}
                  {showPhaseForm && (
                    <div className="border border-neutral-200 p-4 space-y-3">
                      <div>
                        <label className={labelCls}>Nombre</label>
                        <input
                          type="text"
                          value={phaseForm.name}
                          onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Estado</label>
                        <select
                          value={phaseForm.status}
                          onChange={(e) => setPhaseForm({ ...phaseForm, status: e.target.value })}
                          className={inputCls}
                        >
                          {PHASE_STATUSES.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Fecha inicio</label>
                          <input
                            type="date"
                            value={phaseForm.start_date}
                            onChange={(e) => setPhaseForm({ ...phaseForm, start_date: e.target.value })}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Fecha fin</label>
                          <input
                            type="date"
                            value={phaseForm.end_date}
                            onChange={(e) => setPhaseForm({ ...phaseForm, end_date: e.target.value })}
                            className={inputCls}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={savePhase}
                          className="bg-primary text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90"
                        >
                          {editingPhaseId ? 'Actualizar' : 'Crear fase'}
                        </button>
                        <button
                          onClick={() => { setShowPhaseForm(false); setEditingPhaseId(null) }}
                          className="bg-white border border-neutral-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {!showPhaseForm && (
                    <button
                      onClick={() => {
                        setPhaseForm({ name: '', status: 'pendiente', start_date: '', end_date: '' })
                        setEditingPhaseId(null)
                        setShowPhaseForm(true)
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80"
                    >
                      + Añadir fase
                    </button>
                  )}
                </div>
              )}

              {/* ─── Tab: Facturas ─── */}
              {activeTab === 'facturas' && (
                <div className="space-y-4">
                  {projectInvoices.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">N</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Concepto</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Tipo</th>
                            <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total</th>
                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {projectInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="px-3 py-2">{inv.number || '—'}</td>
                              <td className="px-3 py-2">{inv.concept || '—'}</td>
                              <td className="px-3 py-2">
                                <Badge value={inv.direction || 'recibida'} styles={{
                                  emitida: 'bg-green-50 text-green-700',
                                  recibida: 'bg-red-50 text-red-700',
                                }} />
                              </td>
                              <td className="px-3 py-2 text-right font-medium">{currency(inv.amount_total)}</td>
                              <td className="px-3 py-2">
                                <Badge value={inv.payment_status || 'pendiente'} styles={{
                                  pendiente: 'bg-amber-50 text-amber-700',
                                  pagada: 'bg-green-50 text-green-700',
                                  vencida: 'bg-red-50 text-red-700',
                                  parcial: 'bg-blue-50 text-blue-700',
                                  cancelada: 'bg-neutral-100 text-neutral-500',
                                }} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-neutral-200">
                          <tr>
                            <td colSpan={3} className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                              Total facturado
                            </td>
                            <td className="px-3 py-3 text-right font-medium text-green-600">{currency(totalInvoiced)}</td>
                            <td />
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                              Total gastado
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-red-600">{currency(totalSpent)}</td>
                            <td />
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                              Margen
                            </td>
                            <td className={`px-3 py-2 text-right font-medium ${marginColor(invoiceMargin)}`}>
                              {currency(totalInvoiced - totalSpent)} ({invoiceMargin.toFixed(1)}%)
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-400 py-4 text-center">Sin facturas vinculadas</p>
                  )}

                  <a
                    href={`/admin/facturas?proyecto_code=${selected.code}`}
                    className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80"
                  >
                    + Nueva factura
                  </a>
                </div>
              )}

              {/* ─── Tab: Documentos ─── */}
              {activeTab === 'documentos' && (
                <div className="space-y-4">
                  {selected.drive_folder_url ? (
                    <a
                      href={selected.drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90"
                    >
                      Abrir en Google Drive
                    </a>
                  ) : (
                    <p className="text-sm text-neutral-400">No hay carpeta de Drive vinculada</p>
                  )}
                  <p className="text-sm text-neutral-400 py-4">Gestion de documentos proximamente</p>
                </div>
              )}
            </TabPanel>

            {/* Save / Delete — always visible regardless of active tab */}
            <div className="flex gap-3 pt-4 mt-4 border-t border-neutral-100">
              <button
                onClick={saveProject}
                disabled={saving}
                className="bg-neutral-900 text-white px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={deleteProject}
                className="bg-white border border-red-200 text-red-600 px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
