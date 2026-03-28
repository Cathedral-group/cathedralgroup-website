'use client'

import { useState, useMemo } from 'react'
import InvoiceForm from './InvoiceForm'

interface Invoice {
  id?: string
  direction: string
  doc_type: string
  number: string
  concept: string
  amount_base: number | null
  vat_pct: number | null
  vat_amount: number | null
  irpf_rate: number | null
  irpf_amount: number | null
  amount_total: number | null
  issue_date: string
  due_date: string
  payment_date: string | null
  payment_status: string
  payment_method: string | null
  proyecto_code: string | null
  supplier_nif: string | null
  categoria_gasto: string | null
  es_rectificativa: boolean
  numero_factura_original: string | null
  notes: string | null
}

interface InvoicesViewProps {
  initialData: Invoice[]
  projects: { value: string; label: string }[]
  suppliers: { value: string; label: string }[]
}

function formatEur(val: number | null): string {
  if (val === null || val === undefined) return '--'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null): string {
  if (!d) return '--'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(d + 'T00:00:00')
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function DirectionBadge({ dir }: { dir: string }) {
  const isEmitida = dir === 'emitida'
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
        isEmitida ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
      }`}
    >
      {isEmitida ? 'Cobro' : 'Pago'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-700',
    pagada: 'bg-green-100 text-green-700',
    vencida: 'bg-red-100 text-red-700',
    parcial: 'bg-purple-100 text-purple-700',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'bg-neutral-100 text-neutral-500'}`}
    >
      {status}
    </span>
  )
}

function DueDate({ date, status }: { date: string | null; status: string }) {
  if (!date) return <span className="text-neutral-300">--</span>
  if (status === 'pagada') return <span>{formatDate(date)}</span>

  const days = daysUntil(date)
  let color = 'text-green-600'
  if (days !== null) {
    if (days < 0) color = 'text-red-600 font-semibold'
    else if (days < 7) color = 'text-red-500'
    else if (days <= 15) color = 'text-amber-500'
  }
  return <span className={color}>{formatDate(date)}</span>
}

export default function InvoicesView({ initialData, projects, suppliers }: InvoicesViewProps) {
  const [data, setData] = useState<Invoice[]>(initialData)
  const [formOpen, setFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)

  // Filters
  const [dirFilter, setDirFilter] = useState<'todas' | 'emitida' | 'recibida'>('todas')
  const [statusFilter, setStatusFilter] = useState<'todas' | 'pendiente' | 'pagada' | 'vencida'>('todas')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return data.filter((inv) => {
      if (dirFilter !== 'todas' && inv.direction !== dirFilter) return false
      if (statusFilter !== 'todas' && inv.payment_status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = `${inv.number} ${inv.concept} ${inv.supplier_nif ?? ''} ${inv.proyecto_code ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [data, dirFilter, statusFilter, search])

  const openNew = () => {
    setEditingInvoice(null)
    setFormOpen(true)
  }

  const openEdit = (inv: Invoice) => {
    setEditingInvoice(inv)
    setFormOpen(true)
  }

  const handleSaved = (inv: Invoice, isNew: boolean) => {
    if (isNew) {
      setData((prev) => [inv, ...prev])
    } else {
      setData((prev) => prev.map((r) => r.id === inv.id ? inv : r))
    }
    setFormOpen(false)
  }

  const handleDeleted = (id: string) => {
    setData((prev) => prev.filter((r) => r.id !== id))
    setFormOpen(false)
  }

  const markAsPaid = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    const today = new Date().toISOString().slice(0, 10)
    const res = await fetch('/api/db/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, payment_status: 'pagada', payment_date: today }),
    })
    const { data: updated } = await res.json()
    if (updated) {
      setData((prev) => prev.map((r) => r.id === inv.id ? (updated as Invoice) : r))
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
        <h1 className="text-xl font-medium uppercase tracking-wide">Facturas</h1>
        <button
          onClick={openNew}
          className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
        >
          + Nueva factura
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Direction */}
        <div className="flex gap-1">
          {(['todas', 'emitida', 'recibida'] as const).map((v) => (
            <button key={v} onClick={() => setDirFilter(v)} className={filterBtnCls(dirFilter === v)}>
              {v === 'todas' ? 'Todas' : v === 'emitida' ? 'Cobros' : 'Pagos'}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-neutral-200" />

        {/* Status */}
        <div className="flex gap-1">
          {(['todas', 'pendiente', 'pagada', 'vencida'] as const).map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)} className={filterBtnCls(statusFilter === v)}>
              {v === 'todas' ? 'Todas' : v}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-neutral-200" />

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-56"
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
                {['N\u00ba', 'Tipo', 'Concepto', 'Base', 'IVA', 'Total', 'Fecha', 'Vencimiento', 'Estado', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-neutral-400">
                    Sin facturas
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => openEdit(inv)}
                    className="cursor-pointer hover:bg-neutral-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{inv.number || '--'}</td>
                    <td className="px-4 py-3"><DirectionBadge dir={inv.direction} /></td>
                    <td className="px-4 py-3 text-sm max-w-[200px] truncate">{inv.concept}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right">{formatEur(inv.amount_base)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right">{formatEur(inv.vat_amount)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-semibold">{formatEur(inv.amount_total)}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <DueDate date={inv.due_date} status={inv.payment_status} />
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={inv.payment_status} /></td>
                    <td className="px-4 py-3">
                      {inv.payment_status === 'pendiente' && (
                        <button
                          onClick={(e) => markAsPaid(inv, e)}
                          className="text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-800 whitespace-nowrap"
                        >
                          Marcar pagada
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form panel */}
      {formOpen && (
        <InvoiceForm
          invoice={editingInvoice}
          projects={projects}
          suppliers={suppliers}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
