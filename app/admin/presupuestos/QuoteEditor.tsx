'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import MoneyInput from '@/components/admin/MoneyInput'
import CatalogModal from './CatalogModal'
import CatalogDropdown from './CatalogDropdown'

/* ─── Types ────────────────────────────────────────────────── */

interface QuoteItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  base_unit_price?: number        // catalog base price before quality coefficient
  quality_level?: string          // per-item quality override
  quality_coefficient_override?: number  // custom coefficient when quality_level === 'personalizado'
  chapter_code?: string           // from catalog, used for sorting
  chapter_name?: string           // from catalog, used for sorting
  notes?: string                  // per-item observation or clarification
  vat_pct: number
  total: number
  certified_pct: number
  invoiced_pct: number
}

interface CertPhase {
  number: number
  closed_at: string
  items: { description: string; total: number; certified_pct: number; invoiced_pct: number }[]
  total_budget: number
  total_certified: number
  vat_pct: number
}

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
  certifications: CertPhase[]
  portal_token?: string
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

interface CatalogItem {
  id: string
  chapter_code: string
  chapter_name: string
  description: string
  unit: string
  unit_price: number
}

interface QuoteEditorProps {
  quote: Quote | null
  clients: Client[]
  projects: Project[]
  userEmail: string
  onClose: () => void
  onSaved: (q: Quote, isNew: boolean) => void
  onDeleted: (id: string) => void
}

/* ─── Helpers ──────────────────────────────────────────────── */

const DEFAULT_CONDITIONS = `CONDICIONES GENERALES

1. Cualquier trabajo no recogido en esta oferta se presupuestará por separado antes de su ejecución.

2. Los importes se basan en mediciones estimadas. El importe final se ajustará según las unidades realmente ejecutadas, certificadas al cierre de obra.

3. El presupuesto incluye materiales y proyecto técnico. Los medios auxiliares no están incluidos salvo indicación expresa. Si la obra requiere medios auxiliares específicos (andamios, grúas, maquinaria especial, etc.), el cliente deberá comunicarlo con antelación para su valoración.

4. Contamos con seguro de responsabilidad civil que cubre los trabajos realizados.

5. Ofrecemos una garantía posventa de 12 meses desde la finalización de los trabajos.

6. Esta oferta tiene una validez de 30 días desde su fecha de emisión.

7. En caso de cancelación una vez aceptado el presupuesto, se facturarán los trabajos ya ejecutados y los materiales adquiridos o comprometidos hasta esa fecha.

8. El presupuesto no incluye licencias, permisos ni tasas municipales, salvo indicación expresa.

PROYECTO Y SEGUIMIENTO DE OBRA

Una vez aceptado el presupuesto, nuestro equipo elaborará los planos técnicos necesarios y realizará las mediciones definitivas en obra. Durante la ejecución, nuestros técnicos supervisarán el avance periódicamente para garantizar la calidad y resolver cualquier incidencia con rapidez.

Si la obra se paralizara más de 30 días por causas ajenas a nuestra empresa, nos reservamos el derecho a revisar precios y condiciones antes de reanudar los trabajos.

CONDICIONES DE PAGO

- 40 % a la aceptación del presupuesto, mediante transferencia bancaria.
- 60 % restante mediante certificaciones mensuales según el avance de obra.

El retraso en los pagos devengará intereses de demora del 2 % mensual desde la fecha de vencimiento. La empresa no responderá de daños indirectos o consecuenciales derivados de la ejecución de los trabajos.

JURISDICCIÓN

Para cualquier controversia derivada de este presupuesto, las partes se someten a los juzgados y tribunales de Madrid.

PROTECCIÓN DE DATOS

Los datos facilitados serán tratados conforme al Reglamento (UE) 2016/679 (RGPD), únicamente para la gestión de esta relación comercial. Puede ejercer sus derechos dirigiéndose a administracion@cathedralgroup.es.`

function generateNumber(): string {
  const year = new Date().getFullYear()
  return `P-${year}-...` // placeholder until API responds
}

