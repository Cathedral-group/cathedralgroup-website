'use client'

import { useState, useEffect, useCallback } from 'react'
import MoneyInput from '@/components/admin/MoneyInput'
import LinkedSelect from '@/components/admin/LinkedSelect'
import SendDocumentModal from '@/components/admin/SendDocumentModal'

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
  es_gasto_general?: boolean
  linea_estructura?: string | null
  direccion_obra?: string | null
  tipo_operacion_iva?: string | null
  lineas?: { descripcion: string; cantidad?: number | null; precio_unitario?: number | null; importe?: number | null }[] | null
  notes: string | null
  sent_at?: string | null
  sent_channel?: string | null
  needs_review?: boolean | null
  ai_confidence?: number | null
  ai_razones?: string[] | null
  source?: string | null
  drive_url?: string | null
  drive_file_id?: string | null
  original_filename?: string | null
  due_date_estimated?: boolean | null
}

interface InvoiceFormProps {
  invoice: Invoice | null
  projects: { value: string; label: string }[]
  suppliers: { value: string; label: string }[]
  allInvoices?: { id: string; number: string; concept: string; amount_total: number | null; supplier_nif: string | null }[]
  onClose: () => void
  onSaved: (inv: Invoice, isNew: boolean) => void
  onDeleted: (id: string) => void
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function plus30() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

const DEFAULTS: Invoice = {
  direction: 'recibida',
  doc_type: 'factura',
  number: '',
  empresa: null,
  concept: '',
  amount_base: null,
  vat_pct: 21,
  vat_amount: null,
  irpf_rate: null,
  irpf_amount: null,
  amount_total: null,
  issue_date: todayStr(),
  due_date: plus30(),
  payment_date: null,
  payment_status: 'pendiente',
  payment_method: null,
  proyecto_code: null,
  project_id: null,
  supplier_nif: null,
  categoria_gasto: null,
  es_rectificativa: false,
  numero_factura_original: null,
  es_gasto_general: false,
  linea_estructura: null,
  linked_invoice_id: null,
  direccion_obra: null,
  tipo_operacion_iva: 'nacional',
  notes: null,
  needs_review: null,
  ai_confidence: null,
  ai_razones: null,
  source: null,
}

function formatEur(val: number | null): string {
  if (val === null || val === undefined || isNaN(val)) return '--'
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export default function InvoiceForm({ invoice, projects, suppliers, allInvoices = [], onClose, onSaved, onDeleted }: InvoiceFormProps) {
  const isEdit = !!invoice?.id
  const [form, setForm] = useState<Invoice>(invoice ?? { ...DEFAULTS })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(invoice?.sent_at ?? null)
  const [sentChannel, setSentChannel] = useState<string | null>(invoice?.sent_channel ?? null)
  const [clientContact, setClientContact] = useState<{ name?: string; email?: string; phone?: string } | null>(null)
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const [supplierCreated, setSupplierCreated] = useState(false)
  const [lineasOpen, setLineasOpen] = useState(false)

  async function openSendModal() {
    // Try to get client contact from project → client chain
    if ((form.project_id || form.proyecto_code) && !clientContact) {
      try {
        const projQuery = form.project_id
          ? `/api/db/projects?id=${encodeURIComponent(form.project_id)}`
          : `/api/db/projects?code=${encodeURIComponent(form.proyecto_code!)}`
        const projRes = await fetch(projQuery)
        if (projRes.ok) {
          const projData = await projRes.json()
          const project = Array.isArray(projData.data) ? projData.data[0] : projData.data
          if (project?.client_id) {
            const clientRes = await fetch(`/api/db/clients?id=${encodeURIComponent(project.client_id)}`)
            if (clientRes.ok) {
              const clientData = await clientRes.json()
              const client = Array.isArray(clientData.data) ? clientData.data[0] : clientData.data
              if (client) {
                setClientContact({ name: client.name, email: client.email, phone: client.phone })
              }
            }
          }
        }
      } catch (e) {
        console.error('openSendModal fetch error:', e)
      }
    }
    setSendModalOpen(true)
  }

  const set = useCallback(<K extends keyof Invoice>(key: K, val: Invoice[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }))
  }, [])

