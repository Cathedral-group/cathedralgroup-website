'use client'

import { useState, useMemo } from 'react'
import QuoteEditor from './QuoteEditor'

type SortField = 'number' | 'client' | 'total' | 'created_at' | 'status'

interface Quote {
  id?: string
  number: string
  client_id: string | null
  project_id: string | null
  status: string
  quality_level: string
  quality_coefficient_override: number | null
  valid_until: string | null
  items: QuoteItem[]
  subtotal: number
  vat_total: number
  total: number
  notes: string | null
  conditions: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  certifications: { number: number; closed_at: string; items: { description: string; total: number; certified_pct: number; invoiced_pct: number }[]; total_budget: number; total_certified: number; vat_pct: number }[]
  portal_token?: string
}

interface QuoteItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  vat_pct: number
  total: number
  certified_pct: number
  invoiced_pct: number
}

interface Client {
  id: string
  name: string
}

interface Project {
  id: string
  code: string
  name: string
}

interface QuotesViewProps {
  quotes: Quote[]
  clients: Client[]
  projects: Project[]
  userEmail: string
}

function formatEur(val: number | null): string {
  if (val === null || val === undefined) return '--'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null): string {
  if (!d) return '--'
  const dateStr = d.includes('T') ? d : d + 'T00:00:00'
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_STYLES: Record<string, string> = {
  borrador: 'bg-neutral-100 text-neutral-600',
  enviado: 'bg-blue-100 text-blue-700',
  aceptado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}

function calcWeightedCertPct(items: QuoteItem[]): number {
  const totalSum = items.reduce((s, it) => s + (it.total || 0), 0)
  if (totalSum === 0) return 0
  const certSum = items.reduce((s, it) => s + ((it.certified_pct ?? 0) / 100) * (it.total || 0), 0)
  return Math.round((certSum / totalSum) * 100)
}

function CertProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-neutral-200'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-neutral-400">{pct}%</span>
    </div>
  )
}

function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-500'}`}
    >
      {status}
    </span>
  )
}

