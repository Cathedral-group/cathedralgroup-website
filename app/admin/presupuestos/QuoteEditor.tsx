'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import MoneyInput from '@/components/admin/MoneyInput'

/* ─── Types ────────────────────────────────────────────────── */

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

interface Quote {
  id?: string
  number: string
  client_id: string | null
  project_id: string | null
  status: string
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

interface Client {
  id: string
  name: string
}

interface Project {
  id: string
  code: string
  name: string
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

const DEFAULT_CONDITIONS =
  'Presupuesto valido durante 30 dias naturales desde la fecha de emision. Los precios incluyen materiales y mano de obra salvo indicacion contraria. No incluye licencias ni tasas municipales.'

function generateNumber(): string {
  const year = new Date().getFullYear()
  const seq = String(Math.floor(Math.random() * 900) + 100)
  return `P-${year}-${seq}`
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
    if (quote) return { ...quote, items: Array.isArray(quote.items) ? quote.items.map(normalizeItem) : [] }
    return {
      number: generateNumber(),
      client_id: null,
      project_id: null,
      status: 'borrador',
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
    }
  })

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [certModalOpen, setCertModalOpen] = useState(false)
  const [certDraft, setCertDraft] = useState<number[]>([])
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const savedIdRef = useRef<string | undefined>(quote?.id)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  /* ── Field setter ── */
  const set = useCallback(<K extends keyof Quote>(key: K, val: Quote[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }))
  }, [])

  /* ── Recalculate item totals whenever items change ── */
  const updateItem = useCallback((index: number, field: keyof QuoteItem, value: string | number) => {
    setForm((prev) => {
      const items = [...prev.items]
      const item = { ...items[index], [field]: value }
      item.total = calcItemTotal(item)
      items[index] = item
      const totals = calcTotals(items)
      return { ...prev, items, ...totals }
    })
  }, [])

  const addItem = useCallback(() => {
    setForm((prev) => {
      const items = [...prev.items, emptyItem()]
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

  /* ── Auto-save with 2s debounce ── */
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      const supabase = createClient()

      const payload: Record<string, unknown> = {
        number: form.number,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        status: form.status,
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
        const { data } = await supabase
          .from('quotes')
          .update(payload)
          .eq('id', savedIdRef.current)
          .select()
          .single()
        if (data) {
          const saved = data as Quote
          onSaved(saved, false)
          setSaveStatus('saved')
        } else {
          setSaveStatus('idle')
        }
      } else {
        // INSERT
        const { data } = await supabase
          .from('quotes')
          .insert(payload)
          .select()
          .single()
        if (data) {
          const saved = data as Quote
          savedIdRef.current = saved.id
          setForm((prev) => ({ ...prev, id: saved.id }))
          onSaved(saved, true)
          setSaveStatus('saved')
        } else {
          setSaveStatus('idle')
        }
      }
    }, 2000)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.number, form.client_id, form.project_id, form.status,
    form.valid_until, form.items, form.notes, form.conditions,
    form.subtotal, form.vat_total, form.total,
  ])

  /* ── Duplicate ── */
  const handleDuplicate = () => {
    savedIdRef.current = undefined
    isFirstRender.current = true
    setForm((prev) => ({
      ...prev,
      id: undefined,
      number: generateNumber(),
      status: 'borrador',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    setSaveStatus('idle')
    // Allow the next change to trigger auto-save
    setTimeout(() => { isFirstRender.current = false }, 100)
  }

  /* ── Convert to invoice ── */
  const handleConvertToInvoice = async () => {
    const supabase = createClient()
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

    const { data: inv } = await supabase.from('invoices').insert(invoicePayload).select().single()
    if (inv) {
      // Update quote status to accepted
      if (savedIdRef.current) {
        await supabase.from('quotes').update({ status: 'aceptado' }).eq('id', savedIdRef.current)
      }
      window.location.href = '/admin/facturas'
    }
  }

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!savedIdRef.current) return
    const supabase = createClient()
    await supabase.from('quotes').delete().eq('id', savedIdRef.current)
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
    const supabase = createClient()

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

    const { data: inv } = await supabase.from('invoices').insert(invoicePayload).select().single()
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
      await supabase.from('quotes').update(updatePayload).eq('id', savedIdRef.current!)
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

  /* ── Style helpers ── */
  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inputCls = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'
  const sectionCls = 'mb-6'
  const sectionTitle = 'text-[11px] font-bold uppercase tracking-widest text-neutral-300 mb-3'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white h-full overflow-y-auto p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-lg font-medium">
              {isEdit ? 'Editar presupuesto' : 'Nuevo presupuesto'}
            </h2>
            <span
              className={`mt-1 inline-block text-xs font-medium ${
                saveStatus === 'saving'
                  ? 'text-amber-500'
                  : saveStatus === 'saved'
                  ? 'text-green-600'
                  : 'text-neutral-300'
              }`}
            >
              {saveStatus === 'saving' && '\u23F3 Guardando...'}
              {saveStatus === 'saved' && '\u2713 Guardado'}
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-lg">
            &#x2715;
          </button>
        </div>

        {/* 1. Identity */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Datos basicos</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
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
              <label className={labelCls}>Estado</label>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className={inputCls}
              >
                <option value="borrador">Borrador</option>
                <option value="enviado">Enviado</option>
                <option value="aceptado">Aceptado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
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
          <div>
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
                    {['Descripcion', 'Cant.', 'Ud.', 'Precio ud.', 'IVA %', 'Total', ''].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          className="bg-transparent border-0 focus:ring-0 p-0 text-sm w-full min-w-[180px]"
                          placeholder="Descripcion..."
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value) || 0)}
                          className="bg-transparent border-0 focus:ring-0 p-0 text-sm w-16 tabular-nums"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                          className="bg-transparent border-0 focus:ring-0 p-0 text-sm"
                        >
                          <option value="ud">ud</option>
                          <option value="m2">m&sup2;</option>
                          <option value="ml">ml</option>
                          <option value="pa">pa</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <MoneyInput
                          value={item.unit_price}
                          onChange={(v) => updateItem(idx, 'unit_price', v)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.vat_pct}
                          onChange={(e) => updateItem(idx, 'vat_pct', Number(e.target.value))}
                          className="bg-transparent border-0 focus:ring-0 p-0 text-sm"
                        >
                          <option value={0}>0%</option>
                          <option value={10}>10%</option>
                          <option value={21}>21%</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-sm tabular-nums text-right whitespace-nowrap font-medium">
                        {formatEur(item.total)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-neutral-300 hover:text-red-500 transition-colors text-lg leading-none"
                          title="Eliminar partida"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={addItem}
            className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-primary transition-colors"
          >
            + Anadir partida
          </button>

          {/* Totals footer */}
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
          </div>
        </div>

        {/* 2b. Certification Status */}
        {savedIdRef.current && form.items.some((it) => it.total > 0) && (
          <div className={sectionCls}>
            <p className={sectionTitle}>Estado de Certificacion</p>
            <div className="border border-neutral-100 overflow-hidden mb-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50">
                      {['Descripcion', 'Total', '% Cert.', 'Cert. \u20AC', '% Fact.', 'Fact. \u20AC', 'Pendiente \u20AC'].map((h) => (
                        <th key={h} className="text-left px-2 py-2 text-[9px] font-bold uppercase tracking-widest text-neutral-400 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {form.items.map((item, idx) => {
                      const certAmt = Math.round(item.total * (item.certified_pct / 100) * 100) / 100
                      const invAmt = Math.round(item.total * (item.invoiced_pct / 100) * 100) / 100
                      const pending = Math.round((certAmt - invAmt) * 100) / 100
                      const rowColor =
                        item.invoiced_pct >= 100
                          ? 'bg-green-50'
                          : item.certified_pct > item.invoiced_pct
                          ? 'bg-amber-50'
                          : ''
                      return (
                        <tr key={idx} className={rowColor}>
                          <td className="px-2 py-1.5 max-w-[140px] truncate">{item.description || '--'}</td>
                          <td className="px-2 py-1.5 tabular-nums text-right">{formatEur(item.total)}</td>
                          <td className="px-2 py-1.5 tabular-nums text-right">{item.certified_pct}%</td>
                          <td className="px-2 py-1.5 tabular-nums text-right">{formatEur(certAmt)}</td>
                          <td className="px-2 py-1.5 tabular-nums text-right">{item.invoiced_pct}%</td>
                          <td className="px-2 py-1.5 tabular-nums text-right">{formatEur(invAmt)}</td>
                          <td className="px-2 py-1.5 tabular-nums text-right font-medium">{formatEur(pending)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-neutral-200 bg-neutral-50 font-bold text-xs">
                      <td className="px-2 py-2">TOTAL</td>
                      <td className="px-2 py-2 tabular-nums text-right">{formatEur(certSummary.totalBudget)}</td>
                      <td className="px-2 py-2 tabular-nums text-right">
                        {certSummary.totalBudget > 0
                          ? Math.round((certSummary.totalCertified / certSummary.totalBudget) * 100)
                          : 0}%
                      </td>
                      <td className="px-2 py-2 tabular-nums text-right">{formatEur(certSummary.totalCertified)}</td>
                      <td className="px-2 py-2 tabular-nums text-right">
                        {certSummary.totalBudget > 0
                          ? Math.round((certSummary.totalInvoiced / certSummary.totalBudget) * 100)
                          : 0}%
                      </td>
                      <td className="px-2 py-2 tabular-nums text-right">{formatEur(certSummary.totalInvoiced)}</td>
                      <td className="px-2 py-2 tabular-nums text-right">{formatEur(certSummary.totalPending)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={openCertModal}
                className="border border-neutral-200 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
              >
                Certificar
              </button>
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
                      <div className="text-sm font-medium mb-1 truncate">{item.description || `Partida ${idx + 1}`}</div>
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

        {/* 4. Actions */}
        <div className="space-y-3 pt-4 border-t border-neutral-100">
          {savedIdRef.current && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDuplicate}
                  className="border border-neutral-200 py-2.5 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
                >
                  Duplicar presupuesto
                </button>
                <button
                  onClick={handleConvertToInvoice}
                  className="bg-blue-600 text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors"
                >
                  Convertir a factura
                </button>
              </div>

              {confirmDelete ? (
                <button
                  onClick={handleDelete}
                  className="w-full bg-red-600 text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                >
                  Confirmar eliminar
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full border border-red-200 text-red-500 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
                >
                  Eliminar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
