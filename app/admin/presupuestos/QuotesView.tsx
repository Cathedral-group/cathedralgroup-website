'use client'

import { useState, useMemo } from 'react'
import QuoteEditor from './QuoteEditor'

interface Quote {
  id?: string
  number: string
  client_id: string | null
  project_id: string | null
  status: string
  quality_level: string
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
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
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

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [search, setSearch] = useState('')

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
    return data.filter((q) => {
      if (statusFilter !== 'todos' && q.status !== statusFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const clientName = q.client_id ? (clientMap[q.client_id] || '') : ''
        const haystack = `${q.number} ${clientName}`.toLowerCase()
        if (!haystack.includes(s)) return false
      }
      return true
    })
  }, [data, statusFilter, search, clientMap])

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
                {[
                  { label: 'Numero', cls: '' },
                  { label: 'Cliente', cls: '' },
                  { label: 'Proyecto', cls: 'hidden sm:table-cell' },
                  { label: 'Total', cls: 'text-right' },
                  { label: 'Certificado', cls: 'hidden md:table-cell' },
                  { label: 'Estado', cls: '' },
                  { label: 'Fecha', cls: 'hidden sm:table-cell' },
                ].map((h) => (
                  <th
                    key={h.label}
                    className={`text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 ${h.cls}`}
                  >
                    {h.label}
                  </th>
                ))}
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
    </div>
  )
}