function plus30(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function emptyItem(): QuoteItem {
  return { description: '', quantity: 1, unit: 'ud', unit_price: 0, vat_pct: 21, total: 0, certified_pct: 0, invoiced_pct: 0 }
}

/** Ensure legacy items without certification fields get defaults */
function normalizeItem(item: Partial<QuoteItem>): QuoteItem {
  return {
    description: item.description ?? '',
    quantity: item.quantity ?? 1,
    unit: item.unit ?? 'ud',
    unit_price: item.unit_price ?? 0,
    base_unit_price: item.base_unit_price,
    quality_level: item.quality_level,
    quality_coefficient_override: item.quality_coefficient_override,
    chapter_code: item.chapter_code,
    chapter_name: item.chapter_name,
    notes: item.notes,
    vat_pct: item.vat_pct ?? 21,
    total: item.total ?? 0,
    certified_pct: item.certified_pct ?? 0,
    invoiced_pct: item.invoiced_pct ?? 0,
  }
}

function calcItemTotal(item: QuoteItem): number {
  return Math.round(item.quantity * item.unit_price * (1 + item.vat_pct / 100) * 100) / 100
}

function calcTotals(items: QuoteItem[]): { subtotal: number; vat_total: number; total: number } {
  let subtotal = 0
  let vat_total = 0
  for (const it of items) {
    const base = it.quantity * it.unit_price
    subtotal += base
    vat_total += base * (it.vat_pct / 100)
  }
  subtotal = Math.round(subtotal * 100) / 100
  vat_total = Math.round(vat_total * 100) / 100
  return { subtotal, vat_total, total: Math.round((subtotal + vat_total) * 100) / 100 }
}

function formatEur(val: number): string {
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

/* ─── Component ────────────────────────────────────────────── */

export default function QuoteEditor({
  quote,
  clients,
  projects,
  userEmail,
  onClose,
  onSaved,
  onDeleted,
}: QuoteEditorProps) {
  const isEdit = !!quote?.id

  const [form, setForm] = useState<Quote>(() => {
    if (quote) return { ...quote, items: Array.isArray(quote.items) ? quote.items.map(normalizeItem) : [], certifications: Array.isArray(quote.certifications) ? quote.certifications : [] }
    return {
      number: generateNumber(),
      client_id: null,
      project_id: null,
      status: 'borrador',
      quality_level: 'estandar',
      quality_coefficient_override: null,
      valid_until: plus30(),
      items: [emptyItem()],
      subtotal: 0,
      vat_total: 0,
      total: 0,
      notes: null,
      conditions: DEFAULT_CONDITIONS,
      created_by: userEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      certifications: [],
    }
  })

  // Fetch consecutive number for new quotes
  useEffect(() => {
    if (!isEdit) {
      fetch('/api/db/next-number?type=quote')
        .then((r) => r.json())
        .then((d) => { if (d.number) setForm((prev) => ({ ...prev, number: d.number })) })
        .catch(() => {
          const year = new Date().getFullYear()
          setForm((prev) => ({ ...prev, number: `P-${year}-001` }))
        })
    }
  }, [isEdit])

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [qualityCoefficients, setQualityCoefficients] = useState<{level: string; coefficient: number; label: string}[]>([
    { level: 'basico',    coefficient: 1.20, label: 'Básico'    },
    { level: 'estandar',  coefficient: 1.25, label: 'Estándar'  },
    { level: 'premium',   coefficient: 1.30, label: 'Premium'   },
    { level: 'lujo',      coefficient: 1.40, label: 'Lujo'      },
    { level: 'alto_lujo', coefficient: 1.50, label: 'Alto Lujo' },
  ])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [openCatalogForRow, setOpenCatalogForRow] = useState<number | null>(null)
  const [catalogDropdownPos, setCatalogDropdownPos] = useState({ top: 0, left: 0 })
  const [certModalOpen, setCertModalOpen] = useState(false)
  const [certDraft, setCertDraft] = useState<number[]>([])
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const savedIdRef = useRef<string | undefined>(quote?.id)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)
  const formRef = useRef(form)
  const hasPendingRef = useRef(false)

  /* ── Field setter ── */
  const set = useCallback(<K extends keyof Quote>(key: K, val: Quote[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }))
  }, [])

  /* ── Recalculate item totals whenever items change ── */
  const updateItem = useCallback((index: number, field: keyof QuoteItem, value: string | number) => {
    setForm((prev) => {
      const items = [...prev.items]
      let item = { ...items[index], [field]: value }

      const itemOverride = (f: string) => items[index].quality_coefficient_override ?? prev.quality_coefficient_override ?? 1.25
      const resolveItemCoeff = (level: string, overrideVal?: number) => {
        if (level === 'personalizado') return overrideVal ?? itemOverride(level)
        return qualityCoefficients.find((q) => q.level === level)?.coefficient ?? 1
      }

      if (field === 'unit_price') {
        const currentLevel = items[index].quality_level ?? prev.quality_level
        const currentCoeff = resolveItemCoeff(currentLevel)
        const numVal = Number(value)
        item = { ...item, base_unit_price: currentCoeff !== 0 ? Math.round((numVal / currentCoeff) * 100) / 100 : numVal }
      }

      if (field === 'quality_level' && typeof value === 'string') {
        const oldLevel = items[index].quality_level ?? prev.quality_level
        const oldCoeff = resolveItemCoeff(oldLevel)
        // When switching TO personalizado, inherit the global override or default to 1.25
        const initOverride = value === 'personalizado' ? (items[index].quality_coefficient_override ?? prev.quality_coefficient_override ?? 1.25) : undefined
        const newCoeff = resolveItemCoeff(value, initOverride)
        const base = items[index].base_unit_price ?? (oldCoeff !== 0 ? Math.round((items[index].unit_price / oldCoeff) * 100) / 100 : items[index].unit_price)
        item = { ...item, unit_price: Math.round(base * newCoeff * 100) / 100, base_unit_price: base, quality_coefficient_override: initOverride }
      }

      if (field === 'quality_coefficient_override') {
        // User typed a custom coefficient for this row — recalculate price from base
        const newCoeff = Number(value) || 1
        const base = items[index].base_unit_price ?? items[index].unit_price
        item = { ...item, base_unit_price: base, unit_price: Math.round(base * newCoeff * 100) / 100 }
      }

      item.total = calcItemTotal(item)
      items[index] = item
      const totals = calcTotals(items)
      return { ...prev, items, ...totals }
    })
  }, [qualityCoefficients])

  const addItem = useCallback(() => {
    setForm((prev) => {
      const item = { ...emptyItem(), quality_level: prev.quality_level }
      const items = [...prev.items, item]
      return { ...prev, items }
    })
  }, [])

  const removeItem = useCallback((index: number) => {
    setForm((prev) => {
      const items = prev.items.filter((_, i) => i !== index)
      const totals = calcTotals(items)
      return { ...prev, items, ...totals }
    })
  }, [])

  const updateItemMulti = useCallback((index: number, updates: Partial<QuoteItem>) => {
    setForm((prev) => {
      const items = [...prev.items]
      const item = { ...items[index], ...updates }
      item.total = calcItemTotal(item)
      items[index] = item
      const totals = calcTotals(items)
      return { ...prev, items, ...totals }
    })
  }, [])

  /* ── Keep formRef current ── */
  useEffect(() => { formRef.current = form }, [form])

  /* ── Auto-save with 2s debounce ── */
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    hasPendingRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      hasPendingRef.current = false
      setSaveStatus('saving')

      const payload: Record<string, unknown> = {
        number: form.number,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        status: form.status,
        quality_level: form.quality_level,
        quality_coefficient_override: form.quality_coefficient_override ?? null,
        valid_until: form.valid_until || null,
        items: form.items,
        subtotal: form.subtotal,
        vat_total: form.vat_total,
        total: form.total,
        notes: form.notes || null,
        conditions: form.conditions || null,
        created_by: form.created_by,
        updated_at: new Date().toISOString(),
      }

      if (savedIdRef.current) {
        // UPDATE
        const res = await fetch('/api/db/quotes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedIdRef.current, ...payload }),
        })
        const json = await res.json()
        if (json.data) {
          onSaved(json.data as Quote, false)
          setSaveStatus('saved')
          setSaveError(null)
        } else {
          console.error('Quote save error:', json.error)
          setSaveStatus('error')
          setSaveError(json.error ?? 'Error desconocido')
        }
      } else {
        // INSERT
        const res = await fetch('/api/db/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (json.data) {
          const saved = json.data as Quote
          savedIdRef.current = saved.id
          setForm((prev) => ({ ...prev, id: saved.id }))
          onSaved(saved, true)
          setSaveStatus('saved')
          setSaveError(null)
        } else {
          console.error('Quote insert error:', json.error)
          setSaveStatus('error')
          setSaveError(json.error ?? 'Error desconocido')
        }
      }
    }, 2000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.number, form.client_id, form.project_id, form.status, form.quality_level,
    form.quality_coefficient_override,
    form.valid_until, form.items, form.notes, form.conditions,
    form.subtotal, form.vat_total, form.total,
  ])

  /* ── Save immediately on unmount if there are pending changes ── */
  useEffect(() => {
    return () => {
      if (hasPendingRef.current && savedIdRef.current) {
        const f = formRef.current
        const payload = {
          number: f.number,
          client_id: f.client_id || null,
          project_id: f.project_id || null,
          status: f.status,
          quality_level: f.quality_level,
          quality_coefficient_override: f.quality_coefficient_override ?? null,
          valid_until: f.valid_until || null,
          items: f.items,
          subtotal: f.subtotal,
          vat_total: f.vat_total,
          total: f.total,
          notes: f.notes || null,
          conditions: f.conditions || null,
          created_by: f.created_by,
          updated_at: new Date().toISOString(),
        }
        fetch('/api/db/quotes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedIdRef.current, ...payload }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Load quality coefficients + catalog ── */
  useEffect(() => {
    fetch('/api/db/quality-coefficients')
      .then((r) => r.json())
      .then((d) => { if (d.data?.length) setQualityCoefficients(d.data) })
      .catch(() => {})
    fetch('/api/db/catalog')
      .then((r) => r.json())
      .then((d) => { if (d.data?.length) setCatalogItems(d.data) })
      .catch(() => {})
  }, [])

  /* ── Convert to invoice ── */
  const handleConvertToInvoice = async () => {
    const concept = form.items.map((it) => it.description).filter(Boolean).join(', ') || 'Presupuesto ' + form.number
    const invoicePayload = {
      direction: 'emitida',
      doc_type: 'factura',
      number: '',
      concept,
      amount_base: form.subtotal,
      vat_pct: form.items.length > 0 ? form.items[0].vat_pct : 21,
      vat_amount: form.vat_total,
      irpf_rate: null,
      irpf_amount: null,
      amount_total: form.total,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: plus30(),
      payment_date: null,
      payment_status: 'pendiente',
      payment_method: null,
      proyecto_code: null,
      supplier_nif: null,
      categoria_gasto: null,
      es_rectificativa: false,
      numero_factura_original: null,
      notes: `Generada desde presupuesto ${form.number}`,
    }

    const res = await fetch('/api/db/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoicePayload),
    })
    const { data: inv } = await res.json()
    if (inv) {
      // Update quote status to accepted
      if (savedIdRef.current) {
        await fetch('/api/db/quotes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedIdRef.current, status: 'aceptado' }),
        })
      }
      window.location.href = '/admin/facturas'
    }
  }

  /* ── Close / lock a certification phase ── */
  const handleCloseCertification = async () => {
    if (!savedIdRef.current) return
    const vatPct = form.items[0]?.vat_pct ?? 21
    const totalBudget = form.total
    const totalCertified = form.items.reduce((s, it) => s + Math.round((it.total || 0) * ((it.certified_pct || 0) / 100) * 100) / 100, 0)
    const newPhase: CertPhase = {
      number: (form.certifications?.length ?? 0) + 1,
      closed_at: new Date().toISOString().slice(0, 10),
      items: form.items.filter((it) => it.description).map((it) => ({
        description: it.description,
        total: it.total,
        certified_pct: it.certified_pct,
        invoiced_pct: it.invoiced_pct,
      })),
      total_budget: totalBudget,
      total_certified: Math.round(totalCertified * 100) / 100,
      vat_pct: vatPct,
    }
    const updatedCerts = [...(form.certifications ?? []), newPhase]
    await fetch('/api/db/quotes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: savedIdRef.current, certifications: updatedCerts }),
    })
    setForm((prev) => ({ ...prev, certifications: updatedCerts }))
  }

  /* ── Create invoice from a closed certification phase ── */
  const handleCertInvoice = async (phase: CertPhase) => {
    const prevPhase = form.certifications?.find((c) => c.number === phase.number - 1)
    const prevCertified = prevPhase?.total_certified ?? 0
    const deltaCertified = Math.round((phase.total_certified - prevCertified) * 100) / 100
    const vatPct = phase.vat_pct ?? 21
    const base = deltaCertified
    const vat = Math.round(base * vatPct / 100 * 100) / 100
    const total = Math.round((base + vat) * 100) / 100
    const invoicePayload = {
      direction: 'emitida',
      doc_type: 'factura',
      number: '',
      concept: `Certificación ${phase.number} — Pres. ${form.number}`,
      amount_base: base,
      vat_pct: vatPct,
      vat_amount: vat,
      irpf_rate: null,
      irpf_amount: null,
      amount_total: total,
      issue_date: phase.closed_at,
      due_date: phase.closed_at,
      payment_date: null,
      payment_status: 'pendiente',
      payment_method: null,
      proyecto_code: null,
      supplier_nif: null,
      categoria_gasto: null,
      es_rectificativa: false,
      numero_factura_original: null,
      notes: `Cert. ${phase.number} de pres. ${form.number}. Certificado acumulado: ${phase.total_certified.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`,
    }
    const res = await fetch('/api/db/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoicePayload),
    })
    const { data: inv } = await res.json()
    if (inv) window.location.href = '/admin/facturas'
  }

  /* ── Reopen a closed certification phase ── */
  const handleReopenCertification = async (phase: CertPhase) => {
    if (!savedIdRef.current) return
    const certs = form.certifications ?? []
    const laterCerts = certs.filter((c) => c.number > phase.number)
    const msg = laterCerts.length > 0
      ? `¿Reabrir Certificación ${phase.number}? Las certificaciones posteriores (${laterCerts.map((c) => `Cert. ${c.number}`).join(', ')}) también se eliminarán.`
      : `¿Reabrir Certificación ${phase.number}? Podrás volver a modificarla y cerrarla.`
    if (!confirm(msg)) return

    // Keep only certifications before this one
    const updatedCerts = certs.filter((c) => c.number < phase.number)

    // Restore items' certified_pct from the snapshot of this phase
    const snapMap = new Map(phase.items.map((it) => [it.description, it]))
    const restoredItems = form.items.map((it) => {
      const snap = snapMap.get(it.description)
      return snap ? { ...it, certified_pct: snap.certified_pct, invoiced_pct: snap.invoiced_pct } : it
    })
    const totals = calcTotals(restoredItems)

    await fetch('/api/db/quotes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: savedIdRef.current, certifications: updatedCerts, items: restoredItems, ...totals }),
    })
    setForm((prev) => ({ ...prev, certifications: updatedCerts, items: restoredItems, ...totals }))
  }

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!savedIdRef.current) return
    await fetch('/api/db/quotes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: savedIdRef.current }),
    })
    onDeleted(savedIdRef.current)
  }

  /* ── Certification helpers ── */
  const openCertModal = () => {
    setCertDraft(form.items.map((it) => it.certified_pct))
    setCertModalOpen(true)
  }

  const applyCertification = () => {
    setForm((prev) => {
      const items = prev.items.map((item, i) => ({
        ...item,
        certified_pct: Math.max(item.certified_pct, certDraft[i] ?? item.certified_pct),
      }))
      return { ...prev, items }
    })
    setCertModalOpen(false)
  }

  /** Has any item been certified beyond what was invoiced? */
  const hasPendingInvoice = form.items.some(
    (it) => it.certified_pct > it.invoiced_pct && it.total > 0,
  )

  /** Generate invoice for delta between certified and invoiced */
  const handleGenerateCertInvoice = async () => {
    if (!savedIdRef.current || !hasPendingInvoice) return
    setGeneratingInvoice(true)

    // Build line-by-line descriptions
    const lines: string[] = []
    let totalBase = 0
    let totalVat = 0

    for (const item of form.items) {
      const delta = item.certified_pct - item.invoiced_pct
      if (delta <= 0 || item.total === 0) continue
      const baseItem = item.quantity * item.unit_price
      const fraction = delta / 100
      const lineBase = Math.round(baseItem * fraction * 100) / 100
      const lineVat = Math.round(lineBase * (item.vat_pct / 100) * 100) / 100
      totalBase += lineBase
      totalVat += lineVat
      lines.push(`${item.description || 'Partida'} (${delta}%)`)
    }

    totalBase = Math.round(totalBase * 100) / 100
    totalVat = Math.round(totalVat * 100) / 100
    const totalAmount = Math.round((totalBase + totalVat) * 100) / 100

    const concept = `Certificacion ${form.number} — ${lines.join('; ')}`
    const avgVat =
      form.items.length > 0
        ? form.items.reduce((s, it) => s + it.vat_pct, 0) / form.items.length
        : 21

    const invoicePayload = {
      direction: 'emitida',
      doc_type: 'factura',
      number: '',
      concept,
      amount_base: totalBase,
      vat_pct: Math.round(avgVat * 100) / 100,
      vat_amount: totalVat,
      irpf_rate: null,
      irpf_amount: null,
      amount_total: totalAmount,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: plus30(),
      payment_date: null,
      payment_status: 'pendiente',
      payment_method: null,
      proyecto_code: null,
      supplier_nif: null,
      categoria_gasto: null,
      es_rectificativa: false,
      numero_factura_original: null,
      notes: `Generada por certificacion del presupuesto ${form.number}`,
    }

    const res = await fetch('/api/db/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoicePayload),
    })
    const { data: inv } = await res.json()
    if (inv) {
      // Update invoiced_pct to match certified_pct
      const updatedItems = form.items.map((item) => ({
        ...item,
        invoiced_pct: item.certified_pct,
      }))
      const totals = calcTotals(updatedItems)
      const updatePayload = {
        items: updatedItems,
        ...totals,
        updated_at: new Date().toISOString(),
      }
      await fetch('/api/db/quotes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: savedIdRef.current!, ...updatePayload }),
      })
      window.location.href = '/admin/facturas'
    }
    setGeneratingInvoice(false)
  }

  /* ── Certification computed values ── */
  const certSummary = form.items.reduce(
    (acc, item) => {
      const certAmt = Math.round(item.total * (item.certified_pct / 100) * 100) / 100
      const invAmt = Math.round(item.total * (item.invoiced_pct / 100) * 100) / 100
      acc.totalBudget += item.total
      acc.totalCertified += certAmt
      acc.totalInvoiced += invAmt
      acc.totalPending += Math.round((certAmt - invAmt) * 100) / 100
      return acc
    },
    { totalBudget: 0, totalCertified: 0, totalInvoiced: 0, totalPending: 0 },
  )

  /** When the global VAT changes, apply it to all items */
  const handleGlobalVatChange = useCallback((newVat: number) => {
    setForm((prev) => {
      const items = prev.items.map((item) => {
        const updated = { ...item, vat_pct: newVat }
        updated.total = calcItemTotal(updated)
        return updated
      })
      const totals = calcTotals(items)
      return { ...prev, items, ...totals }
    })
  }, [])

  /** Unique chapters from loaded catalog items, for chapter selector */
  const catalogChapters = useMemo(() => {
    const seen = new Map<string, string>()
    catalogItems.forEach((ci) => { if (ci.chapter_code) seen.set(ci.chapter_code, ci.chapter_name) })
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
  }, [catalogItems])

  /** Resolve coefficient for a given quality level, considering the personalizado override */
  const resolveCoeff = useCallback((level: string, override: number | null): number => {
    if (level === 'personalizado') return override ?? 1.25
    return qualityCoefficients.find((q) => q.level === level)?.coefficient ?? 1
  }, [qualityCoefficients])

  /* ── Quality computed values ── */
  const currentQualityCoeff = form.quality_level === 'personalizado'
    ? (form.quality_coefficient_override ?? 1.25)
    : (qualityCoefficients.find((q) => q.level === form.quality_level)?.coefficient ?? 1)
  const currentQuality = form.quality_level === 'personalizado'
    ? { level: 'personalizado', coefficient: currentQualityCoeff, label: 'Personalizado' }
    : (qualityCoefficients.find((q) => q.level === form.quality_level) ?? qualityCoefficients[0])

  /** When the global quality level changes, only update rows that are still following the global
   *  (i.e. their quality_level matches the previous global, and if personalizado, their coefficient
   *  also matches the previous global override). Individually-customized rows are left untouched. */
  const handleGlobalQualityChange = useCallback((newLevel: string, override?: number | null) => {
    setForm((prev) => {
      const effectiveOverride = override !== undefined ? override : (newLevel === 'personalizado' ? (prev.quality_coefficient_override ?? 1.25) : null)
      const newCoeff = newLevel === 'personalizado' ? (effectiveOverride ?? 1.25) : (qualityCoefficients.find((q) => q.level === newLevel)?.coefficient ?? 1)
      const prevCoeff = prev.quality_level === 'personalizado' ? (prev.quality_coefficient_override ?? 1.25) : (qualityCoefficients.find((q) => q.level === prev.quality_level)?.coefficient ?? 1)

      const items = prev.items.map((item) => {
        // A row "follows global" if it has no explicit quality_level, or its quality matches
        // the previous global level. For personalizado, the coefficient must also match.
        const rowLevel = item.quality_level
        const rowCoeffOverride = item.quality_coefficient_override
        const followsGlobal =
          (rowLevel == null || rowLevel === prev.quality_level) &&
          (prev.quality_level !== 'personalizado' ||
            rowCoeffOverride == null ||
            rowCoeffOverride === prev.quality_coefficient_override)

        if (!followsGlobal) return item  // individually customized — skip

        const base = item.base_unit_price ?? (prevCoeff !== 0 ? Math.round((item.unit_price / prevCoeff) * 100) / 100 : item.unit_price)
        const updated = {
          ...item,
          quality_level: newLevel,
          unit_price: Math.round(base * newCoeff * 100) / 100,
          base_unit_price: base,
          quality_coefficient_override: newLevel === 'personalizado' && effectiveOverride != null ? effectiveOverride : undefined,
        }
        updated.total = calcItemTotal(updated)
        return updated
      })
      const totals = calcTotals(items)
      return { ...prev, quality_level: newLevel, quality_coefficient_override: effectiveOverride ?? null, items, ...totals }
    })
  }, [qualityCoefficients])

  const sortItems = useCallback(() => {
    setForm((prev) => {
      const sorted = [...prev.items].sort((a, b) => {
        const ca = a.chapter_code ?? 'ZZ'
        const cb = b.chapter_code ?? 'ZZ'
        if (ca !== cb) return ca.localeCompare(cb)
        return (a.description ?? '').localeCompare(b.description ?? '')
      })
      return { ...prev, items: sorted }
    })
  }, [])

  const addItemsFromCatalog = useCallback((catalogItems: { description: string; unit: string; unit_price: number; base_unit_price: number; chapter_code?: string; chapter_name?: string }[]) => {
    setForm((prev) => {
      const newItems = catalogItems.map((ci) => {
        const item = {
          ...emptyItem(),
          description: ci.description,
          unit: ci.unit,
          unit_price: ci.unit_price,
          base_unit_price: ci.base_unit_price,
          chapter_code: ci.chapter_code,
          chapter_name: ci.chapter_name,
          quality_level: prev.quality_level,
        }
        item.total = calcItemTotal(item)
        return item
      })
      const combined = [...prev.items.filter((it) => it.description || it.unit_price > 0), ...newItems]
      const chapterOrd: string[] = []
      combined.forEach((it) => { if (it.chapter_code && !chapterOrd.includes(it.chapter_code)) chapterOrd.push(it.chapter_code) })
      const sorted = [...combined].sort((a, b) => {
        const ai = a.chapter_code ? chapterOrd.indexOf(a.chapter_code) : Infinity
        const bi = b.chapter_code ? chapterOrd.indexOf(b.chapter_code) : Infinity
        if (ai !== bi) return ai - bi
        return combined.indexOf(a) - combined.indexOf(b)
      })
      const totals = calcTotals(sorted)
      return { ...prev, items: sorted, ...totals }
    })
    setCatalogOpen(false)
  }, [])

  /* ── Style helpers ── */
  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inputCls = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'
  const sectionCls = 'mb-6'
  const sectionTitle = 'text-[11px] font-bold uppercase tracking-widest text-neutral-300 mb-3'

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex-none border-b border-neutral-100 bg-white px-4 sm:px-8 py-3 flex items-center gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <span className="text-base leading-none">&#8592;</span>
          <span className="hidden sm:inline">Presupuestos</span>
        </button>
        <div className="w-px h-5 bg-neutral-200" />
        <span className="text-sm font-mono text-neutral-600">{form.number || '—'}</span>
        <select
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
          className="text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-2 py-1 bg-white focus:ring-1 focus:ring-primary"
        >
          <option value="borrador">Borrador</option>
          <option value="enviado">Enviado</option>
          <option value="aceptado">Aceptado</option>
          <option value="rechazado">Rechazado</option>
        </select>
        <div className="w-px h-5 bg-neutral-200 hidden sm:block" />
        <select
          value={form.quality_level}
          onChange={(e) => handleGlobalQualityChange(e.target.value)}
          className="text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-2 py-1 bg-white focus:ring-1 focus:ring-primary hidden sm:block"
        >
          {qualityCoefficients.map((q) => (
            <option key={q.level} value={q.level}>{q.label} ×{q.coefficient}</option>
          ))}
        </select>
        {form.quality_level === 'personalizado' && (
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-[10px] text-neutral-400 font-bold">×</span>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={(form.quality_coefficient_override ?? 1.25).toString()}
              key={`coeff-${form.quality_coefficient_override ?? 1.25}`}
              onBlur={(e) => {
                const val = parseFloat(e.target.value.replace(',', '.')) || 1
                handleGlobalQualityChange('personalizado', val)
              }}
              className="w-16 text-[10px] font-bold border border-neutral-200 px-2 py-1 bg-white focus:ring-1 focus:ring-primary text-center"
              title="Coeficiente personalizado"
            />
          </div>
        )}
        <select
          value={form.items[0]?.vat_pct ?? 21}
          onChange={(e) => handleGlobalVatChange(Number(e.target.value))}
          className="text-[10px] font-bold uppercase tracking-widest border border-neutral-200 px-2 py-1 bg-white focus:ring-1 focus:ring-primary hidden sm:block"
          title="IVA para todas las partidas"
        >
          <option value={0}>IVA 0%</option>
          <option value={10}>IVA 10%</option>
          <option value={21}>IVA 21%</option>
        </select>
        <span className={`text-xs font-medium ${
          saveStatus === 'saving' ? 'text-amber-500' :
          saveStatus === 'saved' ? 'text-green-600' :
          saveStatus === 'error' ? 'text-red-500' :
          'text-transparent'
        }`}>
          {saveStatus === 'saving' ? '⏳ Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : saveStatus === 'error' ? `✗ Error: ${saveError}` : '✓ Guardado'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {savedIdRef.current && (
            <>
              <button
                onClick={() => window.open(`/api/db/presupuesto-pdf?id=${savedIdRef.current}`, '_blank')}
                className="hidden sm:block border border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
                title="Generar PDF del presupuesto"
              >
                PDF Presupuesto
              </button>
              {form.portal_token && (
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/portal/${form.portal_token}`
                    navigator.clipboard.writeText(url).then(() => alert('Enlace copiado al portapapeles'))
                  }}
                  className="hidden sm:block border border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-[#B4A898] hover:text-[#9b8f84] transition-colors"
                  title={`Enlace área cliente: /portal/${form.portal_token}`}
                >
                  🔗 Portal
                </button>
              )}
              {form.items.some((it) => (it.certified_pct ?? 0) > 0) && (
                <>
                  <button
                    onClick={() => window.open(`/api/db/presupuesto-pdf?id=${savedIdRef.current}&type=certificacion`, '_blank')}
                    className="hidden sm:block border border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:border-green-400 hover:bg-green-50 transition-colors"
                    title="Generar PDF de certificación parcial"
                  >
                    PDF Cert.
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿Cerrar y bloquear Certificación ${(form.certifications?.length ?? 0) + 1}?`)) handleCloseCertification() }}
                    className="hidden sm:block border border-green-600 text-green-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-green-600 hover:text-white transition-colors"
                    title="Cerrar y bloquear la certificación actual"
                  >
                    Cerrar Cert. {(form.certifications?.length ?? 0) + 1}
                  </button>
                </>
              )}
              <button onClick={handleConvertToInvoice} className="hidden sm:block bg-blue-600 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors">
                → Factura
              </button>
              {confirmDelete ? (
                <button onClick={handleDelete} className="bg-red-600 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-colors">
                  Confirmar
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="border border-red-200 text-red-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 transition-colors">
                  Eliminar
                </button>
              )}
            </>
          )}
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-xl leading-none ml-1">&#x2715;</button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">

        {/* 1. Identity */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Datos basicos</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className={labelCls}>Numero</label>
              <input
                type="text"
                value={form.number}
                onChange={(e) => set('number', e.target.value)}
                className={inputCls}
                placeholder="P-2026-001"
              />
            </div>
            <div>
              <label className={labelCls}>Cliente</label>
              <select
                value={form.client_id ?? ''}
                onChange={(e) => set('client_id', e.target.value || null)}
                className={inputCls}
              >
                <option value="">Sin cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Proyecto</label>
              <select
                value={form.project_id ?? ''}
                onChange={(e) => set('project_id', e.target.value || null)}
                className={inputCls}
              >
                <option value="">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-w-xs">
            <label className={labelCls}>Valido hasta</label>
            <input
              type="date"
              value={form.valid_until ?? ''}
              onChange={(e) => set('valid_until', e.target.value || null)}
              className={inputCls}
            />
          </div>
        </div>

        {/* 2. Line items */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Partidas</p>
          <div className="border border-neutral-100 overflow-hidden mb-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    {[
                      {h:'Cert%', cls:'px-1 py-2 w-16'},
                      {h:'F.ant%', cls:'px-1 py-2 w-10 text-neutral-300'},
                      {h:'Descripcion', cls:'px-3 py-2'},
                      {h:'Cant.', cls:'px-2 py-2'},
                      {h:'Ud.', cls:'px-2 py-2'},
                      {h:'Obs.', cls:'px-1 py-2'},
                      {h:'Precio', cls:'px-2 py-2'},
                      {h:'Total', cls:'px-2 py-2'},
                      {h:'Benef.', cls:'px-2 py-2'},
                      {h:'', cls:'px-2 py-2'},
                    ].map(({h, cls}) => (
                      <th key={h} className={`text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 whitespace-nowrap ${cls}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {(() => {
                    // Pre-compute sequential chapter numbers, totals and margins
                    const chapterOrder: string[] = []
                    const chapterTotals: Record<string, number> = {}
                    const chapterMargins: Record<string, number> = {}
                    form.items.forEach((it) => {
                      const code = it.chapter_code ?? ''
                      if (code && !chapterOrder.includes(code)) chapterOrder.push(code)
                      if (code) {
                        chapterTotals[code] = (chapterTotals[code] || 0) + (it.total || 0)
                        if (it.base_unit_price != null) {
                          const m = (it.unit_price - it.base_unit_price) * it.quantity
                          chapterMargins[code] = (chapterMargins[code] || 0) + m
                        }
                      }
                    })
                    const chapterSeq: Record<string, string> = {}
                    chapterOrder.forEach((code, i) => { chapterSeq[code] = String(i + 1).padStart(2, '0') })

                    // Sort items for display: group by chapter (preserving first-appearance order), no-chapter last
                    const displayItems = [...form.items.map((item, originalIdx) => ({ item, originalIdx }))]
                      .sort((a, b) => {
                        const ai = a.item.chapter_code ? chapterOrder.indexOf(a.item.chapter_code) : Infinity
                        const bi = b.item.chapter_code ? chapterOrder.indexOf(b.item.chapter_code) : Infinity
                        if (ai !== bi) return ai - bi
                        return a.originalIdx - b.originalIdx
                      })
                    let editorLastChapter: string | undefined = undefined
                    return displayItems.flatMap(({ item, originalIdx: idx }, di) => {
                      const showChapterHeader = !!(item.chapter_code && item.chapter_code !== editorLastChapter)
                      if (item.chapter_code) editorLastChapter = item.chapter_code
                      const nextWithCh = displayItems.slice(di + 1).find((x) => x.item.chapter_code)
                      const showSubtotal = !!(item.chapter_code && nextWithCh?.item.chapter_code !== item.chapter_code)

                      // Margin for this item
                      const itemMargin = item.base_unit_price != null
                        ? (item.unit_price - item.base_unit_price) * item.quantity
                        : null
                      const itemMarginPct = itemMargin != null && item.unit_price > 0
                        ? (itemMargin / (item.unit_price * item.quantity)) * 100
                        : null

                      const headerRow = showChapterHeader ? (
                        <tr key={`ch-${idx}`} className="bg-neutral-100 border-t-2 border-neutral-200">
                          <td colSpan={10} className="px-3 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                              {chapterSeq[item.chapter_code!]} — {item.chapter_name}
                            </span>
                          </td>
                        </tr>
                      ) : null

                      const chMarg = item.chapter_code ? chapterMargins[item.chapter_code] : null
                      const chTotal = item.chapter_code ? chapterTotals[item.chapter_code] : 0
                      const chMargPct = chMarg != null && chTotal > 0 ? (chMarg / chTotal) * 100 : null

                      const subtotalRow = showSubtotal ? (
                        <tr key={`sub-${idx}`} className="bg-neutral-50 border-t border-neutral-200 text-[10px] font-bold">
                          <td colSpan={2} />
                          <td colSpan={5} className="px-3 py-1.5 text-right text-neutral-400 uppercase tracking-widest">
                            Subtotal {item.chapter_name}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-neutral-600 whitespace-nowrap">
                            {formatEur(chTotal)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                            {chMarg != null ? (
                              <span className={chMarg >= 0 ? 'text-green-600' : 'text-red-500'}>
                                {formatEur(chMarg)}{chMargPct != null ? ` (${chMargPct.toFixed(0)}%)` : ''}
                              </span>
                            ) : '—'}
                          </td>
                          <td />
                        </tr>
                      ) : null

                      const itemRow = (
                        <tr key={idx}>
                          {/* % Cert */}
                          <td className="px-1 py-2 w-16">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-[10px] tabular-nums font-semibold text-neutral-600">{item.certified_pct}%</span>
                              <input
                                type="range"
                                value={item.certified_pct}
                                onChange={(e) => updateItem(idx, 'certified_pct', Number(e.target.value))}
                                className="w-12 accent-primary h-1.5 cursor-pointer"
                                min="0" max="100" step="5"
                                title="% certificado"
                              />
                            </div>
                          </td>
                          {/* % Fact anterior — read-only, auto-set when invoice is generated */}
                          <td className="px-1 py-2 w-10 text-center" title="% facturado en la certificación anterior">
                            <span className="text-[10px] tabular-nums text-neutral-300 select-none">
                              {item.invoiced_pct > 0 ? `${item.invoiced_pct}%` : '—'}
                            </span>
                          </td>
                          {/* Description */}
                          <td className="px-3 py-2 border-l border-neutral-100">
                            <div className="flex items-start gap-1 min-w-[120px]">
                              <div className="grid flex-1 text-sm leading-snug [&>textarea]:col-[1] [&>textarea]:row-[1] [&>span]:col-[1] [&>span]:row-[1]">
                                <span className="invisible whitespace-pre-wrap break-words p-0 min-h-[1.375rem]" aria-hidden>{(item.description || ' ') + ' '}</span>
                                <textarea
                                  value={item.description}
                                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                  className="bg-transparent border-0 focus:ring-0 p-0 resize-none overflow-hidden w-full"
                                  placeholder="Descripcion..."
                                  rows={1}
                                />
                              </div>
                              {catalogItems.length > 0 && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    if (openCatalogForRow === idx) {
                                      setOpenCatalogForRow(null)
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setCatalogDropdownPos({ top: rect.bottom, left: rect.right - 480 })
                                      setOpenCatalogForRow(idx)
                                    }
                                  }}
                                  className={`flex-none text-sm transition-colors px-0.5 leading-none ${openCatalogForRow === idx ? 'text-primary' : 'text-neutral-300 hover:text-primary'}`}
                                  title="Buscar en catálogo"
                                >
                                  ☰
                                </button>
                              )}
                            </div>
                          </td>
                          {/* Cantidad */}
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value) || 0)}
                              className="bg-transparent border-0 focus:ring-0 p-0 text-sm w-12 tabular-nums"
                              min="0"
                              step="0.01"
                            />
                          </td>
                          {/* Unidad */}
                          <td className="px-2 py-2">
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                              className="bg-transparent border-0 focus:ring-0 p-0 text-sm"
                            >
                              <option value="ud">ud</option>
                              <option value="m2">m²</option>
                              <option value="ml">ml</option>
                              <option value="pa">pa</option>
                            </select>
                          </td>
                          {/* Observaciones por partida */}
                          <td className="px-1 py-2">
                            <input
                              type="text"
                              value={item.notes ?? ''}
                              onChange={(e) => updateItem(idx, 'notes' as keyof QuoteItem, e.target.value)}
                              className="bg-transparent border-0 focus:ring-0 p-0 text-[10px] text-neutral-400 w-full min-w-[100px]"
                              placeholder="Obs..."
                              title="Observación o aclaración para esta partida"
                            />
                          </td>
                          {/* Precio unitario (compacto) */}
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              defaultValue={item.unit_price.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              key={`price-${idx}-${item.unit_price}`}
                              onFocus={(e) => { e.target.value = item.unit_price ? String(item.unit_price) : '' }}
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value.replace(',', '.')) || 0
                                updateItem(idx, 'unit_price', val)
                                e.target.value = val.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})
                              }}
                              className="bg-transparent border-0 focus:ring-0 p-0 text-sm w-20 tabular-nums text-right"
                            />
                          </td>
                          {/* Total */}
                          <td className="px-2 py-2 text-sm tabular-nums text-right whitespace-nowrap font-medium">
                            {formatEur(item.total)}
                          </td>
                          {/* Beneficio */}
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {itemMargin != null ? (
                              <span className={`text-xs font-medium ${itemMargin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                <span className="block tabular-nums">{formatEur(itemMargin)}</span>
                                {itemMarginPct != null && <span className="block text-[10px] opacity-70">{itemMarginPct.toFixed(0)}%</span>}
                              </span>
                            ) : <span className="text-neutral-300 text-xs">—</span>}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-neutral-300 hover:text-red-500 transition-colors text-lg leading-none"
                              title="Eliminar partida"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      )
                      const rows = []
                      if (headerRow) rows.push(headerRow)
                      rows.push(itemRow)
                      if (subtotalRow) rows.push(subtotalRow)
                      return rows
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <button
              onClick={addItem}
              className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-primary transition-colors"
            >
              + Añadir partida
            </button>
            <span className="text-neutral-200">|</span>
            <button
              onClick={() => setCatalogOpen(true)}
              className="text-xs font-bold uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
            >
              + Desde catálogo
            </button>
            {form.items.some((it) => it.chapter_code) && (
              <>
                <span className="text-neutral-200">|</span>
                <button
                  onClick={sortItems}
                  className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-primary transition-colors"
                  title="Ordenar partidas por gremio (capítulo de catálogo)"
                >
                  ↕ Ordenar partidas
                </button>
              </>
            )}
          </div>

          {/* Totals footer */}
          {(() => {
            const totalMargin = form.items.reduce((sum, it) => {
              if (it.base_unit_price != null) return sum + (it.unit_price - it.base_unit_price) * it.quantity
              return sum
            }, 0)
            const hasMargin = form.items.some((it) => it.base_unit_price != null)
            const marginPct = form.subtotal > 0 ? (totalMargin / form.subtotal) * 100 : 0
            return (
              <div className="bg-neutral-50 p-4 mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Subtotal</span>
                  <span className="tabular-nums">{formatEur(form.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">IVA</span>
                  <span className="tabular-nums">{formatEur(form.vat_total)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-neutral-200 pt-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatEur(form.total)}</span>
                </div>
                {hasMargin && (
                  <div className="flex justify-between text-sm border-t border-neutral-100 pt-2">
                    <span className="text-neutral-500">Beneficio estimado</span>
                    <span className={`tabular-nums font-medium ${totalMargin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {formatEur(totalMargin)} <span className="text-xs opacity-70">({marginPct.toFixed(1)}%)</span>
                    </span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* 2b. Certification actions */}
        {savedIdRef.current && form.items.some((it) => it.total > 0) && (
          <div className={sectionCls}>
            <p className={sectionTitle}>Certificacion</p>
            <div className="flex gap-2">
              <button
                onClick={openCertModal}
                className="border border-neutral-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
              >
                Actualizar certificaciones en bloque
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              {hasPendingInvoice && (
                <button
                  onClick={handleGenerateCertInvoice}
                  disabled={generatingInvoice}
                  className="bg-blue-600 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {generatingInvoice ? 'Generando...' : 'Generar factura por certificacion'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Certification modal */}
        {certModalOpen && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center" onClick={() => setCertModalOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-4">Certificar partidas</h3>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {form.items.map((item, idx) => {
                  const current = item.certified_pct
                  const draft = certDraft[idx] ?? current
                  const delta = draft - current
                  return (
                    <div key={idx} className="border border-neutral-100 p-3 rounded">
                      <div className="text-sm font-medium mb-1">{item.description || `Partida ${idx + 1}`}</div>
                      <div className="text-xs text-neutral-400 mb-2">
                        Total: {formatEur(item.total)} | Actual: {current}%
                        {delta > 0 && (
                          <span className="text-green-600 ml-2">+{delta}% ({formatEur(Math.round(item.total * (delta / 100) * 100) / 100)})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={current}
                          max={100}
                          value={draft}
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            setCertDraft((prev) => {
                              const next = [...prev]
                              next[idx] = Math.max(current, val)
                              return next
                            })
                          }}
                          className="flex-1 accent-blue-600"
                        />
                        <input
                          type="number"
                          min={current}
                          max={100}
                          value={draft}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(current, Number(e.target.value) || current))
                            setCertDraft((prev) => {
                              const next = [...prev]
                              next[idx] = val
                              return next
                            })
                          }}
                          className="w-16 bg-neutral-50 border border-neutral-200 rounded px-2 py-1 text-sm text-center tabular-nums"
                        />
                        <span className="text-xs text-neutral-400">%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => setCertModalOpen(false)}
                  className="border border-neutral-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={applyCertification}
                  disabled={certDraft.every((v, i) => v === form.items[i]?.certified_pct)}
                  className="bg-neutral-900 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-40"
                >
                  Aplicar certificacion
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Historial de certificaciones cerradas */}
        {(form.certifications?.length ?? 0) > 0 && (
          <div className={sectionCls}>
            <p className={sectionTitle}>Certificaciones cerradas</p>
            <div className="space-y-2">
              {form.certifications.map((phase) => {
                const prevPhase = form.certifications.find((c) => c.number === phase.number - 1)
                const prevCertified = prevPhase?.total_certified ?? 0
                const delta = Math.round((phase.total_certified - prevCertified) * 100) / 100
                const vatPct = phase.vat_pct ?? 21
                const deltaTotal = Math.round(delta * (1 + vatPct / 100) * 100) / 100
                const fmtEur = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                return (
                  <div key={phase.number} className="border border-neutral-100 p-4 flex items-center gap-4 bg-neutral-50">
                    <div className="flex-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-neutral-600">Certificación {phase.number}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">Cerrada el {new Date(phase.closed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Cert. acumulado: <strong>{fmtEur(phase.total_certified)}</strong>
                        {' · '}Nuevo en esta cert.: <strong className="text-neutral-800">{fmtEur(delta)}</strong>
                        {' · '}Total c/IVA: <strong className="text-green-700">{fmtEur(deltaTotal)}</strong>
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleReopenCertification(phase)}
                        className="border border-amber-300 text-amber-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-amber-50 transition-colors"
                        title="Reabrir esta certificación para modificarla"
                      >
                        Reabrir
                      </button>
                      {savedIdRef.current && (
                        <button
                          onClick={() => window.open(`/api/db/presupuesto-pdf?id=${savedIdRef.current}&type=certificacion&cert=${phase.number}`, '_blank')}
                          className="border border-neutral-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
                        >
                          PDF Cert. {phase.number}
                        </button>
                      )}
                      <button
                        onClick={() => handleCertInvoice(phase)}
                        className="bg-blue-600 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors"
                      >
                        → Factura
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 3. Notes & Conditions */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Notas</p>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={3}
            className={inputCls}
            placeholder="Notas internas o para el cliente..."
          />
        </div>

        <div className={sectionCls}>
          <p className={sectionTitle}>Condiciones</p>
          <textarea
            value={form.conditions ?? ''}
            onChange={(e) => set('conditions', e.target.value || null)}
            rows={4}
            className={inputCls}
          />
        </div>

        {/* Actions on mobile (top bar ones are hidden sm:hidden) */}
        {savedIdRef.current && (
          <div className="flex flex-wrap gap-2 pt-4 border-t border-neutral-100 sm:hidden">
            <button
              onClick={() => window.open(`/api/db/presupuesto-pdf?id=${savedIdRef.current}`, '_blank')}
              className="border border-neutral-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
            >
              PDF Presupuesto
            </button>
            {form.items.some((it) => (it.certified_pct ?? 0) > 0) && (
              <button
                onClick={() => window.open(`/api/db/presupuesto-pdf?id=${savedIdRef.current}&type=certificacion`, '_blank')}
                className="border border-green-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:border-green-400 transition-colors"
              >
                PDF Certificación
              </button>
            )}
            <button onClick={handleConvertToInvoice} className="bg-blue-600 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors">
              → Factura
            </button>
          </div>
        )}
        </div>{/* end max-w-5xl */}
      </div>{/* end scrollable */}

      {/* Catalog modal (multi-select) */}
      {catalogOpen && currentQuality && (
        <CatalogModal
          qualityCoefficient={currentQuality.coefficient}
          qualityLabel={currentQuality.label}
          onAdd={addItemsFromCatalog}
          onClose={() => setCatalogOpen(false)}
        />
      )}

      {/* Inline catalog dropdown (per-row) */}
      {openCatalogForRow !== null && (() => {
        const rowQualityLevel = form.items[openCatalogForRow]?.quality_level ?? form.quality_level
        const rowCoeff = resolveCoeff(rowQualityLevel, form.quality_coefficient_override)
        return (
          <CatalogDropdown
            items={catalogItems}
            qualityCoefficient={rowCoeff}
            position={catalogDropdownPos}
            onSelect={(ci) => {
              updateItemMulti(openCatalogForRow, {
                description: ci.description,
                unit: ci.unit,
                unit_price: ci.unit_price,
                base_unit_price: ci.base_unit_price,
                chapter_code: ci.chapter_code,
                chapter_name: ci.chapter_name,
                quality_level: rowQualityLevel,
              })
              sortItems()
              setOpenCatalogForRow(null)
            }}
            onClose={() => setOpenCatalogForRow(null)}
          />
        )
      })()}
    </div>
  )
}
