'use client'

import { useState, useEffect, useCallback } from 'react'
import MoneyInput from '@/components/admin/MoneyInput'
import LinkedSelect from '@/components/admin/LinkedSelect'

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

interface InvoiceFormProps {
  invoice: Invoice | null
  projects: { value: string; label: string }[]
  suppliers: { value: string; label: string }[]
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
  supplier_nif: null,
  categoria_gasto: null,
  es_rectificativa: false,
  numero_factura_original: null,
  notes: null,
}

export default function InvoiceForm({ invoice, projects, suppliers, onClose, onSaved, onDeleted }: InvoiceFormProps) {
  const isEdit = !!invoice?.id
  const [form, setForm] = useState<Invoice>(invoice ?? { ...DEFAULTS })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = useCallback(<K extends keyof Invoice>(key: K, val: Invoice[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }))
  }, [])

  // Auto-calculate amounts
  useEffect(() => {
    const base = form.amount_base ?? 0
    const vatPct = form.vat_pct ?? 0
    const irpfRate = form.irpf_rate ?? 0

    const vatAmount = Math.round(base * vatPct) / 100
    const irpfAmount = Math.round(base * irpfRate) / 100
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

  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inputCls = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'
  const sectionCls = 'mb-6'
  const sectionTitle = 'text-[11px] font-bold uppercase tracking-widest text-neutral-300 mb-3'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full md:max-w-lg bg-white h-full overflow-y-auto p-4 md:p-8"
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
              <label className={labelCls}>Vencimiento</label>
              <input
                type="date"
                value={form.due_date ?? ''}
                onChange={(e) => set('due_date', e.target.value)}
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
              value={form.proyecto_code}
              onChange={(v) => set('proyecto_code', v || null)}
              placeholder="Sin proyecto"
            />
            <LinkedSelect
              label="Proveedor (NIF)"
              options={suppliers}
              value={form.supplier_nif}
              onChange={(v) => set('supplier_nif', v || null)}
              placeholder="Sin proveedor"
            />
          </div>
        </div>

        {/* 7. Extra */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Extra</p>
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
          {form.es_rectificativa && (
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
          )}
        </div>

        {/* 8. Notes */}
        <div className={sectionCls}>
          <p className={sectionTitle}>Notas</p>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={3}
            className={inputCls}
          />
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-4 border-t border-neutral-100">
          <button
            onClick={handleSave}
            disabled={saving || !form.number || !form.concept}
            className="w-full bg-neutral-900 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
          >
            {saving ? '...' : isEdit ? 'Guardar cambios' : 'Crear factura'}
          </button>

          {isEdit && (
            <button
              onClick={() => window.open(`/api/db/factura-pdf?id=${invoice!.id}`, '_blank')}
              className="w-full border border-neutral-200 py-2.5 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors"
            >
              Ver PDF
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
  )
}
