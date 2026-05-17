'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface AiData {
  supplier_name?: string
  supplier_nif?: string
  supplier_address?: string
  amount_base?: number
  vat_pct?: number
  vat_amount?: number
  amount_total?: number
  irpf_rate?: number
  irpf_amount?: number
  payment_status?: string
  payment_method?: string
  iban_proveedor?: string
  plazo_pago_dias?: number
  num_pedido?: string
  direccion_obra?: string
  categoria_gasto?: string
  periodo_facturacion?: string
  retencion_porcentaje?: number
  retencion_importe?: number
  inversion_sujeto_pasivo?: boolean
  proyecto_code?: string
  proyecto_code_sugerido?: string
  proyecto_confianza?: number
  proyecto_razon?: string
  notas_documento?: string
  resumen_ia?: string
  issue_date?: string
  due_date?: string
  number?: string
  concept?: string
  lineas?: Array<{ descripcion?: string; cantidad?: number; precio_unitario?: number; importe?: number; total?: number; iva_pct?: number }>
  error?: string
  [key: string]: unknown
}

interface ReviewItem {
  id: string
  doc_type: string
  direction: string
  number: string | null
  concept: string | null
  empresa: string | null
  amount_total: number | null
  amount_base: number | null
  vat_amount: number | null
  vat_pct: number | null
  irpf_rate: number | null
  irpf_amount: number | null
  issue_date: string | null
  due_date: string | null
  payment_status: string | null
  payment_method: string | null
  iban_proveedor: string | null
  supplier_nif: string | null
  original_filename: string | null
  drive_url: string | null
  ai_confidence: number | null
  ai_provider: string | null
  needs_review: boolean
  review_status: string
  duplicate_reason: string | null
  linked_doc_id: string | null
  project_id?: string | null
  proyecto_code: string | null
  proyecto_confianza: number | null
  categoria_gasto: string | null
  periodo_facturacion: string | null
  es_gasto_general: boolean
  es_rectificativa: boolean
  es_documento_propio: boolean
  created_at: string
  ai_data?: AiData | null
  ai_razones?: string[] | null
  lineas?: AiData['lineas'] | null
  [key: string]: unknown
}

interface PendingDocument {
  id: string
  titulo: string | null
  doc_type: string
  doc_category: string | null
  ai_confidence: number | null
  ai_provider: string | null
  created_at: string
  [key: string]: unknown
}

interface PendingQuote {
  id: string
  number: string | null
  empresa: string | null
  supplier_nif: string | null
  supplier_id: string | null
  project_id: string | null
  proyecto_code: string | null
  concept: string | null
  direccion_obra: string | null
  issue_date: string | null
  valid_until: string | null
  total: number | null
  subtotal: number | null
  vat_total: number | null
  ai_confidence: number | null
  ai_provider: string | null
  needs_review: boolean
  review_status: string
  original_filename: string | null
  drive_url: string | null
  notes: string | null
  resumen_ia: string | null
  ai_data?: AiData | null
  ai_razones?: string[] | null
  items?: AiData['lineas'] | null
  created_at: string
  [key: string]: unknown
}

interface OrphanEmail {
  id: number
  message_id: string
  gmail_account: string
  subject: string | null
  from_address: string | null
  received_at: string | null
  attempt_count: number
  last_attempt_at: string | null
  last_error: string | null
  created_at: string
}

interface ForensicData {
  score: number | null
  pdf_alerts: string[] | null
  email_alerts: string[] | null
  numeracion_alerts: string[] | null
  duplicados_alerts: string[] | null
  decision: string | null
}

interface RevisionViewProps {
  initialData: ReviewItem[]
  pendingDocuments?: PendingDocument[]
  pendingQuotes?: PendingQuote[]
  initialOrphans?: OrphanEmail[]
  forensicByInvoice?: Record<string, ForensicData>
  projects: { value: string; label: string; code?: string }[]
  suppliers: { value: string; label: string }[]
  userEmail?: string
}

// Sincronizado con CHECK constraint invoices.doc_type (cathedral-all.md)
const DOC_TYPES = [
  'factura', 'proforma', 'ticket', 'albaran', 'certificado', 'certificacion',
  'presupuesto', 'contrato', 'nota_simple', 'escritura', 'licencia', 'informe',
  'nomina', 'modelo_fiscal', 'seguro', 'rectificativa', 'abono',
  'justificante_pago', 'otro',
]

// Sincronizado con CHECK constraint invoices.categoria_gasto (18 valores, ampliado sesión 28)
const CATEGORIAS_GASTO: { value: string; label: string }[] = [
  { value: 'material', label: 'Material' },
  { value: 'mano_de_obra', label: 'Mano de obra' },
  { value: 'subcontratas', label: 'Subcontratas' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'comunidad_propietarios', label: 'Comunidad de propietarios' },
  { value: 'suministros', label: 'Suministros (luz/agua/gas/internet)' },
  { value: 'seguros', label: 'Seguros' },
  { value: 'financiero', label: 'Financiero (intereses/comisiones)' },
  { value: 'tributos_locales', label: 'Tributos locales (IBI/IAE)' },
  { value: 'notaria_registro', label: 'Notaría / Registro' },
  { value: 'mobiliario_decoracion', label: 'Mobiliario / Decoración' },
  { value: 'marketing_publicidad', label: 'Marketing / Publicidad' },
  { value: 'desplazamientos_dietas', label: 'Desplazamientos / Dietas' },
  { value: 'software_oficina', label: 'Software / Oficina' },
  { value: 'gestoria_asesoria', label: 'Gestoría / Asesoría' },
  { value: 'comisiones_intermediacion', label: 'Comisiones / Intermediación' },
  { value: 'otros', label: 'Otros' },
]

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined) return '--'
  return Number(val).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '--'
  const dateStr = d.includes('T') ? d : d + 'T00:00:00'
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isInvalidNum(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'number') return false
  if (typeof v !== 'string') return false
  const s = v.trim()
  // Ambiguous: has both comma and dot (e.g. "1.234,56" or "1,234.56")
  if (/,/.test(s) && /\./.test(s)) return true
  // Non-parseable as number
  const n = parseFloat(s.replace(',', '.'))
  if (isNaN(n)) return true
  return false
}

function isInvalidDate(v: unknown): boolean {
  if (!v) return false
  const s = String(v).trim()
  if (/[xX?]/.test(s)) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return true
  return false
}

function AiField({ label, value, raw, span2 = false, type = 'text' }: {
  label: string
  value: string
  raw?: unknown
  span2?: boolean
  type?: 'num' | 'date' | 'text'
}) {
  const invalid = raw !== undefined && raw !== null && (
    type === 'num' ? isInvalidNum(raw) :
    type === 'date' ? isInvalidDate(raw) :
    false
  )
  const missing = (!value || value === '--') && raw === null
  const cls = invalid
    ? 'bg-red-50 text-red-700 border border-red-200 rounded px-1'
    : missing
      ? 'text-amber-600'
      : ''
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <span className="text-neutral-400">{label}:</span>{' '}
      <span className={cls}>
        {invalid ? String(raw) : value}
        {invalid && <span className="ml-1 text-[9px] font-bold uppercase">⚠ revisar</span>}
      </span>
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <span className="text-neutral-400 text-xs">--</span>
  const pct = Math.round(confidence * 100)
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>{pct}%</span>
}

function ReviewBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-700',
    revisado: 'bg-blue-100 text-blue-700',
    confirmado: 'bg-green-100 text-green-700',
    rechazado: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[status] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {status}
    </span>
  )
}

function ProviderBadge({ provider }: { provider: string | null | undefined }) {
  if (!provider) return <span className="text-neutral-400 text-[10px]">--</span>
  const map: Record<string, string> = {
    'gemini': 'bg-violet-100 text-violet-700',
    'gpt-4o': 'bg-emerald-100 text-emerald-700',
    'mistral': 'bg-orange-100 text-orange-700',
  }
  const label: Record<string, string> = {
    'gemini': 'Gemini',
    'gpt-4o': 'GPT-4o',
    'mistral': 'Mistral',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${map[provider] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {label[provider] ?? provider}
    </span>
  )
}

function ForensicBadge({ data }: { data: ForensicData | undefined | null }) {
  if (!data || data.score == null) return <span className="text-neutral-400 text-[10px]">--</span>
  const score = data.score
  const totalAlerts =
    (data.pdf_alerts?.length ?? 0) +
    (data.email_alerts?.length ?? 0) +
    (data.numeracion_alerts?.length ?? 0) +
    (data.duplicados_alerts?.length ?? 0)
  const color = score >= 80 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  const tooltip = totalAlerts > 0 ? `Score forensic ${score}/100 — ${totalAlerts} alerta(s)` : `Score forensic ${score}/100`
  return (
    <span title={tooltip} className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>
      🛡️ {score}{totalAlerts > 0 ? ` ⚠${totalAlerts}` : ''}
    </span>
  )
}

const DOC_CATEGORY_PATH: Record<string, string> = {
  legal: 'escrituras',
  seguros: 'seguros',
  fiscal: 'fiscal',
  laboral: 'laboral',
  flota: 'flota',
  corporativo: 'corporativo',
}

export default function RevisionView({ initialData, pendingDocuments = [], pendingQuotes = [], initialOrphans = [], forensicByInvoice = {}, projects, suppliers, userEmail = 'admin' }: RevisionViewProps) {
  const [items, setItems] = useState<ReviewItem[]>(initialData)
  const [docs, setDocs] = useState<PendingDocument[]>(pendingDocuments)
  const [quotes, setQuotes] = useState<PendingQuote[]>(pendingQuotes)
  const [orphans, setOrphans] = useState<OrphanEmail[]>(initialOrphans)
  const [selected, setSelected] = useState<ReviewItem | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<PendingDocument | null>(null)
  const [selectedQuote, setSelectedQuote] = useState<PendingQuote | null>(null)
  const [editDoc, setEditDoc] = useState<Partial<PendingDocument>>({})
  const [editQuote, setEditQuote] = useState<Partial<PendingQuote>>({})
  const [savingDoc, setSavingDoc] = useState(false)
  const [savingQuote, setSavingQuote] = useState(false)
  const [orphanBusy, setOrphanBusy] = useState<number | null>(null)
  // Categoría sincronizada con sidebar drill-down (?cat=...)
  const searchParams = useSearchParams()
  const catFromUrl = searchParams?.get('cat') ?? 'todos_pendientes'
  const [category, setCategory] = useState<string>(catFromUrl)
  useEffect(() => {
    const newCat = searchParams?.get('cat') ?? 'todos_pendientes'
    if (newCat !== category) setCategory(newCat)
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<ReviewItem>>({})

  const isReenviada = (item: ReviewItem) => item.duplicate_reason === 'reenviada_tras_borrar'

  const daysRemaining = (item: ReviewItem) => {
    if (!isReenviada(item)) return null
    const created = new Date(item.created_at)
    const autoDelete = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
    return Math.max(0, Math.ceil((autoDelete.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  }

  const categorize = (item: ReviewItem) => {
    if (isReenviada(item)) return 'reenviadas'
    if (item.duplicate_reason) return 'duplicados'
    if (item.ai_confidence !== null && item.ai_confidence < 0.5) return 'no_legibles'
    if (item.doc_type === 'otro') return 'sin_clasificar'
    if (!item.supplier_nif && !item.number) return 'datos_incompletos'
    if (item.needs_review) return 'baja_confianza'
    return 'otros'
  }

  const pending = items.filter(i => i.review_status === 'pendiente' || i.review_status === 'revisado')
  const procesadosIA = items.filter(i => i.review_status === 'revisado')
  const counts = {
    todos_pendientes: pending.length,
    procesados_ia: procesadosIA.length,
    duplicados: pending.filter(i => categorize(i) === 'duplicados').length,
    no_legibles: pending.filter(i => categorize(i) === 'no_legibles').length,
    sin_clasificar: pending.filter(i => categorize(i) === 'sin_clasificar').length,
    datos_incompletos: pending.filter(i => categorize(i) === 'datos_incompletos').length,
    baja_confianza: pending.filter(i => categorize(i) === 'baja_confianza').length,
    reenviadas: pending.filter(i => categorize(i) === 'reenviadas').length,
    huerfanos_persistentes: orphans.length,
    documentos_pendientes: docs.length,
    presupuestos_recibidos: quotes.length,
    resueltos: items.filter(i => ['confirmado', 'rechazado', 'error'].includes(i.review_status)).length,
  }

  const sortItems = (list: ReviewItem[]) => {
    const normal = list.filter(i => !isReenviada(i))
    const reenv = list.filter(i => isReenviada(i))
    return [...normal, ...reenv]
  }

  const filteredByCategory = sortItems(
    category === 'resueltos'
      ? items.filter(i => ['confirmado', 'rechazado', 'error'].includes(i.review_status))
      : category === 'todos_pendientes'
        ? pending
        : category === 'procesados_ia'
          ? procesadosIA
          : category === 'reenviadas'
            ? pending.filter(i => isReenviada(i))
            : pending.filter(i => categorize(i) === category)
  )

  const filtered = search.trim()
    ? filteredByCategory.filter(i => {
        const q = search.toLowerCase()
        return (
          (i.original_filename ?? '').toLowerCase().includes(q) ||
          (i.concept ?? '').toLowerCase().includes(q) ||
          (i.supplier_nif ?? '').toLowerCase().includes(q) ||
          (i.number ?? '').toLowerCase().includes(q) ||
          (i.proyecto_code ?? '').toLowerCase().includes(q) ||
          (i.doc_type ?? '').toLowerCase().includes(q)
        )
      })
    : filteredByCategory

  const openItem = (item: ReviewItem) => {
    setSelected(item)
    setEditForm({
      doc_type: item.doc_type,
      number: item.number,
      supplier_nif: item.supplier_nif,
      amount_total: item.amount_total,
      issue_date: item.issue_date,
      due_date: item.due_date,
      payment_status: item.payment_status ?? 'pendiente',
      payment_method: item.payment_method,
      project_id: item.project_id ?? null,
      proyecto_code: item.proyecto_code,
      categoria_gasto: item.categoria_gasto,
      concept: item.concept,
      es_gasto_general: item.es_gasto_general,
      es_rectificativa: item.es_rectificativa,
    })
  }

  const reprocessItem = async () => {
    if (!selected) return
    if (selected.review_status !== 'error') {
      alert('Solo se pueden reprocesar documentos con estado "error".')
      return
    }
    if (!confirm(`¿Reprocesar este documento?\n\nSe eliminará el placeholder actual. El email original (${selected.email_account || 'desconocido'}) deberá reenviarse para que el workflow lo procese de nuevo.\n\nEsta acción no se puede deshacer.`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/invoices/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      const result = await res.json()
      setItems(prev => prev.filter(i => i.id !== selected.id))
      setSelected(null)
      alert(result.message || '✓ Placeholder eliminado. Reenvía el email para reprocesar.')
    } catch (err) {
      alert('Error al reprocesar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const [quickConfirming, setQuickConfirming] = useState<string | null>(null)

  const quickConfirm = async (item: ReviewItem) => {
    if (quickConfirming) return
    setQuickConfirming(item.id)
    try {
      const res = await fetch('/api/db/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          review_status: 'confirmado',
          reviewed_at: new Date().toISOString(),
          reviewed_by: userEmail,
          needs_review: false,
        }),
      })
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, review_status: 'confirmado', needs_review: false }
              : i,
          ),
        )
      } else {
        const err = await res.json().catch(() => ({}))
        alert(`Error: ${err.error ?? res.statusText}`)
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setQuickConfirming(null)
    }
  }

  const saveAndApprove = async (status: 'confirmado' | 'rechazado') => {
    if (!selected) return
    setSaving(true)
    try {
      const nif = editForm.supplier_nif || null
      const body = {
        id: selected.id,
        ...editForm,
        supplier_nif: nif,
        number: editForm.number || null,
        review_status: status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userEmail,
        needs_review: false,
        due_date: editForm.due_date ?? selected.due_date ?? null,
        payment_status: editForm.payment_status ?? selected.payment_status ?? 'pendiente',
        payment_method: editForm.payment_method ?? selected.payment_method ?? null,
        es_rectificativa: editForm.es_rectificativa ?? selected.es_rectificativa ?? false,
        // Persistir campos financieros del item original si no están en editForm
        vat_pct: editForm.vat_pct ?? selected.vat_pct ?? null,
        vat_amount: editForm.vat_amount ?? selected.vat_amount ?? null,
        amount_base: editForm.amount_base ?? selected.amount_base ?? null,
        irpf_rate: editForm.irpf_rate ?? selected.irpf_rate ?? null,
        irpf_amount: editForm.irpf_amount ?? selected.irpf_amount ?? null,
        // Persistir líneas de factura desde ai_data si existen
        lineas: selected.ai_data?.lineas ?? selected.lineas ?? null,
      }

      // Auto-crear proveedor si confirmamos y hay NIF que aún no está en la tabla
      if (status === 'confirmado' && nif) {
        const supplierName =
          selected.ai_data?.supplier_name ||
          selected.empresa ||
          null
        if (supplierName) {
          // Intentamos upsert por NIF — si ya existe, no hace nada (onConflict ignore)
          await fetch('/api/db/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nif,
              name: supplierName,
              ...(selected.ai_data?.supplier_address ? { address: selected.ai_data.supplier_address } : {}),
              ...(selected.ai_data?.iban_proveedor ? { bank_account: selected.ai_data.iban_proveedor } : {}),
              _upsert_on_conflict: 'nif',  // ignorar si ya existe
            }),
          })
        }
      }

      const res = await fetch('/api/db/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === selected.id ? { ...i, ...body } as ReviewItem : i))
        setSelected(null)
      } else {
        const errBody = await res.json().catch(() => ({}))
        alert('Error al guardar: ' + (errBody.error || `Error ${res.status}`))
      }
    } finally {
      setSaving(false)
    }
  }

  const openDoc = (doc: PendingDocument) => {
    setSelectedDoc(doc)
    setEditDoc({
      titulo: doc.titulo,
      doc_type: doc.doc_type,
      doc_category: doc.doc_category,
      fecha_documento: (doc.fecha_documento as string | null | undefined) ?? null,
      proyecto_code: (doc.proyecto_code as string | null | undefined) ?? null,
      project_id: (doc.project_id as string | null | undefined) ?? null,
      notes: (doc.notes as string | null | undefined) ?? null,
    })
  }

  const saveDoc = async (status: 'confirmado' | 'rechazado') => {
    if (!selectedDoc) return
    setSavingDoc(true)
    try {
      const body = {
        id: selectedDoc.id,
        ...editDoc,
        review_status: status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userEmail,
        needs_review: false,
      }
      const res = await fetch('/api/db/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== selectedDoc.id))
        setSelectedDoc(null)
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al guardar: ' + (err.error || `Error ${res.status}`))
      }
    } finally {
      setSavingDoc(false)
    }
  }

  const openQuote = (q: PendingQuote) => {
    setSelectedQuote(q)
    setEditQuote({
      number: q.number,
      empresa: q.empresa,
      supplier_nif: q.supplier_nif,
      project_id: q.project_id,
      proyecto_code: q.proyecto_code,
      concept: q.concept,
      direccion_obra: q.direccion_obra,
      issue_date: q.issue_date,
      valid_until: q.valid_until,
      total: q.total,
      subtotal: q.subtotal,
      vat_total: q.vat_total,
      notes: q.notes,
    })
  }

  const saveQuote = async (status: 'confirmado' | 'rechazado') => {
    if (!selectedQuote) return
    setSavingQuote(true)
    try {
      const nif = (editQuote.supplier_nif as string | null | undefined) || null
      const body = {
        id: selectedQuote.id,
        ...editQuote,
        supplier_nif: nif,
        number: editQuote.number || null,
        review_status: status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userEmail,
        needs_review: false,
      }

      // Auto-crear proveedor si confirmamos y hay NIF nuevo
      if (status === 'confirmado' && nif) {
        const supplierName = selectedQuote.ai_data?.supplier_name || selectedQuote.empresa || null
        if (supplierName) {
          await fetch('/api/db/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nif,
              name: supplierName,
              ...(selectedQuote.ai_data?.supplier_address ? { address: selectedQuote.ai_data.supplier_address } : {}),
              ...(selectedQuote.ai_data?.iban_proveedor ? { bank_account: selectedQuote.ai_data.iban_proveedor } : {}),
              _upsert_on_conflict: 'nif',
            }),
          })
        }
      }

      const res = await fetch('/api/db/quotes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setQuotes(prev => prev.filter(q => q.id !== selectedQuote.id))
        setSelectedQuote(null)
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al guardar: ' + (err.error || `Error ${res.status}`))
      }
    } finally {
      setSavingQuote(false)
    }
  }

  const categories: { key: string; label: string; color: string }[] = [
    { key: 'todos_pendientes', label: 'Todos pendientes', color: 'bg-amber-100 text-amber-700' },
    { key: 'procesados_ia', label: 'Procesados IA', color: 'bg-blue-100 text-blue-700' },
    { key: 'duplicados', label: 'Duplicados', color: 'bg-red-100 text-red-700' },
    { key: 'no_legibles', label: 'No legibles', color: 'bg-orange-100 text-orange-700' },
    { key: 'sin_clasificar', label: 'Sin clasificar', color: 'bg-purple-100 text-purple-700' },
    { key: 'datos_incompletos', label: 'Datos incompletos', color: 'bg-blue-100 text-blue-700' },
    { key: 'baja_confianza', label: 'Baja confianza', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'reenviadas', label: 'Reenviadas', color: 'bg-neutral-200 text-neutral-500' },
    { key: 'huerfanos_persistentes', label: 'Huérfanos persistentes', color: 'bg-red-100 text-red-700' },
    { key: 'documentos_pendientes', label: 'Documentos pendientes', color: 'bg-violet-100 text-violet-700' },
    { key: 'presupuestos_recibidos', label: 'Presupuestos recibidos', color: 'bg-cyan-100 text-cyan-700' },
    { key: 'resueltos', label: 'Resueltos', color: 'bg-green-100 text-green-700' },
  ]

  const ignoreOrphan = async (id: number) => {
    if (!confirm('¿Marcar este huérfano como ignorado?\n\nEl cron auditor no volverá a intentar reprocesarlo automáticamente.')) return
    setOrphanBusy(id)
    try {
      const res = await fetch(`/api/audit/email-coverage/${id}/ignore`, { method: 'POST' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      setOrphans(prev => prev.filter(o => o.id !== id))
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'desconocido'))
    } finally {
      setOrphanBusy(null)
    }
  }

  const retryOrphan = async (id: number) => {
    if (!confirm('¿Reintentar este huérfano?\n\nEl próximo ciclo del cron auditor (n8n) volverá a intentar inyectarlo en el workflow.')) return
    setOrphanBusy(id)
    try {
      const res = await fetch(`/api/audit/email-coverage/${id}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      setOrphans(prev => prev.filter(o => o.id !== id))
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'desconocido'))
    } finally {
      setOrphanBusy(null)
    }
  }

  const ai = selected?.ai_data

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-800">Revisión</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {counts.todos_pendientes} facturas pendientes · {counts.procesados_ia} procesadas por IA · {counts.documentos_pendientes} documentos · {counts.huerfanos_persistentes} huérfanos
        </p>
      </div>

      {/* Search + Category chips */}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por archivo, concepto, NIF, proyecto..."
          className="flex-1 bg-neutral-50 border border-neutral-200 focus:ring-1 focus:ring-primary focus:outline-none px-4 py-2 text-sm"
        />
        {search && (
          <span className="text-xs text-neutral-400 whitespace-nowrap">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map(cat => {
          const count = counts[cat.key as keyof typeof counts] || 0
          if (count === 0 && cat.key !== 'todos_pendientes' && cat.key !== 'resueltos') return null
          const isActive = category === cat.key
          return (
            <button key={cat.key} onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive ? cat.color + ' ring-2 ring-offset-1 ring-neutral-300' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}>
              {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Tabla documentos pendientes */}
      {category === 'documentos_pendientes' && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 text-xs text-violet-700">
            <strong>Documentos pendientes de revisión:</strong> filas de la tabla <code>documents</code> (escrituras, contratos, licencias, seguros, fiscal, laboral, flota, corporativo) detectadas por IA pero sin clasificar/titular. Click en una fila para ver datos extraídos.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Título / Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Categoría</th>
                  <th className="text-center p-3 font-medium text-neutral-600">IA</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Modelo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Fecha</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => (
                  <tr key={doc.id} onClick={() => openDoc(doc)}
                    className="border-b cursor-pointer hover:bg-neutral-50">
                    <td className="p-3">
                      <div className="text-sm font-medium text-neutral-800">{doc.titulo || `(sin título)`}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 font-bold uppercase">{doc.doc_type}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {doc.doc_category ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold uppercase">{doc.doc_category}</span>
                      ) : (
                        <span className="text-neutral-400">--</span>
                      )}
                    </td>
                    <td className="p-3 text-center"><ConfidenceBadge confidence={doc.ai_confidence} /></td>
                    <td className="p-3 text-center"><ProviderBadge provider={doc.ai_provider} /></td>
                    <td className="p-3 text-xs">{formatDate(doc.created_at)}</td>
                    <td className="p-3 text-right">
                      {(doc.drive_url as string | undefined) && (
                        <a href={doc.drive_url as string} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-blue-600 hover:underline mr-2">Drive ↗</a>
                      )}
                      <button onClick={e => { e.stopPropagation(); openDoc(doc) }}
                        className="text-xs bg-violet-600 text-white px-2.5 py-1 rounded hover:bg-violet-700">
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
                {docs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-400">
                      No hay documentos pendientes ✓
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla presupuestos recibidos */}
      {category === 'presupuestos_recibidos' && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 bg-cyan-50 border-b border-cyan-100 text-xs text-cyan-700">
            <strong>Presupuestos recibidos:</strong> filas de la tabla <code>quotes</code> con <code>direction=&apos;recibida&apos;</code> detectadas por IA. Confirma o rechaza cada presupuesto.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Archivo / Concepto</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Proveedor</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Total</th>
                  <th className="text-center p-3 font-medium text-neutral-600">IA</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Modelo</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Estado</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Emisión</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} onClick={() => openQuote(q)}
                    className="border-b cursor-pointer hover:bg-neutral-50">
                    <td className="p-3">
                      <div className="max-w-[220px] truncate text-xs font-mono">{q.original_filename || '--'}</div>
                      {q.concept && (
                        <div className="max-w-[220px] truncate text-[11px] text-neutral-400 mt-0.5">{q.concept}</div>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{q.ai_data?.supplier_name || q.empresa || q.supplier_nif || '--'}</div>
                      {q.supplier_nif && (
                        <div className="text-neutral-400 font-mono text-[10px]">{q.supplier_nif}</div>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{formatEur(q.total)}</td>
                    <td className="p-3 text-center"><ConfidenceBadge confidence={q.ai_confidence} /></td>
                    <td className="p-3 text-center"><ProviderBadge provider={q.ai_provider} /></td>
                    <td className="p-3 text-center"><ReviewBadge status={q.review_status} /></td>
                    <td className="p-3 text-xs">{formatDate(q.issue_date)}</td>
                    <td className="p-3 text-right">
                      {q.drive_url && (
                        <a href={q.drive_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-blue-600 hover:underline mr-2">Drive ↗</a>
                      )}
                      <button onClick={e => { e.stopPropagation(); openQuote(q) }}
                        className="text-xs bg-cyan-600 text-white px-2.5 py-1 rounded hover:bg-cyan-700">
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
                {quotes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-neutral-400">No hay presupuestos pendientes ✓</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla huérfanos persistentes */}
      {category === 'huerfanos_persistentes' && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-xs text-red-700">
            <strong>Huérfanos persistentes:</strong> emails con adjunto detectados en Gmail que el workflow no procesó tras 2 reintentos automáticos.
            Decide manualmente si reintentar o ignorar.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Cuenta</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Asunto</th>
                  <th className="text-left p-3 font-medium text-neutral-600">De</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Recibido</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Intentos</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Último error</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orphans.map(o => (
                  <tr key={o.id} className="border-b hover:bg-neutral-50">
                    <td className="p-3 text-xs font-mono text-neutral-600">{o.gmail_account}</td>
                    <td className="p-3 text-xs">
                      <div className="max-w-[280px] truncate">{o.subject || '(sin asunto)'}</div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">{o.message_id}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="max-w-[180px] truncate">{o.from_address || '--'}</div>
                    </td>
                    <td className="p-3 text-xs">{formatDate(o.received_at)}</td>
                    <td className="p-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                        {o.attempt_count}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-neutral-500">
                      <div className="max-w-[200px] truncate">{o.last_error || '--'}</div>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => retryOrphan(o.id)}
                        disabled={orphanBusy === o.id}
                        className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50 mr-1"
                        title="Resetear contador y reintentar en el próximo ciclo del cron"
                      >
                        🔁 Reintentar
                      </button>
                      <button
                        onClick={() => ignoreOrphan(o.id)}
                        disabled={orphanBusy === o.id}
                        className="text-xs bg-neutral-100 text-neutral-600 px-2.5 py-1 rounded hover:bg-neutral-200 disabled:opacity-50"
                        title="No volver a intentar"
                      >
                        Ignorar
                      </button>
                    </td>
                  </tr>
                ))}
                {orphans.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-neutral-400">
                      No hay huérfanos persistentes ✓ El cron auditor está cubriendo todos los emails detectados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      {category !== 'huerfanos_persistentes' && category !== 'documentos_pendientes' && category !== 'presupuestos_recibidos' && (
      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b">
                <th className="text-left p-3 font-medium text-neutral-600">Archivo / Concepto</th>
                <th className="text-left p-3 font-medium text-neutral-600">Tipo</th>
                <th className="text-left p-3 font-medium text-neutral-600">Proveedor</th>
                <th className="text-right p-3 font-medium text-neutral-600">Importe</th>
                <th className="text-center p-3 font-medium text-neutral-600">IA</th>
                <th className="text-center p-3 font-medium text-neutral-600">Modelo</th>
                <th className="text-center p-3 font-medium text-neutral-600">Forense</th>
                <th className="text-center p-3 font-medium text-neutral-600">Estado</th>
                <th className="text-left p-3 font-medium text-neutral-600">Motivo</th>
                <th className="text-left p-3 font-medium text-neutral-600">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} onClick={() => openItem(item)}
                  className={`border-b cursor-pointer transition-colors ${isReenviada(item) ? 'bg-neutral-50 opacity-60 hover:opacity-80' : 'hover:bg-neutral-50'}`}>
                  <td className="p-3">
                    <div className="max-w-[220px] truncate text-xs font-mono">{item.original_filename || '--'}</div>
                    {item.concept && (
                      <div className="max-w-[220px] truncate text-[11px] text-neutral-400 mt-0.5">{item.concept}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100">
                      {item.doc_type}
                    </span>
                    {item.direction && (
                      <span className={`ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${item.direction === 'emitida' ? 'bg-blue-50 text-blue-500' : 'bg-neutral-100 text-neutral-400'}`}>
                        {item.direction}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    <div>{(item.ai_data as AiData)?.supplier_name || item.supplier_nif || '--'}</div>
                    {(item.ai_data as AiData)?.supplier_name && item.supplier_nif && (
                      <div className="text-neutral-400 font-mono text-[10px]">{item.supplier_nif}</div>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono text-xs">{formatEur(item.amount_total)}</td>
                  <td className="p-3 text-center"><ConfidenceBadge confidence={item.ai_confidence} /></td>
                  <td className="p-3 text-center"><ProviderBadge provider={item.ai_provider} /></td>
                  <td className="p-3 text-center"><ForensicBadge data={forensicByInvoice[item.id]} /></td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <ReviewBadge status={item.review_status} />
                      {item.review_status !== 'confirmado' && item.review_status !== 'rechazado' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            quickConfirm(item)
                          }}
                          disabled={quickConfirming === item.id}
                          title="Confirmar revisión sin abrir panel"
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 text-xs font-bold"
                        >
                          {quickConfirming === item.id ? '…' : '✓'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {(() => {
                      const cat = categorize(item)
                      if (cat === 'reenviadas') {
                        const days = daysRemaining(item)
                        return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-200 text-neutral-500">Reenviada · {days}d</span>
                      }
                      const catMap: Record<string, { label: string; cls: string }> = {
                        duplicados: { label: 'Duplicado', cls: 'bg-red-100 text-red-700' },
                        no_legibles: { label: 'No legible', cls: 'bg-orange-100 text-orange-700' },
                        sin_clasificar: { label: 'Sin clasificar', cls: 'bg-purple-100 text-purple-700' },
                        datos_incompletos: { label: 'Datos incompletos', cls: 'bg-blue-100 text-blue-700' },
                        baja_confianza: { label: 'Baja confianza', cls: 'bg-yellow-100 text-yellow-700' },
                        otros: { label: 'Otro', cls: 'bg-neutral-100 text-neutral-500' },
                      }
                      const info = catMap[cat] || catMap.otros
                      return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${info.cls}`}>{info.label}</span>
                    })()}
                  </td>
                  <td className="p-3 text-xs">{formatDate(item.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-400">No hay documentos pendientes de revision</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Slide-out panel para documento seleccionado (de tabla 'documents') */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedDoc(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Revisar documento</h2>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-700">{selectedDoc.doc_type}</span>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-neutral-400 hover:text-neutral-600 text-xl">&times;</button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              {(selectedDoc.resumen_ia as string | undefined) && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">Resumen IA</p>
                  <p className="text-blue-900 leading-relaxed">{selectedDoc.resumen_ia as string}</p>
                </div>
              )}
              <div className="bg-neutral-50 rounded p-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-neutral-400">Confianza:</span> <ConfidenceBadge confidence={selectedDoc.ai_confidence} /></div>
                <div><span className="text-neutral-400">Origen:</span> {selectedDoc.source as string || '--'}</div>
                <div className="col-span-2 break-all"><span className="text-neutral-400">Original:</span> {selectedDoc.original_filename as string || '--'}</div>
                {(selectedDoc.drive_url as string | undefined) && (
                  <div className="col-span-2"><a href={selectedDoc.drive_url as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver en Google Drive →</a></div>
                )}
              </div>
              {(selectedDoc.datos_extraidos as object | undefined) && (
                <details className="bg-neutral-50 rounded p-3">
                  <summary className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 cursor-pointer">Datos extraídos por IA</summary>
                  <pre className="text-[11px] overflow-x-auto max-h-64 mt-2">{JSON.stringify(selectedDoc.datos_extraidos, null, 2)}</pre>
                </details>
              )}
              {(selectedDoc.texto_completo as string | undefined) && (
                <details className="bg-neutral-50 rounded p-3">
                  <summary className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 cursor-pointer">Texto completo (extracción OCR)</summary>
                  <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap mt-2 max-h-96">{selectedDoc.texto_completo as string}</pre>
                </details>
              )}

              {/* Edit form */}
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Corregir / Clasificar</p>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Título</label>
                  <input type="text" value={(editDoc.titulo as string) || ''}
                    onChange={e => setEditDoc(p => ({ ...p, titulo: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Tipo</label>
                    <select value={(editDoc.doc_type as string) || ''} onChange={e => setEditDoc(p => ({ ...p, doc_type: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm">
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Categoría</label>
                    <select value={(editDoc.doc_category as string) || ''} onChange={e => setEditDoc(p => ({ ...p, doc_category: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm">
                      <option value="">Sin categoría</option>
                      <option value="legal">Legal (escrituras, contratos, licencias)</option>
                      <option value="seguros">Seguros</option>
                      <option value="fiscal">Fiscal</option>
                      <option value="laboral">Laboral</option>
                      <option value="flota">Flota</option>
                      <option value="corporativo">Corporativo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Fecha del documento</label>
                    <input type="date" value={(editDoc.fecha_documento as string) || ''}
                      onChange={e => setEditDoc(p => ({ ...p, fecha_documento: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Proyecto</label>
                    <select value={(editDoc.project_id as string) || ''}
                      onChange={e => {
                        const id = e.target.value || null
                        const proj = projects.find(p => p.value === id)
                        setEditDoc(p => ({ ...p, project_id: id, proyecto_code: proj?.code ?? null }))
                      }}
                      className="w-full border rounded px-3 py-2 text-sm">
                      <option value="">Sin proyecto</option>
                      {projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Notas</label>
                  <textarea value={(editDoc.notes as string) || ''}
                    onChange={e => setEditDoc(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => saveDoc('confirmado')} disabled={savingDoc}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded font-medium text-sm hover:bg-green-700 disabled:opacity-50">
                  {savingDoc ? 'Guardando...' : 'Confirmar'}
                </button>
                <button onClick={() => saveDoc('rechazado')} disabled={savingDoc}
                  className="flex-1 bg-red-50 text-red-600 py-2.5 rounded font-medium text-sm hover:bg-red-100 disabled:opacity-50">
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out panel para presupuesto recibido */}
      {selectedQuote && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedQuote(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Revisar presupuesto</h2>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-100 text-cyan-700">recibido</span>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="text-neutral-400 hover:text-neutral-600 text-xl">&times;</button>
            </div>

            <div className="p-4 space-y-4 text-sm">
              {selectedQuote.resumen_ia && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">Resumen IA</p>
                  <p className="text-blue-900 leading-relaxed">{selectedQuote.resumen_ia}</p>
                </div>
              )}

              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Archivo original</p>
                <p className="text-sm font-mono break-all">{selectedQuote.original_filename || 'Sin nombre'}</p>
                {selectedQuote.drive_url && (
                  <a href={selectedQuote.drive_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-600 hover:underline">Ver en Google Drive →</a>
                )}
              </div>

              {/* Líneas */}
              {(selectedQuote.items || selectedQuote.ai_data?.lineas) && (selectedQuote.items || selectedQuote.ai_data?.lineas)!.length > 0 && (
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Líneas ({(selectedQuote.items || selectedQuote.ai_data?.lineas)!.length})
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {(selectedQuote.items || selectedQuote.ai_data?.lineas)!.map((l, i) => (
                      <div key={i} className="flex justify-between text-xs bg-white rounded px-2 py-1.5 border border-neutral-100">
                        <span className="text-neutral-700 flex-1 min-w-0 pr-2 break-words">{l.descripcion || '—'}</span>
                        <div className="shrink-0 text-right text-neutral-400 whitespace-nowrap">
                          {l.cantidad != null && <span className="mr-1">×{l.cantidad}</span>}
                          {l.precio_unitario != null && <span className="mr-1 text-[10px]">{formatEur(l.precio_unitario)}/u</span>}
                          <span className="font-medium text-neutral-700">{formatEur(l.importe ?? l.total ?? null)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit form */}
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Corregir / Clasificar</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Empresa</label>
                    <input type="text" value={(editQuote.empresa as string) || ''}
                      onChange={e => setEditQuote(p => ({ ...p, empresa: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">NIF proveedor</label>
                    <input type="text" value={(editQuote.supplier_nif as string) || ''}
                      onChange={e => setEditQuote(p => ({ ...p, supplier_nif: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Número</label>
                    <input type="text" value={(editQuote.number as string) || ''}
                      onChange={e => setEditQuote(p => ({ ...p, number: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Total</label>
                    <input type="number" step="0.01" value={(editQuote.total as number | null) ?? ''}
                      onChange={e => setEditQuote(p => ({ ...p, total: parseFloat(e.target.value) || 0 }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Subtotal</label>
                    <input type="number" step="0.01" value={(editQuote.subtotal as number | null) ?? ''}
                      onChange={e => setEditQuote(p => ({ ...p, subtotal: parseFloat(e.target.value) || 0 }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">IVA total</label>
                    <input type="number" step="0.01" value={(editQuote.vat_total as number | null) ?? ''}
                      onChange={e => setEditQuote(p => ({ ...p, vat_total: parseFloat(e.target.value) || 0 }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Fecha emisión</label>
                    <input type="date" value={(editQuote.issue_date as string) || ''}
                      onChange={e => setEditQuote(p => ({ ...p, issue_date: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Validez hasta</label>
                    <input type="date" value={(editQuote.valid_until as string) || ''}
                      onChange={e => setEditQuote(p => ({ ...p, valid_until: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Proyecto</label>
                  <select value={(editQuote.project_id as string) || ''}
                    onChange={e => {
                      const id = e.target.value || null
                      const proj = projects.find(p => p.value === id)
                      setEditQuote(p => ({ ...p, project_id: id, proyecto_code: proj?.code ?? null }))
                    }}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">Sin proyecto</option>
                    {projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Concepto</label>
                  <input type="text" value={(editQuote.concept as string) || ''}
                    onChange={e => setEditQuote(p => ({ ...p, concept: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Dirección obra</label>
                  <input type="text" value={(editQuote.direccion_obra as string) || ''}
                    onChange={e => setEditQuote(p => ({ ...p, direccion_obra: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Notas</label>
                  <textarea value={(editQuote.notes as string) || ''}
                    onChange={e => setEditQuote(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => saveQuote('confirmado')} disabled={savingQuote}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded font-medium text-sm hover:bg-green-700 disabled:opacity-50">
                  {savingQuote ? 'Guardando...' : 'Confirmar'}
                </button>
                <button onClick={() => saveQuote('rechazado')} disabled={savingQuote}
                  className="flex-1 bg-red-50 text-red-600 py-2.5 rounded font-medium text-sm hover:bg-red-100 disabled:opacity-50">
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Revisar documento</h2>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100">{selected.doc_type}</span>
                {selected.direction && (
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${selected.direction === 'emitida' ? 'bg-blue-100 text-blue-600' : 'bg-neutral-100 text-neutral-500'}`}>
                    {selected.direction}
                  </span>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-neutral-400 hover:text-neutral-600 text-xl">&times;</button>
            </div>

            <div className="p-4 space-y-4">

              {/* Resumen IA — bloque destacado */}
              {ai?.resumen_ia && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1.5">Resumen IA</p>
                  <p className="text-sm text-blue-900 leading-relaxed">{ai.resumen_ia}</p>
                </div>
              )}

              {/* Forensic alerts — si hay score */}
              {forensicByInvoice[selected.id] && forensicByInvoice[selected.id].score != null && (() => {
                const f = forensicByInvoice[selected.id]
                const score = f.score!
                const colorBg = score >= 80 ? 'bg-green-50 border-green-200' : score >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                const colorText = score >= 80 ? 'text-green-700' : score >= 50 ? 'text-amber-700' : 'text-red-700'
                const sections: { title: string; items: string[] | null }[] = [
                  { title: 'PDF', items: f.pdf_alerts },
                  { title: 'Email', items: f.email_alerts },
                  { title: 'Numeración', items: f.numeracion_alerts },
                  { title: 'Duplicados', items: f.duplicados_alerts },
                ]
                const hasAny = sections.some((s) => (s.items?.length ?? 0) > 0)
                return (
                  <div className={`${colorBg} border rounded-lg p-3`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${colorText}`}>Puntuación forense</p>
                      <span className={`text-lg font-bold ${colorText}`}>🛡️ {score}/100</span>
                    </div>
                    {hasAny ? (
                      <div className="space-y-2 mt-2">
                        {sections.map((s) =>
                          (s.items?.length ?? 0) > 0 ? (
                            <div key={s.title}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{s.title}</p>
                              <ul className="list-disc list-inside text-xs text-neutral-700 mt-0.5">
                                {s.items!.map((alert, i) => (
                                  <li key={i} className="leading-snug">{alert}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null,
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">Sin alertas detectadas</p>
                    )}
                    {f.decision && (
                      <p className="text-[10px] mt-2 text-neutral-500">
                        Decisión revisor: <span className="font-bold uppercase">{f.decision}</span>
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* File info */}
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Archivo original</p>
                <p className="text-sm font-mono break-all">{selected.original_filename || 'Sin nombre'}</p>
                {selected.drive_url && (
                  <a href={selected.drive_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-600 hover:underline">
                    Ver en Google Drive &rarr;
                  </a>
                )}
              </div>

              {/* AI extraction — datos completos */}
              <div className="bg-neutral-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Datos extraídos por IA</p>
                  <ConfidenceBadge confidence={selected.ai_confidence} />
                </div>

                {/* Proveedor */}
                <div className="mb-3 pb-3 border-b border-neutral-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Emisor / Proveedor</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <AiField label="Nombre" value={ai?.supplier_name || '--'} span2 />
                    <AiField label="NIF" value={selected.supplier_nif || '--'} raw={ai?.supplier_nif ?? null} />
                    <AiField label="Número doc." value={selected.number || '--'} />
                    {ai?.supplier_address && <AiField label="Dirección fiscal" value={ai.supplier_address} span2 />}
                  </div>
                </div>

                {/* Importes */}
                <div className="mb-3 pb-3 border-b border-neutral-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Importes</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <AiField label="Base imponible" value={formatEur(ai?.amount_base ?? null)} raw={ai?.amount_base ?? null} type="num" />
                    <AiField label="% IVA" value={ai?.vat_pct != null ? `${ai.vat_pct}%` : '--'} raw={ai?.vat_pct ?? null} type="num" />
                    <AiField label="IVA (€)" value={formatEur(selected.vat_amount)} raw={ai?.vat_amount ?? null} type="num" />
                    <AiField label="Total" value={formatEur(selected.amount_total)} raw={ai?.amount_total ?? null} type="num" />
                    {(selected.irpf_rate != null || ai?.irpf_rate != null) && (
                      <>
                        <AiField label="% IRPF" value={ai?.irpf_rate != null ? `${ai.irpf_rate}%` : '--'} raw={ai?.irpf_rate ?? null} type="num" />
                        <AiField label="IRPF (€)" value={formatEur(selected.irpf_amount ?? ai?.irpf_amount ?? null)} raw={ai?.irpf_amount ?? null} type="num" />
                      </>
                    )}
                    {ai?.retencion_porcentaje != null && (
                      <>
                        <AiField label="% Retención" value={`${ai.retencion_porcentaje}%`} />
                        <AiField label="Retención (€)" value={formatEur(ai.retencion_importe ?? null)} />
                      </>
                    )}
                    {ai?.inversion_sujeto_pasivo && (
                      <div className="col-span-2 text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-2 py-1">
                        Inversión del sujeto pasivo (IVA 0%)
                      </div>
                    )}
                  </div>
                </div>

                {/* Fechas y pago */}
                <div className="mb-3 pb-3 border-b border-neutral-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Fechas y Pago</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <AiField label="Emisión" value={formatDate(selected.issue_date)} raw={ai?.issue_date ?? null} type="date" />
                    <AiField label="Vencimiento" value={formatDate(selected.due_date)} raw={ai?.due_date ?? null} type="date" />
                    <AiField label="Estado pago" value={selected.payment_status || ai?.payment_status || '--'} />
                    <AiField label="Forma pago" value={selected.payment_method || ai?.payment_method || '--'} />
                    {ai?.iban_proveedor && <AiField label="IBAN" value={ai.iban_proveedor} span2 />}
                    {ai?.plazo_pago_dias != null && <AiField label="Plazo pago" value={`${ai.plazo_pago_dias} días`} />}
                    {ai?.num_pedido && <AiField label="Nº pedido" value={ai.num_pedido} />}
                    {ai?.periodo_facturacion && <AiField label="Período" value={ai.periodo_facturacion} span2 />}
                  </div>
                </div>

                {/* Clasificación */}
                <div className="mb-3 pb-3 border-b border-neutral-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Clasificación</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <AiField label="Concepto" value={selected.concept || '--'} span2 />
                    {ai?.direccion_obra && <AiField label="Dirección obra" value={ai.direccion_obra} span2 />}
                    {ai?.categoria_gasto && <AiField label="Categoría" value={ai.categoria_gasto} />}
                    {selected.proyecto_code && <AiField label="Proyecto" value={selected.proyecto_code} />}
                  </div>

                  {/* Proyecto sugerido por IA */}
                  {ai?.proyecto_code_sugerido && !selected.proyecto_code && (
                    <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-2 py-1.5 text-xs">
                      <span className="text-violet-600 font-bold">Sugerido: {ai.proyecto_code_sugerido}</span>
                      {ai.proyecto_confianza != null && (
                        <span className="ml-2 text-violet-400">{Math.round(ai.proyecto_confianza * 100)}%</span>
                      )}
                      {ai.proyecto_razon && (
                        <p className="text-violet-500 mt-0.5 text-[11px]">{ai.proyecto_razon}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Notas del documento */}
                {ai?.notas_documento && (
                  <div className="mb-3 pb-3 border-b border-neutral-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Notas del documento</p>
                    <p className="text-xs text-neutral-600">{ai.notas_documento}</p>
                  </div>
                )}

                {/* Líneas de detalle */}
                {ai?.lineas && ai.lineas.length > 0 && (
                  <div className="mb-3 pb-3 border-b border-neutral-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                      Líneas ({ai.lineas.length})
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {ai.lineas.map((l, i) => (
                        <div key={i} className="flex justify-between text-xs bg-white rounded px-2 py-1.5 border border-neutral-100">
                          <span className="text-neutral-700 flex-1 min-w-0 pr-2 break-words">{l.descripcion || '—'}</span>
                          <div className="shrink-0 text-right text-neutral-400 whitespace-nowrap">
                            {l.cantidad != null && <span className="mr-1">×{l.cantidad}</span>}
                            {l.precio_unitario != null && <span className="mr-1 text-[10px]">{formatEur(l.precio_unitario)}/u</span>}
                            <span className="font-medium text-neutral-700">{formatEur(l.importe ?? l.total ?? null)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error IA */}
                {ai?.error && (
                  <div className="p-2 bg-red-50 rounded text-xs text-red-700">
                    Error IA: {ai.error}
                  </div>
                )}

                {/* Duplicado */}
                {selected.duplicate_reason && (
                  <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">
                    Posible duplicado: {selected.duplicate_reason}
                    {selected.linked_doc_id && <span className="block mt-1 font-mono text-[10px]">Vinculado a: {selected.linked_doc_id}</span>}
                  </div>
                )}

                {/* Razones IA */}
                {selected.ai_razones && selected.ai_razones.filter(r => !r.startsWith('§')).length > 0 && (
                  <div className="mt-2 p-2 bg-neutral-100 rounded text-[11px] text-neutral-500 space-y-0.5">
                    {selected.ai_razones.filter(r => !r.startsWith('§')).map((r, i) => (
                      <p key={i}>{r}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit form */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-neutral-600 uppercase tracking-wider">Corregir / Clasificar</p>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Tipo de documento</label>
                  <select value={editForm.doc_type || ''} onChange={e => setEditForm(p => ({ ...p, doc_type: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">NIF proveedor</label>
                    <input type="text" value={editForm.supplier_nif || ''}
                      onChange={e => setEditForm(p => ({ ...p, supplier_nif: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Número</label>
                    <input type="text" value={editForm.number || ''}
                      onChange={e => setEditForm(p => ({ ...p, number: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Importe total</label>
                    <input type="number" step="0.01" value={editForm.amount_total ?? ''}
                      onChange={e => setEditForm(p => ({ ...p, amount_total: parseFloat(e.target.value) || 0 }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Fecha emisión</label>
                    <input type="date" value={editForm.issue_date || ''}
                      onChange={e => setEditForm(p => ({ ...p, issue_date: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Proyecto</label>
                  <select
                    value={editForm.project_id || ''}
                    onChange={e => {
                      const id = e.target.value || null
                      const proj = projects.find(p => p.value === id)
                      setEditForm(p => ({ ...p, project_id: id, proyecto_code: proj?.code ?? null }))
                    }}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">Sin proyecto</option>
                    {projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Categoría gasto</label>
                    <select value={editForm.categoria_gasto || ''} onChange={e => setEditForm(p => ({ ...p, categoria_gasto: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm">
                      <option value="">Sin categoría</option>
                      {CATEGORIAS_GASTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Estado pago</label>
                    <select value={editForm.payment_status || 'pendiente'} onChange={e => setEditForm(p => ({ ...p, payment_status: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm">
                      <option value="pendiente">Pendiente</option>
                      <option value="pagada">Pagada (recibida)</option>
                      <option value="cobrada">Cobrada (emitida)</option>
                      <option value="vencida">Vencida</option>
                      <option value="parcial">Parcial</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Fecha vencimiento</label>
                    <input type="date" value={editForm.due_date || ''}
                      onChange={e => setEditForm(p => ({ ...p, due_date: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Forma de pago</label>
                    <select value={editForm.payment_method || ''} onChange={e => setEditForm(p => ({ ...p, payment_method: e.target.value || null }))}
                      className="w-full border rounded px-3 py-2 text-sm">
                      <option value="">Sin especificar</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="domiciliacion">Domiciliación</option>
                      <option value="cheque">Cheque</option>
                      <option value="compensacion">Compensación</option>
                      <option value="otros">Otros</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input type="checkbox" id="rev-rectificativa" checked={!!editForm.es_rectificativa}
                    onChange={e => setEditForm(p => ({ ...p, es_rectificativa: e.target.checked }))}
                    className="rounded border-neutral-300" />
                  <label htmlFor="rev-rectificativa" className="text-xs text-neutral-600 cursor-pointer">Rectificativa</label>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Concepto</label>
                  <input type="text" value={editForm.concept || ''}
                    onChange={e => setEditForm(p => ({ ...p, concept: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-4 border-t">
                {selected?.review_status === 'error' && (
                  <button onClick={reprocessItem} disabled={saving}
                    className="w-full bg-blue-600 text-white py-2.5 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
                    title="Eliminar este placeholder y reprocesar el documento desde el email original">
                    {saving ? 'Procesando...' : '🔄 Reprocesar (eliminar y reintentar)'}
                  </button>
                )}
                <div className="flex gap-3">
                  <button onClick={() => saveAndApprove('confirmado')} disabled={saving}
                    className="flex-1 bg-green-600 text-white py-2.5 rounded font-medium text-sm hover:bg-green-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Confirmar'}
                  </button>
                  <button onClick={() => saveAndApprove('rechazado')} disabled={saving}
                    className="flex-1 bg-red-50 text-red-600 py-2.5 rounded font-medium text-sm hover:bg-red-100 disabled:opacity-50">
                    Rechazar (duplicado)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