  // Auto-fetch consecutive number when creating a new emitida invoice
  useEffect(() => {
    if (isEdit) return
    if (form.direction === 'emitida') {
      fetch('/api/db/next-number?type=invoice')
        .then((r) => r.json())
        .then((d) => { if (d.number) setForm((prev) => ({ ...prev, number: d.number })) })
        .catch(() => {})
    } else {
      setForm((prev) => ({ ...prev, number: '' }))
    }
  }, [form.direction]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calculate amounts — only when amount_base has a value (null = no tocar importes existentes de la DB)
  useEffect(() => {
    if (form.amount_base === null || form.amount_base === undefined) return

    const base = form.amount_base
    const vatPct = form.vat_pct ?? 0
    const irpfRate = form.irpf_rate ?? 0

    const vatAmount = Math.round(base * vatPct / 100 * 100) / 100
    const irpfAmount = Math.round(base * irpfRate / 100 * 100) / 100
    const total = Math.round((base + vatAmount - irpfAmount) * 100) / 100

    setForm((prev) => ({
      ...prev,
      vat_amount: vatAmount,
      irpf_amount: irpfRate ? irpfAmount : null,
      amount_total: total,
    }))
  }, [form.amount_base, form.vat_pct, form.irpf_rate])

  const handleSave = async () => {
    setSaving(true)

    const payload: Record<string, unknown> = { ...form }
    delete payload.id

    // Clean nullish strings
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null
    }

    try {
      if (isEdit) {
        const res = await fetch('/api/db/invoices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: invoice!.id!, ...payload }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        const { data } = await res.json()
        onSaved((data ?? { ...form, id: invoice!.id! }) as Invoice, false)
      } else {
        const res = await fetch('/api/db/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        const { data } = await res.json()
        if (data) onSaved(data as Invoice, true)
      }
    } catch (err) {
      console.error('handleSave:', err)
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    setSaving(true)
    try {
      const res = await fetch('/api/db/invoices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice!.id! }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      onDeleted(invoice!.id!)
    } catch (err) {
      console.error('handleDelete:', err)
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateSupplier = async () => {
    if (!form.empresa || !form.supplier_nif) return
    setCreatingSupplier(true)
    try {
      const res = await fetch('/api/db/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.empresa, nif: form.supplier_nif }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Error ${res.status}`)
      }
      setSupplierCreated(true)
    } catch (err) {
      alert('Error al crear proveedor: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setCreatingSupplier(false)
    }
  }

  // Show supplier suggestion when empresa+nif are set but nif not in suppliers list
  const showSupplierSuggestion =
    !supplierCreated &&
    !!form.empresa &&
    !!form.supplier_nif &&
    !suppliers.some((s) => s.value === form.supplier_nif)

  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inputCls = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'
  const sectionCls = 'mb-6'
  const sectionTitle = 'text-[11px] font-bold uppercase tracking-widest text-neutral-300 mb-3'

  return (
    <>
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full md:max-w-lg bg-white h-full overflow-y-auto p-4 md:p-8 pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <h2 className="text-lg font-medium">
            {isEdit ? 'Editar factura' : 'Nueva factura'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-lg">
            &#x2715;
          </button>
        </div>

        {/* AI info banner — only for auto-processed invoices */}
        {isEdit && invoice?.source === 'email_automatico' && (
          <div className={`mb-6 rounded-lg border p-4 ${invoice.needs_review ? 'bg-amber-50 border-amber-200' : 'bg-neutral-50 border-neutral-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Clasificado por IA</span>
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                invoice.ai_confidence != null && invoice.ai_confidence >= 0.9
                  ? 'bg-green-100 text-green-700'
                  : invoice.ai_confidence != null && invoice.ai_confidence >= 0.6
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                Confianza {invoice.ai_confidence != null && invoice.ai_confidence >= 0.9 ? 'alta' : invoice.ai_confidence != null && invoice.ai_confidence >= 0.6 ? 'media' : 'baja'}
              </span>
            </div>
            {invoice.needs_review && (
              <p className="text-xs text-amber-700 font-medium mb-2">Requiere revisión manual</p>
            )}
            {Array.isArray(invoice.ai_razones) && invoice.ai_razones.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {invoice.ai_razones.map((r, i) => (
                  <span key={i} className="inline-block bg-white border border-neutral-200 rounded px-2 py-0.5 text-[10px] text-neutral-600 max-w-[220px] truncate" title={r}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drive document preview — only for auto-processed invoices with a Drive file */}
        {isEdit && invoice?.drive_url && (
          <div className="mb-6">
            <p className={sectionTitle}>Documento original</p>
            <div className="rounded-lg border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-100" style={{ height: 300 }}>
                <iframe
                  src={invoice.drive_url.replace('/view', '/preview')}
                  width="100%"
                  height="300"
                  allow="autoplay"
                  className="border-0 w-full h-full"
                  title="Vista previa del documento"
                />
              </div>
              <div className="px-3 py-2.5 flex items-center justify-between bg-white border-t border-neutral-100">
                <span className="text-[11px] text-neutral-500 truncate max-w-[200px]" title={invoice.original_filename ?? undefined}>
                  {invoice.original_filename ?? 'Documento adjunto'}
                </span>
                <a
                  href={invoice.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-1 shrink-0 ml-2"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Ver en Drive
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 1. Direction toggle */}
        <div className={sectionCls}>
          <div className="flex rounded overflow-hidden border border-neutral-200">
            {(['emitida', 'recibida'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => set('direction', dir)}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${
                  form.direction === dir
                    ? dir === 'emitida'
                      ? 'bg-blue-600 text-white'
                      : 'bg-orange-500 text-white'
                    : 'bg-neutral-50 text-neutral-400 hover:text-neutral-600'
                }`}
              >
                {dir === 'emitida' ? 'Cobro (emitida)' : 'Pago (recibida)'}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Identity */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Identidad</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Tipo documento</label>
              <select
                value={form.doc_type}
                onChange={(e) => set('doc_type', e.target.value)}
                className={inputCls}
              >
                <option value="factura">Factura</option>
                <option value="proforma">Proforma</option>
                <option value="rectificativa">Rectificativa</option>
                <option value="abono">Abono</option>
                <option value="ticket">Ticket</option>
                <option value="albaran">Albarán</option>
                <option value="certificado">Certificado</option>
                <option value="presupuesto">Presupuesto</option>
                <option value="contrato">Contrato</option>
                <option value="nota_simple">Nota simple</option>
                <option value="nomina">Nómina</option>
                <option value="modelo_fiscal">Modelo fiscal</option>
                <option value="seguro">Seguro</option>
                <option value="justificante_pago">Justificante de pago</option>
                <option value="informe">Informe</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Numero *</label>
              <input
                type="text"
                value={form.number}
                onChange={(e) => set('number', e.target.value)}
                className={inputCls}
                placeholder="F-2026-001"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Empresa emisora</label>
            <input
              type="text"
              value={form.empresa ?? ''}
              onChange={(e) => set('empresa', e.target.value || null)}
              className={inputCls}
              placeholder="Ej: Leroy Merlin, Bauhaus..."
            />
          </div>
          <div className="mt-3">
            <label className={labelCls}>Concepto *</label>
            <input
              type="text"
              value={form.concept}
              onChange={(e) => set('concept', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* 3. Amounts */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Importes</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MoneyInput
              label="Base imponible"
              value={form.amount_base}
              onChange={(v) => set('amount_base', v)}
            />
            <div>
              <label className={labelCls}>IVA %</label>
              <input
                type="number"
                value={form.vat_pct ?? ''}
                onChange={(e) => set('vat_pct', e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
                step="1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MoneyInput
              label="IVA (auto)"
              value={form.vat_amount}
              onChange={() => {}}
              disabled
            />
            <div>
              <label className={labelCls}>IRPF %</label>
              <input
                type="number"
                value={form.irpf_rate ?? ''}
                onChange={(e) => set('irpf_rate', e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
                step="1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MoneyInput
              label="IRPF (auto)"
              value={form.irpf_amount}
              onChange={() => {}}
              disabled
            />
            <MoneyInput
              label="Total"
              value={form.amount_total}
              onChange={() => {}}
              disabled
            />
          </div>
          <div className="bg-neutral-50 p-3 rounded text-right">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mr-3">Total</span>
            <span className="text-lg font-bold">
              {(form.amount_total ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
        </div>

        {/* 4. Dates */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Fechas</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Emision *</label>
              <input
                type="date"
                value={form.issue_date}
                onChange={(e) => set('issue_date', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                Vencimiento{form.due_date_estimated && <span className="ml-1 text-neutral-400 font-normal normal-case tracking-normal">* estimado</span>}
              </label>
              <input
                type="date"
                value={form.due_date ?? ''}
                onChange={(e) => { set('due_date', e.target.value); set('due_date_estimated', false) }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Fecha pago</label>
              <input
                type="date"
                value={form.payment_date ?? ''}
                onChange={(e) => set('payment_date', e.target.value || null)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* 5. Payment */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Pago</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Estado pago</label>
              <select
                value={form.payment_status}
                onChange={(e) => set('payment_status', e.target.value)}
                className={inputCls}
              >
                <option value="pendiente">Pendiente</option>
                <option value="pagada">Pagada</option>
                <option value="vencida">Vencida</option>
                <option value="parcial">Parcial</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Metodo pago</label>
              <select
                value={form.payment_method ?? ''}
                onChange={(e) => set('payment_method', e.target.value || null)}
                className={inputCls}
              >
                <option value="">Sin especificar</option>
                <option value="transferencia">Transferencia</option>
                <option value="domiciliacion">Domiciliación bancaria</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
        </div>

        {/* 6. Links */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Vinculos</p>
          <div className="grid grid-cols-2 gap-3">
            <LinkedSelect
              label="Proyecto"
              options={projects}
              value={form.project_id ?? null}
              onChange={(v) => {
                setForm(prev => {
                  const updated = { ...prev, project_id: v || null }
                  if (v) {
                    // Also set proyecto_code for backwards compatibility with n8n
                    const proj = projects.find(p => p.value === v)
                    if (proj) {
                      const code = proj.label.includes(' - ') ? proj.label.split(' - ')[0] : proj.label
                      updated.proyecto_code = code
                    }
                  } else {
                    updated.proyecto_code = null
                  }
                  return updated
                })
              }}
              placeholder="Sin proyecto"
            />
            <LinkedSelect
              label="Proveedor (NIF)"
              options={suppliers}
              value={form.supplier_nif}
              onChange={(v) => {
                setForm(prev => {
                  const updated = { ...prev, supplier_nif: v || null }
                  // Auto-fill empresa with supplier name if empresa is currently empty
                  if (v && !prev.empresa) {
                    const sup = suppliers.find(s => s.value === v)
                    if (sup) {
                      // label format: "NIF - Name"
                      const name = sup.label.includes(' - ')
                        ? sup.label.split(' - ').slice(1).join(' - ')
                        : sup.label
                      updated.empresa = name || null
                    }
                  }
                  return updated
                })
              }}
              placeholder="Sin proveedor"
            />
          </div>
        </div>

        {/* 7. Extra */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Extra</p>
          <div className="mb-3">
            <label className={labelCls}>Régimen IVA</label>
            <select
              value={form.tipo_operacion_iva ?? 'nacional'}
              onChange={(e) => set('tipo_operacion_iva', e.target.value)}
              className={inputCls}
            >
              <option value="nacional">Nacional — IVA español normal</option>
              <option value="intracomunitaria">Intracomunitaria — UE B2B (inversión sujeto pasivo)</option>
              <option value="importacion_exportacion">Importación / Exportación — fuera UE</option>
              <option value="exenta">Exenta — seguros, financiero, educación...</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelCls}>Categoria gasto</label>
              <select
                value={form.categoria_gasto ?? ''}
                onChange={(e) => set('categoria_gasto', e.target.value || null)}
                className={inputCls}
              >
                <option value="">Sin categoria</option>
                <option value="material">Material</option>
                <option value="mano_de_obra">Mano de obra</option>
                <option value="subcontratas">Subcontratas</option>
                <option value="alquiler">Alquiler</option>
                <option value="servicios">Servicios</option>
                <option value="otros">Otros</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer p-3">
                <input
                  type="checkbox"
                  checked={form.es_rectificativa}
                  onChange={(e) => set('es_rectificativa', e.target.checked)}
                  className="rounded border-neutral-300 text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium uppercase tracking-wide">Rectificativa</span>
              </label>
            </div>
          </div>
          {form.direction === 'recibida' && (
            <div className="mb-3">
              <label className="flex items-center gap-3 cursor-pointer p-3">
                <input
                  type="checkbox"
                  checked={!!form.es_gasto_general}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setForm((prev) => ({
                      ...prev,
                      es_gasto_general: checked,
                      linea_estructura: checked ? prev.linea_estructura ?? null : null,
                    }))
                  }}
                  className="rounded border-neutral-300 text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium uppercase tracking-wide">Gasto general de estructura</span>
              </label>
              {form.es_gasto_general && (
                <div className="mt-2">
                  <label className={labelCls}>Línea de estructura</label>
                  <select
                    value={form.linea_estructura ?? ''}
                    onChange={(e) => set('linea_estructura', e.target.value || null)}
                    className={inputCls}
                  >
                    <option value="">Seleccionar línea...</option>
                    <option value="nominas">Nóminas</option>
                    <option value="ss_empresa">S.S. empresa</option>
                    <option value="internet">Internet / Telecomunicaciones</option>
                    <option value="telefono">Teléfono móvil</option>
                    <option value="renting">Renting vehículos</option>
                    <option value="alquiler_oficina">Alquiler oficina</option>
                    <option value="seguros">Seguros</option>
                    <option value="software">Software / Suscripciones</option>
                    <option value="asesoria">Gestoría / Asesoría</option>
                    <option value="suministros">Suministros (luz, agua...)</option>
                    <option value="otros_fijos">Otros fijos</option>
                  </select>
                </div>
              )}
            </div>
          )}
          {form.es_rectificativa && (
            <div className="space-y-3 col-span-2">
              <div>
                <label className={labelCls}>N factura original</label>
                <input
                  type="text"
                  value={form.numero_factura_original ?? ''}
                  onChange={(e) => set('numero_factura_original', e.target.value || null)}
                  className={inputCls}
                  placeholder="Ej: F-2025-032"
                />
              </div>
              <div>
                <label className={labelCls}>Vincular a factura original</label>
                <select
                  value={form.linked_invoice_id ?? ''}
                  onChange={(e) => set('linked_invoice_id', e.target.value || null)}
                  className={inputCls}
                >
                  <option value="">Sin vincular</option>
                  {allInvoices
                    .filter(inv => inv.id !== invoice?.id && (!form.supplier_nif || inv.supplier_nif === form.supplier_nif))
                    .map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number || '—'} · {(inv.concept ?? '').slice(0, 40)} · {formatEur(inv.amount_total)}
                      </option>
                    ))
                  }
                </select>
                {form.linked_invoice_id && (() => {
                  const original = allInvoices.find(inv => inv.id === form.linked_invoice_id)
                  if (!original) return null
                  const net = (original.amount_total ?? 0) + (form.amount_total ?? 0)
                  return (
                    <div className="mt-2 p-3 bg-neutral-50 rounded text-xs text-neutral-600 flex gap-6">
                      <span>Original: <span className="font-semibold">{formatEur(original.amount_total)}</span></span>
                      <span>Esta: <span className="font-semibold">{formatEur(form.amount_total)}</span></span>
                      <span>Neto: <span className={`font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatEur(net)}</span></span>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* 8. Líneas de partida */}
        {Array.isArray(form.lineas) && form.lineas.length > 0 && (
          <div className={sectionCls}>
            <button
              type="button"
              onClick={() => setLineasOpen((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <p className={sectionTitle + ' mb-0'}>
                Líneas ({form.lineas.length})
              </p>
              <span className="text-neutral-400 text-sm">{lineasOpen ? '▲' : '▼'}</span>
            </button>
            {lineasOpen && (
              <div className="mt-3 border border-neutral-100 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400">Descripción</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-neutral-400 hidden sm:table-cell">Cant.</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-neutral-400 hidden sm:table-cell">P. Unit.</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-neutral-400">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {form.lineas.map((l, i) => (
                      <tr key={i} className="hover:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-700">{l.descripcion}</td>
                        <td className="px-3 py-2 text-right text-neutral-500 hidden sm:table-cell">
                          {l.cantidad != null ? l.cantidad : '--'}
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-500 hidden sm:table-cell">
                          {l.precio_unitario != null ? l.precio_unitario.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '--'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-neutral-700">
                          {l.importe != null ? l.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 9. Dirección obra + Notes */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Obra y notas</p>
          <div className="mb-3">
            <label className={labelCls}>Dirección de obra / entrega</label>
            <input
              type="text"
              value={form.direccion_obra ?? ''}
              onChange={(e) => set('direccion_obra', e.target.value || null)}
              className={inputCls}
              placeholder="Ej: Calle Mayor 12, 28001 Madrid"
            />
          </div>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={3}
            className={inputCls}
            placeholder="Notas internas..."
          />
        </div>

        {/* Supplier suggestion banner */}
        {showSupplierSuggestion && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-0.5">Proveedor no registrado</p>
              <p className="text-xs text-blue-700 truncate max-w-[220px]">{form.empresa} ({form.supplier_nif})</p>
            </div>
            <button
              onClick={handleCreateSupplier}
              disabled={creatingSupplier}
              className="shrink-0 bg-blue-600 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50 rounded"
            >
              {creatingSupplier ? '...' : '+ Crear'}
            </button>
          </div>
        )}
        {supplierCreated && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-green-600">Proveedor creado correctamente</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-4 border-t border-neutral-100">
          <button
            onClick={handleSave}
            disabled={saving || !form.number || !form.concept}
            className="w-full bg-neutral-900 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
          >
            {saving ? '...' : isEdit ? 'Guardar cambios' : 'Crear factura'}
          </button>

          {isEdit && invoice?.source !== 'email_automatico' && (
            <button
              onClick={() => window.open(`/api/db/factura-pdf?id=${invoice!.id}`, '_blank')}
              className="w-full border border-neutral-200 py-2.5 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
            >
              Ver PDF
            </button>
          )}
          {isEdit && invoice?.drive_url && (
            <a
              href={invoice.drive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center border border-neutral-200 py-2.5 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
            >
              Abrir en Google Drive
            </a>
          )}

          {isEdit && form.direction === 'emitida' && (
            <button
              onClick={openSendModal}
              className="w-full bg-neutral-900 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors flex items-center justify-center gap-2"
            >
              <span>✉</span>
              {sentAt ? 'Reenviar' : 'Enviar factura'}
              {sentAt && <span className="text-[10px] font-normal opacity-60 ml-1">· Enviado</span>}
            </button>
          )}
        </div>

        {/* Danger zone */}
        {isEdit && (
          <div className="mt-8 pt-6 border-t border-red-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-300 mb-3">Zona de peligro</p>
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-xs text-red-400">¿Estás seguro? La factura se moverá a la papelera.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex-1 bg-red-600 text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Sí, mover a papelera
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 border border-neutral-200 py-2.5 text-xs font-bold uppercase tracking-widest text-neutral-400 hover:border-neutral-400 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full border border-red-200 text-red-400 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
              >
                Eliminar factura
              </button>
            )}
          </div>
        )}
      </div>
    </div>

    {sendModalOpen && isEdit && (
      <SendDocumentModal
        docType="invoice"
        docId={invoice!.id!}
        docNumber={form.number}
        clientName={clientContact?.name}
        clientEmail={clientContact?.email}
        clientPhone={clientContact?.phone}
        sentAt={sentAt}
        sentChannel={sentChannel}
        onClose={() => setSendModalOpen(false)}
        onSent={(at, ch) => { setSentAt(at); setSentChannel(ch) }}
      />
    )}
    </>
  )
}
