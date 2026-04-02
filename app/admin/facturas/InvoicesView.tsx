'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import InvoiceForm from './InvoiceForm'

type SortField = 'number' | 'direction' | 'concept' | 'amount_base' | 'vat_amount' | 'amount_total' | 'issue_date' | 'due_date' | 'payment_status'
type DocTypeCategory = 'todas' | 'facturas' | 'obra' | 'legal' | 'admin' | 'otros'

const CATEGORY_TYPES: Record<string, string[]> = {
  facturas: ['factura', 'proforma', 'rectificativa', 'abono', 'ticket', 'justificante_pago'],
  obra:     ['presupuesto', 'albaran', 'certificado'],
  legal:    ['contrato', 'escritura', 'nota_simple', 'licencia'],
  admin:    ['nomina', 'modelo_fiscal', 'seguro', 'informe'],
  otros:    ['otro'],
}

const CATEGORY_LABELS: Record<DocTypeCategory, string> = {
  todas:    'Todas',
  facturas: 'Facturas',
  obra:     'Obra',
  legal:    'Legal',
  admin:    'Admin',
  otros:    'Otros',
}

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
  needs_review?: boolean | null
  ai_confidence?: number | null
  ai_razones?: string[] | null
  source?: string | null
  drive_url?: string | null
  drive_file_id?: string | null
  original_filename?: string | null
  sent_at?: string | null
  sent_channel?: string | null
}

interface InvoicesViewProps {
  initialData: Invoice[]
  projects: { value: string; label: string }[]
  suppliers: { value: string; label: string }[]
}

