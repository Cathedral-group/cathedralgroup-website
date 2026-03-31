'use client'

import { useState } from 'react'

interface FlippingOp {
  id: string
  purchase_price?: number | null
  purchase_date?: string | null
  purchase_notary_cost?: number | null
  purchase_registry_cost?: number | null
  purchase_gestoria_cost?: number | null
  itp_rate?: number | null
  itp_amount?: number | null
  catastral_ref?: string | null
  property_type?: string | null
  surface_m2?: number | null
  reserva_amount?: number | null
  reserva_date?: string | null
  arras_amount?: number | null
  arras_date?: string | null
  arras_contract_url?: string | null
  sale_price?: number | null
  sale_date?: string | null
  sale_notary_cost?: number | null
  sale_registry_cost?: number | null
  sale_gestoria_cost?: number | null
  agent_commission_pct?: number | null
  agent_commission_amount?: number | null
  plusvalia_amount?: number | null
  is_tax_amount?: number | null
  status: string
  [key: string]: unknown
}

interface Props {
  op: FlippingOp
  onUpdate: (updated: Partial<FlippingOp>) => void
}

function NumInput({ label, field, form, setForm, suffix, step = '0.01' }: {
  label: string
  field: string
  form: Record<string, string>
  setForm: (f: (p: Record<string, string>) => Record<string, string>) => void
  suffix?: string
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={form[field] ?? ''}
          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
          className="w-full border rounded px-3 py-2 text-sm pr-8"
        />
        {suffix && <span className="absolute right-3 top-2 text-xs text-neutral-400">{suffix}</span>}
      </div>
    </div>
  )
}

