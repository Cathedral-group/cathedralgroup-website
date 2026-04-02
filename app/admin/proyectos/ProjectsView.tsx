'use client'

import { useState, useMemo } from 'react'
import DataTable from '@/components/admin/DataTable'
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

/* ───────── Constants ───────── */

const STATUSES = ['presupuesto', 'en_curso', 'completado', 'cancelado']
const TYPES = ['reforma', 'interiorismo', 'cambio_uso', 'obra_nueva', 'promocion']
const PHASE_STATUSES = ['pendiente', 'en_curso', 'completado']

const STATUS_STYLES: Record<string, string> = {
  presupuesto: 'bg-neutral-100 text-neutral-700',
  en_curso: 'bg-blue-50 text-blue-700',
  completado: 'bg-green-50 text-green-700',
  cancelado: 'bg-red-50 text-red-700',
}

const TYPE_STYLES: Record<string, string> = {
  reforma: 'bg-primary/10 text-primary',
  interiorismo: 'bg-purple-50 text-purple-700',
  cambio_uso: 'bg-amber-50 text-amber-700',
  obra_nueva: 'bg-blue-50 text-blue-700',
  promocion: 'bg-green-50 text-green-700',
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

/* ───────── Component ───────── */

interface Props {
  projects: Project[]
  clients: Client[]
  financials: Financial[]
  invoices: Invoice[]
  phases: Phase[]
}

export default function ProjectsView({ projects: initialProjects, clients, financials, invoices: initialInvoices, phases: initialPhases }: Props) {
  const [projects, setProjects] = useState(initialProjects)
  const [allPhases, setAllPhases] = useState(initialPhases)
  const [selected, setSelected] = useState<Project | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<string>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Project>>({})
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState({ code: '', name: '', type: '', status: 'presupuesto', client_id: '' })
  const [savingNew, setSavingNew] = useState(false)

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

  const filtered = useMemo(() => {
    let list = projects
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
    // Sort
    list = [...list].sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
      if (sortBy === 'code') { va = a.code || ''; vb = b.code || '' }
      else if (sortBy === 'name') { va = a.name || ''; vb = b.name || '' }
      else if (sortBy === 'status') { va = a.status || ''; vb = b.status || '' }
      else if (sortBy === 'type') { va = a.type || ''; vb = b.type || '' }
      else if (sortBy === 'budget') { va = a.budget_estimated || 0; vb = b.budget_estimated || 0 }
      else if (sortBy === 'start_date') { va = a.start_date || ''; vb = b.start_date || '' }
      else if (sortBy === 'margin') {
        va = financialMap[a.id]?.margin_pct || 0
        vb = financialMap[b.id]?.margin_pct || 0
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [projects, statusFilter, search, clientMap, hiddenStatuses, sortBy, sortDir, financialMap])

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <span className="text-neutral-300 ml-1">↕</span>
    return <span className="text-primary ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  /* ───────── Helpers ───────── */

  function openDetail(project: Project) {
    setSelected(project)
    setEditForm({ ...project })
    setActiveTab('general')
    setShowPhaseForm(false)
    setEditingPhaseId(null)
    setPhaseForm({ name: '', status: 'pendiente', start_date: '', end_date: '' })
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
      if (data) {
        setProjects(prev => [data as Project, ...prev])
        setShowNewForm(false)
        setNewForm({ code: '', name: '', type: '', status: 'presupuesto', client_id: '' })
      }
    } catch (err) {
      console.error('createProject:', err)
      alert('Error al crear proyecto: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSavingNew(false)
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
      label: 'Presupuesto',
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

  const projectInvoices = selected ? initialInvoices.filter((inv) => inv.proyecto_code === selected.code) : []
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
          <div className="flex gap-3">
            <button
              onClick={createProject}
              disabled={savingNew || !newForm.code || !newForm.name}
              className="bg-neutral-900 text-white px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
            >
              {savingNew ? '...' : 'Crear proyecto'}
            </button>
            <button onClick={() => setShowNewForm(false)} className="text-neutral-500 hover:text-neutral-700 text-xs font-bold uppercase tracking-widest">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Status filters + toggle */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
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

        <div className="w-px h-5 bg-neutral-200" />

        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Ocultar:</span>
        {STATUSES.map((s) => (
          <label key={`hide-${s}`} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={hiddenStatuses.has(s)}
              onChange={(e) => {
                const next = new Set(hiddenStatuses)
                if (e.target.checked) next.add(s)
                else next.delete(s)
                setHiddenStatuses(next)
              }}
              className="accent-primary w-3 h-3"
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              {s.replace(/_/g, ' ')}
            </span>
          </label>
        ))}

        <span className="text-xs text-neutral-400 ml-auto">
          {filtered.length} de {projects.length}
        </span>
      </div>

      {/* Table with sortable headers */}
      <div className="bg-white border border-neutral-100 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100">
              {[
                { key: 'code', label: 'Código' },
                { key: 'name', label: 'Nombre' },
                { key: 'type', label: 'Tipo' },
                { key: 'status', label: 'Estado' },
                { key: 'budget', label: 'Presupuesto' },
                { key: 'margin', label: 'Margen' },
                { key: 'start_date', label: 'Inicio' },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 cursor-pointer hover:text-neutral-700 select-none"
                >
                  {label}<SortIcon col={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-400">Sin proyectos</td></tr>
            ) : (
              filtered.map((p) => {
                const fin = financialMap[p.id]
                return (
                  <tr key={p.id} onClick={() => openDetail(p)} className="cursor-pointer hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{p.code}</td>
                    <td className="px-4 py-3 text-sm max-w-[200px] truncate">{p.name}</td>
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
