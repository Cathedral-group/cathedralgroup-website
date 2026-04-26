'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import InvoiceForm from './InvoiceForm'

type SortField = 'number' | 'direction' | 'concept' | 'amount_base' | 'vat_amount' | 'amount_total' | 'issue_date' | 'due_date' | 'payment_status' | 'created_at'

const INVOICE_DOC_TYPES = ['factura', 'proforma', 'rectificativa', 'abono', 'ticket', 'justificante_pago']

interface Invoice {
  id?: string
  direction: string
  doc_type: string
  number: string
  empresa?: string | null
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
  project_id?: string | null
  supplier_nif: string | null
  categoria_gasto: string | null
  es_rectificativa: boolean
  numero_factura_original: string | null
  linked_invoice_id?: string | null
  es_gasto_general?: boolean | null
  linea_estructura?: string | null
  notes: string | null
  needs_review?: boolean | null
  review_status?: string | null
  ai_confidence?: number | null
  ai_razones?: string[] | null
  source?: string | null
  email_message_id?: string | null
  email_account?: string | null
  file_hash?: string | null
  drive_url?: string | null
  drive_file_id?: string | null
  original_filename?: string | null
  sent_at?: string | null
  sent_channel?: string | null
  due_date_estimated?: boolean | null
  direccion_obra?: string | null
  tipo_operacion_iva?: string | null
  created_at?: string | null
}