function eur(v: number | null | undefined) {
  if (v == null) return '--'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

const PROPERTY_TYPES = ['piso','local','chalet','atico','planta_baja','nave','otro']

const EDITABLE_FIELDS = [
  'id','property_type','surface_m2','catastral_ref',
  'purchase_price','purchase_date','purchase_notary_cost','purchase_registry_cost','purchase_gestoria_cost',
  'itp_rate','itp_amount',
  'reserva_amount','reserva_date','arras_amount','arras_date','arras_contract_url',
  'sale_price','sale_date','sale_notary_cost','sale_registry_cost','sale_gestoria_cost',
  'agent_commission_pct','agent_commission_amount','plusvalia_amount','is_tax_amount',
]

export default function TabCompraVenta({ op, onUpdate }: Props) {
  const toForm = (o: FlippingOp) => Object.fromEntries(
    EDITABLE_FIELDS.map(k => [k, (o[k as keyof FlippingOp] ?? '') === null ? '' : String(o[k as keyof FlippingOp] ?? '')])
  ) as Record<string, string>

  const [form, setForm] = useState<Record<string, string>>(toForm(op))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const set = (f: (p: Record<string, string>) => Record<string, string>) => {
    setForm(f)
    setDirty(true)
  }

  const itp_calc = parseFloat(form.purchase_price || '0') * ((parseFloat(form.itp_rate || '6')) / 100)
  const itp_effective = form.itp_amount !== '' && !isNaN(parseFloat(form.itp_amount)) ? parseFloat(form.itp_amount) : itp_calc
  const totalCompra =
    parseFloat(form.purchase_price || '0') +
    itp_effective +
    parseFloat(form.purchase_notary_cost || '0') +
    parseFloat(form.purchase_registry_cost || '0') +
    parseFloat(form.purchase_gestoria_cost || '0')

  const commission_calc = parseFloat(form.sale_price || '0') * ((parseFloat(form.agent_commission_pct || '3')) / 100)
  const commission_effective = form.agent_commission_amount !== '' && !isNaN(parseFloat(form.agent_commission_amount)) ? parseFloat(form.agent_commission_amount) : commission_calc
  const gastosVenta =
    parseFloat(form.sale_notary_cost || '0') +
    parseFloat(form.sale_registry_cost || '0') +
    parseFloat(form.sale_gestoria_cost || '0') +
    commission_effective +
    parseFloat(form.plusvalia_amount || '0') +
    parseFloat(form.is_tax_amount || '0')

  const benefBruto = parseFloat(form.sale_price || '0') - parseFloat(form.purchase_price || '0')
  const benefNeto = parseFloat(form.sale_price || '0') - totalCompra - gastosVenta

  const save = async () => {
    setSaving(true)
    try {
      const numFields = [
        'purchase_price','purchase_notary_cost','purchase_registry_cost','purchase_gestoria_cost',
        'itp_rate','itp_amount','surface_m2',
        'reserva_amount','arras_amount',
        'sale_price','sale_notary_cost','sale_registry_cost','sale_gestoria_cost',
        'agent_commission_pct','agent_commission_amount','plusvalia_amount','is_tax_amount'
      ]
      const body: Record<string, unknown> = { id: op.id }
      for (const [k, v] of Object.entries(form)) {
        if (numFields.includes(k)) {
          body[k] = v === '' ? null : parseFloat(v)
        } else {
          body[k] = v === '' ? null : v
        }
      }
      const res = await fetch('/api/db/flipping-operations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const { data: updated } = await res.json()
        onUpdate(updated)
        setDirty(false)
      } else {
        const errBody = await res.json().catch(() => ({}))
        alert('Error al guardar: ' + (errBody.error || `Error ${res.status}`))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Compra */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-neutral-800 mb-4">Datos del inmueble y compra</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Tipo de inmueble</label>
            <select
              value={form.property_type ?? 'piso'}
              onChange={e => set(p => ({ ...p, property_type: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <NumInput label="Superficie (m²)" field="surface_m2" form={form} setForm={set} suffix="m²" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Referencia catastral</label>
            <input
              type="text"
              value={form.catastral_ref ?? ''}
              onChange={e => set(p => ({ ...p, catastral_ref: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <NumInput label="Precio de compra" field="purchase_price" form={form} setForm={set} suffix="€" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Fecha de compra</label>
            <input
              type="date"
              value={form.purchase_date ?? ''}
              onChange={e => set(p => ({ ...p, purchase_date: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <NumInput label="ITP tipo (%)" field="itp_rate" form={form} setForm={set} suffix="%" step="0.01" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              ITP importe <span className="text-neutral-400">(calculado: {eur(itp_calc)})</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder={itp_calc.toFixed(2)}
                value={form.itp_amount ?? ''}
                onChange={e => set(p => ({ ...p, itp_amount: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm pr-8"
              />
              <span className="absolute right-3 top-2 text-xs text-neutral-400">€</span>
            </div>
          </div>
          <NumInput label="Notaría (compra)" field="purchase_notary_cost" form={form} setForm={set} suffix="€" />
          <NumInput label="Registro (compra)" field="purchase_registry_cost" form={form} setForm={set} suffix="€" />
          <NumInput label="Gestoría (compra)" field="purchase_gestoria_cost" form={form} setForm={set} suffix="€" />
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
          <strong>Total coste de compra:</strong>
          <span className="ml-2 font-mono font-bold">{eur(totalCompra)}</span>
        </div>
      </div>

      {/* Reserva y Arras */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-neutral-800 mb-1">Reserva y Arras</h3>
        <p className="text-xs text-neutral-400 mb-4">Pasos previos a la escritura de venta</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <NumInput label="Reserva (importe)" field="reserva_amount" form={form} setForm={set} suffix="€" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Fecha reserva</label>
            <input
              type="date"
              value={form.reserva_date ?? ''}
              onChange={e => set(p => ({ ...p, reserva_date: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-1" />
          <NumInput label="Arras (importe)" field="arras_amount" form={form} setForm={set} suffix="€" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Fecha arras</label>
            <input
              type="date"
              value={form.arras_date ?? ''}
              onChange={e => set(p => ({ ...p, arras_date: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Contrato arras (Drive URL)</label>
            <input
              type="url"
              value={form.arras_contract_url ?? ''}
              onChange={e => set(p => ({ ...p, arras_contract_url: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="https://drive.google.com/..."
            />
          </div>
        </div>
      </div>

      {/* Venta */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-neutral-800 mb-4">Datos de venta (escritura)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <NumInput label="Precio de venta" field="sale_price" form={form} setForm={set} suffix="€" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Fecha de venta</label>
            <input
              type="date"
              value={form.sale_date ?? ''}
              onChange={e => set(p => ({ ...p, sale_date: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <NumInput label="Comisión agencia (%)" field="agent_commission_pct" form={form} setForm={set} suffix="%" />
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              Comisión agencia € <span className="text-neutral-400">(calc: {eur(commission_calc)})</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder={commission_calc.toFixed(2)}
                value={form.agent_commission_amount ?? ''}
                onChange={e => set(p => ({ ...p, agent_commission_amount: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm pr-8"
              />
              <span className="absolute right-3 top-2 text-xs text-neutral-400">€</span>
            </div>
          </div>
          <NumInput label="Notaría (venta)" field="sale_notary_cost" form={form} setForm={set} suffix="€" />
          <NumInput label="Registro (venta)" field="sale_registry_cost" form={form} setForm={set} suffix="€" />
          <NumInput label="Gestoría (venta)" field="sale_gestoria_cost" form={form} setForm={set} suffix="€" />
          <NumInput label="Plusvalía municipal" field="plusvalia_amount" form={form} setForm={set} suffix="€" />
          <NumInput label="IS sobre beneficio" field="is_tax_amount" form={form} setForm={set} suffix="€" />
        </div>

        {parseFloat(form.sale_price || '0') > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-neutral-50 rounded-lg text-sm">
              <p className="text-xs text-neutral-500">Benef. bruto</p>
              <p className="font-bold font-mono mt-1">{eur(benefBruto)}</p>
            </div>
            <div className="p-3 bg-neutral-50 rounded-lg text-sm">
              <p className="text-xs text-neutral-500">Gastos venta</p>
              <p className="font-bold font-mono mt-1">{eur(gastosVenta)}</p>
            </div>
            <div className={`p-3 rounded-lg text-sm ${benefNeto >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-xs text-neutral-500">Benef. neto</p>
              <p className={`font-bold font-mono mt-1 ${benefNeto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {eur(benefNeto)}
              </p>
            </div>
          </div>
        )}
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )
}