function formatEur(val: number | null): string {
  if (val === null || val === undefined || isNaN(val)) return '--'
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
  const router = useRouter()
  const [data, setData] = useState<Invoice[]>(initialData)
  const [refreshing, setRefreshing] = useState(false)

  // Sync state when server sends fresh data after router.refresh()
  useEffect(() => {
    setData(initialData)
    setRefreshing(false)
  }, [initialData])

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
  }
  const [formOpen, setFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dedupPreview, setDedupPreview] = useState<Invoice[] | null>(null)
  const [deduping, setDeduping] = useState(false)

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<DocTypeCategory>('todas')
  const [dirFilter, setDirFilter] = useState<'todas' | 'emitida' | 'recibida'>('todas')
  const [statusFilter, setStatusFilter] = useState<'todas' | 'pendiente' | 'pagada' | 'vencida'>('todas')
  const [search, setSearch] = useState('')

  // Sort: default concept ASC so duplicates cluster together, date DESC secondary
  const [sortField, setSortField] = useState<SortField>('concept')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'issue_date' || field === 'due_date' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const thCls = (field: SortField, extra = '') =>
    `text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors ${
      sortField === field ? 'text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'
    } ${extra}`

  const filtered = useMemo(() => {
    const list = data.filter((inv) => {
      if (categoryFilter !== 'todas' && !CATEGORY_TYPES[categoryFilter].includes(inv.doc_type)) return false
      if (dirFilter !== 'todas' && inv.direction !== dirFilter) return false
      if (statusFilter !== 'todas' && inv.payment_status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = `${inv.number} ${inv.concept} ${inv.supplier_nif ?? ''} ${inv.proyecto_code ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'number':
          cmp = (a.number ?? '').localeCompare(b.number ?? '', 'es', { numeric: true })
          break
        case 'direction':
          cmp = (a.direction ?? '').localeCompare(b.direction ?? '')
          break
        case 'concept':
          cmp = (a.concept ?? '').localeCompare(b.concept ?? '', 'es', { sensitivity: 'base' })
          if (cmp === 0) cmp = (b.issue_date ?? '').localeCompare(a.issue_date ?? '')
          break
        case 'amount_base':
          cmp = (a.amount_base ?? 0) - (b.amount_base ?? 0)
          break
        case 'vat_amount':
          cmp = (a.vat_amount ?? 0) - (b.vat_amount ?? 0)
          break
        case 'amount_total':
          cmp = (a.amount_total ?? 0) - (b.amount_total ?? 0)
          break
        case 'issue_date':
          cmp = (a.issue_date ?? '').localeCompare(b.issue_date ?? '')
          break
        case 'due_date':
          cmp = (a.due_date ?? '').localeCompare(b.due_date ?? '')
          break
        case 'payment_status':
          cmp = (a.payment_status ?? '').localeCompare(b.payment_status ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [data, categoryFilter, dirFilter, statusFilter, search, sortField, sortDir])

  const openNew = () => {
    setEditingInvoice(null)
    setFormOpen(true)
  }

  const exportCSV = () => {
    const headers = ['Número','Tipo','Dirección','Concepto','Base','IVA%','IVA','IRPF%','IRPF','Total','Emisión','Vencimiento','Fecha pago','Estado pago','Método pago','Proyecto','Proveedor NIF','Categoría gasto','Rectificativa','Factura original','Notas']
    const rows = filtered.map((inv) => [
      inv.number, inv.doc_type, inv.direction, inv.concept,
      inv.amount_base ?? '', inv.vat_pct ?? '', inv.vat_amount ?? '',
      inv.irpf_rate ?? '', inv.irpf_amount ?? '', inv.amount_total ?? '',
      inv.issue_date, inv.due_date ?? '', inv.payment_date ?? '',
      inv.payment_status, inv.payment_method ?? '', inv.proyecto_code ?? '',
      inv.supplier_nif ?? '', inv.categoria_gasto ?? '',
      inv.es_rectificativa ? 'Sí' : 'No', inv.numero_factura_original ?? '', inv.notes ?? '',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `facturas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

  const handleDelete = async () => {
    if (!deleteConfirm?.id) return
    setDeleting(true)
    try {
      const res = await fetch('/api/db/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirm.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setData((prev) => prev.filter((r) => r.id !== deleteConfirm.id))
      setDeleteConfirm(null)
    } catch (err) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setDeleting(false)
    }
  }

  const findDuplicates = (): Invoice[] => {
    const groups = new Map<string, Invoice[]>()
    for (const inv of data) {
      if (!inv.concept || inv.amount_total === null || inv.amount_total === undefined) continue
      const key = `${inv.concept.trim().toLowerCase()}||${inv.amount_total}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(inv)
    }
    const toDelete: Invoice[] = []
    for (const group of groups.values()) {
      if (group.length <= 1) continue
      // Keep the one with drive_url first, then oldest (by issue_date)
      const sorted = [...group].sort((a, b) => {
        if (a.drive_url && !b.drive_url) return -1
        if (!a.drive_url && b.drive_url) return 1
        return (a.issue_date ?? '').localeCompare(b.issue_date ?? '')
      })
      toDelete.push(...sorted.slice(1))
    }
    return toDelete
  }

  const handleDedupPreview = () => {
    const dupes = findDuplicates()
    setDedupPreview(dupes)
  }

  const handleDedupConfirm = async () => {
    if (!dedupPreview) return
    setDeduping(true)
    let deleted = 0
    for (const inv of dedupPreview) {
      try {
        const res = await fetch('/api/db/invoices', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inv.id }),
        })
        if (res.ok) {
          deleted++
          setData((prev) => prev.filter((r) => r.id !== inv.id))
        }
      } catch {
        // continue with rest
      }
    }
    setDeduping(false)
    setDedupPreview(null)
    alert(`${deleted} facturas duplicadas eliminadas.`)
  }

  const markAsPaid = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    const today = new Date().toISOString().slice(0, 10)
    try {
      const res = await fetch('/api/db/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, payment_status: 'pagada', payment_date: today }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const { data: updated } = await res.json()
      setData((prev) => prev.map((r) => r.id === inv.id
        ? (updated ?? { ...r, payment_status: 'pagada', payment_date: today }) as Invoice
        : r
      ))
    } catch (err) {
      console.error('markAsPaid:', err)
      alert('Error al marcar como pagada: ' + (err instanceof Error ? err.message : 'Error desconocido'))
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
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="border border-neutral-200 text-neutral-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-neutral-400 transition-colors disabled:opacity-50"
          >
            {refreshing ? '↻ Refrescando...' : '↻ Refrescar'}
          </button>
          <button
            onClick={exportCSV}
            className="border border-neutral-200 text-neutral-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-neutral-400 transition-colors"
          >
            ↓ CSV
          </button>
          <button
            onClick={handleDedupPreview}
            className="border border-neutral-200 text-neutral-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest hover:border-amber-400 hover:text-amber-600 transition-colors"
          >
            Limpiar duplicados
          </button>
          <button
            onClick={openNew}
            className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors"
          >
            + Nueva factura
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-3 border-b border-neutral-100 pb-3">
        {(['todas', 'facturas', 'obra', 'legal', 'admin', 'otros'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={filterBtnCls(categoryFilter === cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
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
                <th className={thCls('number')} onClick={() => handleSort('number')}>Nº{sortIcon('number')}</th>
                <th className={thCls('direction')} onClick={() => handleSort('direction')}>Tipo{sortIcon('direction')}</th>
                <th className={`hidden sm:table-cell ${thCls('concept')}`} onClick={() => handleSort('concept')}>Concepto{sortIcon('concept')}</th>
                <th className={`hidden md:table-cell ${thCls('amount_base')}`} onClick={() => handleSort('amount_base')}>Base{sortIcon('amount_base')}</th>
                <th className={`hidden md:table-cell ${thCls('vat_amount')}`} onClick={() => handleSort('vat_amount')}>IVA{sortIcon('vat_amount')}</th>
                <th className={thCls('amount_total')} onClick={() => handleSort('amount_total')}>Total{sortIcon('amount_total')}</th>
                <th className={`hidden sm:table-cell ${thCls('issue_date')}`} onClick={() => handleSort('issue_date')}>Fecha{sortIcon('issue_date')}</th>
                <th className={`hidden sm:table-cell ${thCls('due_date')}`} onClick={() => handleSort('due_date')}>Vencimiento{sortIcon('due_date')}</th>
                <th className={thCls('payment_status')} onClick={() => handleSort('payment_status')}>Estado{sortIcon('payment_status')}</th>
                <th className="px-4 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-sm text-neutral-400">
                    Sin resultados
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
                    <td className="hidden sm:table-cell px-4 py-3 text-sm max-w-[200px] truncate">{inv.concept}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm tabular-nums text-right">{formatEur(inv.amount_base)}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm tabular-nums text-right">{formatEur(inv.vat_amount)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-semibold">{formatEur(inv.amount_total)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm whitespace-nowrap">{formatDate(inv.issue_date)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm whitespace-nowrap">
                      <DueDate date={inv.due_date} status={inv.payment_status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={inv.payment_status} />
                        {inv.needs_review && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                            Revisar
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {inv.payment_status === 'pendiente' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markAsPaid(inv, e) }}
                            className="text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-800 whitespace-nowrap"
                          >
                            Marcar pagada
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(inv) }}
                          className="text-neutral-300 hover:text-red-500 transition-colors"
                          title="Eliminar factura"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
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

      {/* Dedup preview modal */}
      {dedupPreview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg p-6 shadow-xl flex flex-col max-h-[80vh]">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Limpiar duplicados</h2>
            {dedupPreview.length === 0 ? (
              <>
                <p className="text-sm text-neutral-500 mb-6">No se han encontrado facturas duplicadas.</p>
                <div className="flex justify-end">
                  <button onClick={() => setDedupPreview(null)} className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-neutral-200 text-neutral-500 hover:border-neutral-400">
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-600 mb-1">
                  Se eliminarán <span className="font-semibold text-red-600">{dedupPreview.length} facturas</span> con concepto e importe idénticos. Se conserva una por grupo.
                </p>
                <p className="text-xs text-neutral-400 mb-4">Prioridad: se conserva la que tiene enlace a Drive; si no, la más antigua.</p>
                <div className="overflow-y-auto flex-1 border border-neutral-100 divide-y divide-neutral-50 mb-6">
                  {dedupPreview.map((inv) => (
                    <div key={inv.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                      <span className="truncate text-neutral-700">{inv.concept || '--'}</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">{formatEur(inv.amount_total)}</span>
                      <span className="whitespace-nowrap text-neutral-400">{formatDate(inv.issue_date)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setDedupPreview(null)}
                    disabled={deduping}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-neutral-200 text-neutral-500 hover:border-neutral-400 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDedupConfirm}
                    disabled={deduping}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deduping ? 'Eliminando...' : `Eliminar ${dedupPreview.length} duplicadas`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-6 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4">Eliminar factura</h2>
            <p className="text-sm text-neutral-600 mb-2">
              ¿Eliminar esta factura? Esta acción no se puede deshacer.
            </p>
            <div className="bg-neutral-50 rounded p-3 mb-6 text-sm space-y-1">
              <div className="font-medium truncate">{deleteConfirm.concept || '--'}</div>
              <div className="text-neutral-500 flex gap-4">
                <span>{formatDate(deleteConfirm.issue_date)}</span>
                <span className="font-semibold">{formatEur(deleteConfirm.amount_total)}</span>
                <span>{deleteConfirm.number || ''}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-neutral-200 text-neutral-500 hover:border-neutral-400 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