interface InvoicesViewProps {
  initialData: Invoice[]
  projects: { value: string; label: string }[]
  suppliers: { value: string; label: string }[]
  pageTitle?: string
  allTypes?: boolean  // si true, muestra todos los tipos (usado en /archivo)
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
    cobrada: 'bg-green-100 text-green-700',
    vencida: 'bg-red-100 text-red-700',
    parcial: 'bg-purple-100 text-purple-700',
    cancelada: 'bg-neutral-100 text-neutral-500',
  }
  const label: Record<string, string> = {
    cobrada: 'pagada',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'bg-neutral-100 text-neutral-500'}`}
    >
      {label[status] ?? status}
    </span>
  )
}

function DueDate({ date, status, estimated }: { date: string | null; status: string; estimated?: boolean | null }) {
  if (!date) return <span className="text-neutral-300">--</span>
  if (status === 'pagada') return <span className={estimated ? 'text-neutral-400' : ''}>{formatDate(date)}{estimated ? ' *' : ''}</span>

  const days = daysUntil(date)
  let color = estimated ? 'text-neutral-400' : 'text-green-600'
  if (!estimated && days !== null) {
    if (days < 0) color = 'text-red-600 font-semibold'
    else if (days < 7) color = 'text-red-500'
    else if (days <= 15) color = 'text-amber-500'
  }
  return <span className={color} title={estimated ? 'Fecha estimada (+21 días)' : undefined}>{formatDate(date)}{estimated ? ' *' : ''}</span>
}

// Parse §PROYECTO_SUGERIDO:CODE:CONF%:RAZON from ai_razones array
function parseSugerido(razones: string[] | null | undefined): { code: string; conf: number; razon: string } | null {
  if (!razones) return null
  for (const r of razones) {
    if (r.startsWith('§PROYECTO_SUGERIDO:')) {
      const parts = r.replace('§PROYECTO_SUGERIDO:', '').split(':')
      if (parts.length >= 1) {
        const code = parts[0]
        const conf = parts[1] ? parseFloat(parts[1]) / 100 : 0
        const razon = parts.slice(2).join(':')
        return { code, conf, razon }
      }
    }
  }
  return null
}

// Parse §FECHA_ERROR / §FECHA_REVISION from ai_razones (validación añadida 26/04/2026)
function parseFechaAlert(razones: string[] | null | undefined): { level: 'error' | 'review'; reason: string } | null {
  if (!razones) return null
  for (const r of razones) {
    if (r.startsWith('§FECHA_ERROR:')) return { level: 'error', reason: r.replace('§FECHA_ERROR:', '') }
    if (r.startsWith('§FECHA_REVISION:')) return { level: 'review', reason: r.replace('§FECHA_REVISION:', '') }
  }
  return null
}

// Parse §CALIDAD_BAJA / §MANUSCRITO / §CAMPO_DUDOSO:campo:conf:valor from ai_razones
type CalidadAlert = {
  type: 'calidad_baja' | 'manuscrito' | 'campos_dudosos'
  reason: string
  campos?: { name: string; conf: string; valor: string }[]
}
function parseCalidadAlert(razones: string[] | null | undefined): CalidadAlert | null {
  if (!razones) return null
  let calidadBaja: string | null = null
  let manuscrito: string | null = null
  const campos: { name: string; conf: string; valor: string }[] = []
  for (const r of razones) {
    if (r.startsWith('§CALIDAD_BAJA:')) calidadBaja = r.replace('§CALIDAD_BAJA:', '')
    else if (r.startsWith('§MANUSCRITO:')) manuscrito = r.replace('§MANUSCRITO:', '')
    else if (r.startsWith('§CAMPO_DUDOSO:')) {
      const parts = r.replace('§CAMPO_DUDOSO:', '').split(':')
      if (parts.length >= 3) campos.push({ name: parts[0], conf: parts[1], valor: parts.slice(2).join(':') })
    }
  }
  // Prioridad: manuscrito > calidad_baja > campos_dudosos (el más específico va primero)
  if (manuscrito) return { type: 'manuscrito', reason: manuscrito, campos: campos.length ? campos : undefined }
  if (calidadBaja) return { type: 'calidad_baja', reason: calidadBaja, campos: campos.length ? campos : undefined }
  if (campos.length > 0) {
    const summary = campos.map(c => `${c.name} (${(parseFloat(c.conf) * 100).toFixed(0)}%): ${c.valor}`).join(' | ')
    return { type: 'campos_dudosos', reason: 'Campos dudosos: ' + summary, campos }
  }
  return null
}

export default function InvoicesView({ initialData, projects, suppliers, pageTitle, allTypes = false }: InvoicesViewProps) {
  const router = useRouter()
  const [data, setData] = useState<Invoice[]>(initialData)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState(false)

  // Sync state when server sends fresh data after router.refresh()
  useEffect(() => {
    setData(initialData)
  }, [initialData])

  const [formOpen, setFormOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dedupPreview, setDedupPreview] = useState<Invoice[] | null>(null)
  const [deduping, setDeduping] = useState(false)

  // Filters — sincronizados con query strings del URL (sidebar drill-down)
  const searchParams = useSearchParams()
  const dirFromUrl = (searchParams?.get('direccion') as 'emitida' | 'recibida' | null) ?? 'todas'
  const alertaFromUrl = (searchParams?.get('alerta') as 'errores' | 'manuscritos' | 'mala_calidad' | 'datos_dudosos' | 'fecha_alerta' | 'importe_alerta' | null) ?? 'todos'
  const [dirFilter, setDirFilter] = useState<'todas' | 'emitida' | 'recibida'>(dirFromUrl as 'todas' | 'emitida' | 'recibida')
  const [statusFilter, setStatusFilter] = useState<'todas' | 'pendiente' | 'pagada' | 'vencida'>('todas')
  const [reviewFilter, setReviewFilter] = useState<'todos' | 'errores' | 'manuscritos' | 'mala_calidad' | 'datos_dudosos' | 'fecha_alerta' | 'importe_alerta'>(alertaFromUrl as 'todos' | 'errores' | 'manuscritos' | 'mala_calidad' | 'datos_dudosos' | 'fecha_alerta' | 'importe_alerta')
  // Sync con URL cuando cambia desde sidebar
  useEffect(() => {
    const newDir = (searchParams?.get('direccion') as 'emitida' | 'recibida' | null) ?? 'todas'
    const newAlerta = (searchParams?.get('alerta') as 'errores' | 'manuscritos' | 'mala_calidad' | 'datos_dudosos' | 'fecha_alerta' | 'importe_alerta' | null) ?? 'todos'
    if (newDir !== dirFilter) setDirFilter(newDir as 'todas' | 'emitida' | 'recibida')
    if (newAlerta !== reviewFilter) setReviewFilter(newAlerta as 'todos' | 'errores' | 'manuscritos' | 'mala_calidad' | 'datos_dudosos' | 'fecha_alerta' | 'importe_alerta')
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState('')
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)

  // Sort: default by entry date descending
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Maps for resolving names — must be defined BEFORE filtered useMemo
  const supplierMap = useMemo(() => {
    const m: Record<string, string> = {}
    suppliers.forEach(s => {
      const name = s.label.includes(' - ') ? s.label.split(' - ').slice(1).join(' - ') : s.label
      if (s.value) m[s.value] = name
    })
    return m
  }, [suppliers])

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {}
    projects.forEach(p => {
      if (p.value) m[p.value] = p.label
    })
    return m
  }, [projects])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'issue_date' || field === 'due_date' || field === 'created_at' ? 'desc' : 'asc')
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
      if (!allTypes && !INVOICE_DOC_TYPES.includes(inv.doc_type)) return false
      if (dirFilter !== 'todas' && inv.direction !== dirFilter) return false
      if (reviewFilter !== 'todos') {
        const razones = inv.ai_razones || []
        const has = (prefix: string) => razones.some(r => r.startsWith(prefix))
        if (reviewFilter === 'errores' && inv.review_status !== 'error') return false
        if (reviewFilter === 'manuscritos' && !has('§MANUSCRITO:')) return false
        if (reviewFilter === 'mala_calidad' && !has('§CALIDAD_BAJA:')) return false
        if (reviewFilter === 'datos_dudosos' && !has('§CAMPO_DUDOSO:')) return false
        if (reviewFilter === 'fecha_alerta' && !has('§FECHA_ERROR:') && !has('§FECHA_REVISION:')) return false
        if (reviewFilter === 'importe_alerta' && !has('§IMPORTE_ERROR:') && !has('§IMPORTE_REVISION:')) return false
      }
      if (statusFilter !== 'todas') {
        if (statusFilter === 'vencida') {
          const isVencida = inv.payment_status === 'vencida' ||
            (inv.payment_status === 'pendiente' && !!inv.due_date && new Date(inv.due_date + 'T00:00:00') < new Date())
          if (!isVencida) return false
        } else if (statusFilter === 'pagada') {
          if (inv.payment_status !== 'pagada' && inv.payment_status !== 'cobrada') return false
        } else {
          if (inv.payment_status !== statusFilter) return false
        }
      }
      if (search) {
        const q = search.toLowerCase()
        const haystack = `${inv.number} ${inv.concept} ${inv.empresa ?? ''} ${inv.supplier_nif ?? ''} ${inv.proyecto_code ?? ''} ${inv.project_id ? (projectMap[inv.project_id] ?? '') : ''}`.toLowerCase()
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
        case 'created_at':
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [data, dirFilter, statusFilter, reviewFilter, search, sortField, sortDir, projectMap, allTypes])

  // Counts por badge (independent of other filters except allTypes)
  const reviewCounts = useMemo(() => {
    const baseList = data.filter((inv) => allTypes || INVOICE_DOC_TYPES.includes(inv.doc_type))
    const has = (inv: Invoice, prefix: string) => (inv.ai_razones || []).some(r => r.startsWith(prefix))
    return {
      errores:        baseList.filter((inv) => inv.review_status === 'error').length,
      manuscritos:    baseList.filter((inv) => has(inv, '§MANUSCRITO:')).length,
      mala_calidad:   baseList.filter((inv) => has(inv, '§CALIDAD_BAJA:')).length,
      datos_dudosos:  baseList.filter((inv) => has(inv, '§CAMPO_DUDOSO:')).length,
      fecha_alerta:   baseList.filter((inv) => has(inv, '§FECHA_ERROR:') || has(inv, '§FECHA_REVISION:')).length,
      importe_alerta: baseList.filter((inv) => has(inv, '§IMPORTE_ERROR:') || has(inv, '§IMPORTE_REVISION:')).length,
      total:          baseList.length,
    }
  }, [data, allTypes])


  const openNew = () => {
    setEditingInvoice(null)
    setFormOpen(true)
  }

  const exportCSV = () => {
    const headers = ['Número','Empresa','Tipo','Dirección','Concepto','Base','IVA%','IVA','IRPF%','IRPF','Total','Emisión','Vencimiento','Fecha pago','Estado pago','Método pago','Proyecto','Proveedor NIF','Categoría gasto','Rectificativa','Factura original','Notas']
    const rows = filtered.map((inv) => [
      inv.number, inv.empresa ?? '', inv.doc_type, inv.direction, inv.concept,
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

  const handleSaved = useCallback((inv: Invoice, isNew: boolean) => {
    if (isNew) {
      setData((prev) => [inv, ...prev])
    } else {
      setData((prev) => prev.map((r) => r.id === inv.id ? inv : r))
    }
    setFormOpen(false)
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 3000)
    router.refresh() // Sync server state
  }, [router])

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

  const confirmProject = async (inv: Invoice, code: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!inv.id) return
    setConfirmingId(inv.id)
    // Find UUID from project code
    const proj = projects.find(p => {
      const labelCode = p.label.includes(' - ') ? p.label.split(' - ')[0] : p.label
      return labelCode.trim().toUpperCase() === code.trim().toUpperCase()
    })
    try {
      const res = await fetch('/api/db/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: inv.id,
          project_id: proj?.value ?? null,
          proyecto_code: code,
          needs_review: false,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const { data: updated } = await res.json()
      setData(prev => prev.map(r => r.id === inv.id
        ? (updated ?? { ...r, project_id: proj?.value ?? null, proyecto_code: code, needs_review: false }) as Invoice
        : r
      ))
    } catch (err) {
      alert('Error al confirmar proyecto: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setConfirmingId(null)
    }
  }

  const markAsPaid = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    // Confirmación reforzada si la factura tiene alertas IA pendientes de revisión
    if (inv.needs_review || inv.review_status === 'error') {
      const calidadAlert = parseCalidadAlert(inv.ai_razones)
      const fechaAlert = parseFechaAlert(inv.ai_razones)
      const importeAlerts = (inv.ai_razones || []).filter(r => r.startsWith('§IMPORTE_'))
      const alertList: string[] = []
      if (calidadAlert?.type === 'manuscrito') alertList.push('• ✋ Documento manuscrito (riesgo de error en dígitos)')
      else if (calidadAlert?.type === 'calidad_baja') alertList.push('• 📷 Calidad de imagen baja')
      if (calidadAlert?.campos?.length) {
        for (const c of calidadAlert.campos) {
          alertList.push(`• ❓ ${c.name}: ${c.valor} (confianza ${(parseFloat(c.conf) * 100).toFixed(0)}%)`)
        }
      }
      if (fechaAlert) alertList.push(`• 📅 ${fechaAlert.reason}`)
      for (const ir of importeAlerts) {
        alertList.push(`• 💰 ${ir.replace(/^§IMPORTE_(ERROR|REVISION):/, '')}`)
      }
      if (inv.review_status === 'error') alertList.push('• ❌ Documento con error de procesado del workflow')
      const totalFmt = formatEur(inv.amount_total)
      const msg = `⚠ Esta factura tiene alertas pendientes de revisión:\n\n${alertList.join('\n') || '• Marcada para revisión por GPT'}\n\n¿Confirmar que quieres marcarla como PAGADA por ${totalFmt}?\n\nVerifica visualmente que los datos extraídos coinciden con el documento original antes de continuar.`
      if (!confirm(msg)) return
    }
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

  const reprocessInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!inv.id) return
    if (!confirm(`¿Reprocesar este documento?\n\nSe eliminará la fila actual y se intentará procesar el email original (${inv.email_account || 'desconocido'}) de nuevo con el workflow.\n\nEsta acción no se puede deshacer.`)) return
    setReprocessingId(inv.id)
    try {
      const res = await fetch('/api/invoices/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const result = await res.json()
      setData((prev) => prev.filter((r) => r.id !== inv.id))
      const msg = result.workflow_triggered
        ? `✓ Fila eliminada. El email volverá a procesarse automáticamente en el próximo poll de Gmail (5 min).`
        : `✓ Fila eliminada. ${result.message || 'Reenvía el email manualmente para reintentar.'}`
      alert(msg)
    } catch (err) {
      console.error('reprocessInvoice:', err)
      alert('Error al reprocesar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setReprocessingId(null)
    }
  }

  const filterBtnCls = (active: boolean) =>
    `px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors rounded ${
      active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-600'
    }`

  return (
    <div>
      {/* Save toast */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 z-[100] bg-green-600 text-white px-5 py-3 text-sm font-bold uppercase tracking-widest shadow-lg">
          ✓ Guardado
        </div>
      )}
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide">{pageTitle ?? 'Facturas'}</h1>
        <div className="flex gap-2">
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

      {/* Breadcrumb / vista actual + filtros secundarios.
          Los filtros principales (dirección + alertas IA) viven ahora en el sidebar drill-down. */}
      <div className="border-b border-neutral-100 mb-4 pb-3 flex items-center gap-2 text-xs flex-wrap">
        <span className="text-neutral-400">Facturas</span>
        <span className="text-neutral-300">›</span>
        <span className="font-bold text-primary">
          {dirFilter === 'todas' ? 'Todas' : dirFilter === 'emitida' ? 'Emitidas (cobros)' : 'Recibidas (pagos)'}
        </span>
        {reviewFilter !== 'todos' && (
          <>
            <span className="text-neutral-300">·</span>
            <span className="font-semibold text-amber-700">
              {reviewFilter === 'errores' && '❌ Errores'}
              {reviewFilter === 'manuscritos' && '✋ Manuscritos'}
              {reviewFilter === 'mala_calidad' && '📷 Mala calidad'}
              {reviewFilter === 'datos_dudosos' && '❓ Datos dudosos'}
              {reviewFilter === 'fecha_alerta' && '📅 Fecha sospechosa'}
              {reviewFilter === 'importe_alerta' && '💰 Importe sospechoso'}
            </span>
          </>
        )}
        <span className="text-neutral-300 ml-auto">{filtered.length} de {data.length}</span>
      </div>

      {/* Filtros secundarios: estado de pago + búsqueda */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1">
          {(['todas', 'pendiente', 'pagada', 'vencida'] as const).map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)} className={filterBtnCls(statusFilter === v)}>
              {v === 'todas' ? 'Todas' : v}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-neutral-200" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nº, concepto, empresa, NIF, proyecto..."
          className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm flex-1 min-w-[200px] max-w-md"
        />
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
                <th className={`hidden sm:table-cell ${thCls('due_date')}`} onClick={() => handleSort('due_date')} title="* = fecha estimada (issue_date + 21 días)">Vencimiento{sortIcon('due_date')} <span className="text-neutral-300 font-normal">ℹ</span></th>
                <th className={thCls('payment_status')} onClick={() => handleSort('payment_status')}>Estado{sortIcon('payment_status')}</th>
                <th className={`hidden lg:table-cell ${thCls('created_at')}`} onClick={() => handleSort('created_at')}>Entrada{sortIcon('created_at')}</th>
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
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono whitespace-nowrap">{inv.number || '--'}</span>
                      {(() => {
                        const displayName = inv.empresa || (inv.supplier_nif ? supplierMap[inv.supplier_nif] : null)
                        return displayName ? (
                          <div className="text-[10px] text-neutral-400 truncate max-w-[120px]" title={displayName}>{displayName}</div>
                        ) : null
                      })()}
                    </td>
                    <td className="px-4 py-3"><DirectionBadge dir={inv.direction} /></td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm max-w-[220px]">
                      <span className="block truncate">{inv.concept}</span>
                      {(inv.project_id || inv.proyecto_code) ? (() => {
                        const label = inv.project_id
                          ? (projectMap[inv.project_id] ?? inv.proyecto_code ?? inv.project_id)
                          : inv.proyecto_code
                        return label ? (
                          <span className="text-[10px] text-neutral-400 truncate block" title={label}>
                            {label}
                          </span>
                        ) : null
                      })() : (() => {
                        const sug = parseSugerido(inv.ai_razones)
                        if (!sug) return null
                        const isConfirming = confirmingId === inv.id
                        return (
                          <button
                            onClick={(e) => confirmProject(inv, sug.code, e)}
                            disabled={isConfirming}
                            title={sug.razon || `Sugerido con ${Math.round(sug.conf * 100)}% confianza`}
                            className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-bold uppercase tracking-wider hover:bg-violet-100 transition-colors disabled:opacity-50 rounded-sm"
                          >
                            {isConfirming ? '...' : `✓ ${sug.code}`}
                          </button>
                        )
                      })()}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm tabular-nums text-right">{formatEur(inv.amount_base)}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm tabular-nums text-right">{formatEur(inv.vat_amount)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-semibold">{formatEur(inv.amount_total)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm whitespace-nowrap">{formatDate(inv.issue_date)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm whitespace-nowrap">
                      <DueDate date={inv.due_date} status={inv.payment_status} estimated={inv.due_date_estimated} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={inv.payment_status} />
                        {(() => {
                          const fechaAlert = parseFechaAlert(inv.ai_razones)
                          const calidadAlert = parseCalidadAlert(inv.ai_razones)
                          if (inv.review_status === 'error') {
                            return (
                              <span
                                className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700"
                                title={fechaAlert?.reason || inv.concept || 'Error de procesado'}
                              >
                                {fechaAlert ? '📅 Fecha err.' : 'Error procesado'}
                              </span>
                            )
                          }
                          if (inv.needs_review) {
                            // Prioridad de badges: manuscrito > calidad_baja > campos_dudosos > fecha > genérico
                            if (calidadAlert?.type === 'manuscrito') {
                              return (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700"
                                  title={calidadAlert.reason + (calidadAlert.campos ? '\n\nCampos dudosos:\n' + calidadAlert.campos.map(c => `• ${c.name}: ${c.valor} (conf ${(parseFloat(c.conf)*100).toFixed(0)}%)`).join('\n') : '')}>
                                  ✋ Manuscrito
                                </span>
                              )
                            }
                            if (calidadAlert?.type === 'calidad_baja') {
                              return (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700"
                                  title={calidadAlert.reason + (calidadAlert.campos ? '\n\nCampos dudosos:\n' + calidadAlert.campos.map(c => `• ${c.name}: ${c.valor} (conf ${(parseFloat(c.conf)*100).toFixed(0)}%)`).join('\n') : '')}>
                                  📷 Mala calidad
                                </span>
                              )
                            }
                            if (calidadAlert?.type === 'campos_dudosos') {
                              return (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-100 text-yellow-700"
                                  title={calidadAlert.reason}>
                                  ❓ Datos dudosos
                                </span>
                              )
                            }
                            if (fechaAlert) {
                              return (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700"
                                  title={fechaAlert.reason}>
                                  📅 Revisar fecha
                                </span>
                              )
                            }
                            return (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700"
                                title="Revisar">
                                Revisar
                              </span>
                            )
                          }
                          return null
                        })()}
                        {inv.es_rectificativa && !inv.linked_invoice_id && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
                            Sin vincular
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {inv.review_status === 'error' && (
                          <button
                            onClick={(e) => reprocessInvoice(inv, e)}
                            disabled={reprocessingId === inv.id}
                            className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:text-blue-800 whitespace-nowrap disabled:opacity-50"
                            title="Eliminar y volver a procesar este documento desde el email original"
                          >
                            {reprocessingId === inv.id ? '...' : '🔄 Reprocesar'}
                          </button>
                        )}
                        {inv.payment_status === 'pendiente' && inv.review_status !== 'error' && (
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
          allInvoices={data.filter(inv => inv.id).map(inv => ({
            id: inv.id!,
            number: inv.number,
            concept: inv.concept,
            amount_total: inv.amount_total,
            supplier_nif: inv.supplier_nif,
          }))}
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