export default function QuotesView({ quotes: initialQuotes, clients, projects, userEmail }: QuotesViewProps) {
  const [data, setData] = useState<Quote[]>(initialQuotes)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null)
  const [deleteConfirmQuote, setDeleteConfirmQuote] = useState<Quote | null>(null)
  const [deletingQuote, setDeletingQuote] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [search, setSearch] = useState('')

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'created_at' || field === 'total' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thCls = (field: SortField, extra = '') =>
    `text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors ${
      sortField === field ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'
    } ${extra}`

  const clientMap = useMemo(() => {
    const m: Record<string, string> = {}
    clients.forEach((c) => { m[c.id] = c.name })
    return m
  }, [clients])

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {}
    projects.forEach((p) => { m[p.id] = `${p.code} - ${p.name}` })
    return m
  }, [projects])

  const filtered = useMemo(() => {
    const list = data.filter((q) => {
      if (statusFilter !== 'todos' && q.status !== statusFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const clientName = q.client_id ? (clientMap[q.client_id] || '') : ''
        const haystack = `${q.number} ${clientName}`.toLowerCase()
        if (!haystack.includes(s)) return false
      }
      return true
    })

    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'number':
          cmp = (a.number ?? '').localeCompare(b.number ?? '', 'es', { numeric: true })
          break
        case 'client': {
          const nameA = a.client_id ? (clientMap[a.client_id] ?? '') : ''
          const nameB = b.client_id ? (clientMap[b.client_id] ?? '') : ''
          cmp = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
          break
        }
        case 'total':
          cmp = (a.total ?? 0) - (b.total ?? 0)
          break
        case 'created_at':
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
          break
        case 'status':
          cmp = (a.status ?? '').localeCompare(b.status ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [data, statusFilter, search, clientMap, sortField, sortDir])

  const openNew = () => {
    setEditingQuote(null)
    setEditorOpen(true)
  }

  const openEdit = (q: Quote) => {
    setEditingQuote(q)
    setEditorOpen(true)
  }

  const handleSaved = (q: Quote, isNew: boolean) => {
    if (isNew) {
      setData((prev) => [q, ...prev])
    } else {
      setData((prev) => prev.map((r) => r.id === q.id ? q : r))
    }
  }

  const handleDeleted = (id: string) => {
    setData((prev) => prev.filter((r) => r.id !== id))
    setEditorOpen(false)
  }

  const handleClose = () => {
    setEditorOpen(false)
  }

  const handleDeleteQuote = async () => {
    if (!deleteConfirmQuote?.id) return
    setDeletingQuote(true)
    try {
      const res = await fetch('/api/db/quotes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirmQuote.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setData(prev => prev.filter(r => r.id !== deleteConfirmQuote.id))
      setDeleteConfirmQuote(null)
    } catch (err) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setDeletingQuote(false)
    }
  }

  const filterBtnCls = (active: boolean) =>
    `px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors rounded ${
      active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-600'
    }`

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div />
        <button
          onClick={openNew}
          className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
        >
          + Nuevo presupuesto
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex gap-1">
          {(['todos', 'borrador', 'enviado', 'aceptado', 'rechazado'] as const).map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)} className={filterBtnCls(statusFilter === v)}>
              {v === 'todos' ? 'Todos' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-neutral-200" />

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por numero o cliente..."
          className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-full sm:w-56"
        />

        <span className="text-xs text-neutral-400 ml-auto">
          {filtered.length} de {data.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100">
                <th onClick={() => handleSort('number')} className={thCls('number')}>Numero{sortIcon('number')}</th>
                <th onClick={() => handleSort('client')} className={thCls('client')}>Cliente{sortIcon('client')}</th>
                <th className="hidden sm:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Proyecto</th>
                <th onClick={() => handleSort('total')} className={thCls('total', 'text-right')}>Total{sortIcon('total')}</th>
                <th className="hidden md:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Certificado</th>
                <th onClick={() => handleSort('status')} className={thCls('status')}>Estado{sortIcon('status')}</th>
                <th onClick={() => handleSort('created_at')} className={thCls('created_at', 'hidden sm:table-cell')}>Fecha{sortIcon('created_at')}</th>
                <th className="px-4 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-neutral-400">
                    Sin presupuestos
                  </td>
                </tr>
              ) : (
                filtered.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => openEdit(q)}
                    className="cursor-pointer hover:bg-neutral-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{q.number || '--'}</td>
                    <td className="px-4 py-3 text-sm max-w-[200px] truncate">
                      {q.client_id ? (clientMap[q.client_id] || '--') : '--'}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm max-w-[200px] truncate">
                      {q.project_id ? (projectMap[q.project_id] || '--') : '--'}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-semibold">
                      {formatEur(q.total)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <CertProgressBar pct={calcWeightedCertPct(q.items || [])} />
                    </td>
                    <td className="px-4 py-3">
                      <QuoteStatusBadge status={q.status} />
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm whitespace-nowrap">
                      {formatDate(q.created_at)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmQuote(q) }}
                        className="text-neutral-300 hover:text-red-500 transition-colors"
                        title="Eliminar presupuesto"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor panel */}
      {editorOpen && (
        <QuoteEditor
          quote={editingQuote}
          clients={clients}
          projects={projects}
          userEmail={userEmail}
          onClose={handleClose}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {deleteConfirmQuote && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-6 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4">Eliminar presupuesto</h2>
            <p className="text-sm text-neutral-600 mb-2">¿Eliminar este presupuesto? Esta acción no se puede deshacer.</p>
            <div className="bg-neutral-50 rounded p-3 mb-6 text-sm space-y-1">
              <div className="font-medium">{deleteConfirmQuote.number || '--'}</div>
              <div className="text-neutral-500">{formatEur(deleteConfirmQuote.total)}</div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmQuote(null)}
                disabled={deletingQuote}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-neutral-200 text-neutral-500 hover:border-neutral-400 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteQuote}
                disabled={deletingQuote}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deletingQuote ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
