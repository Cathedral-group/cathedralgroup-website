'use client'

import { useState } from 'react'

export type PricingConfigRow = {
  id: string
  category: string
  item_key: string
  label_es: string
  sort_order: number
  val_min: number | null
  val_mid: number | null
  val_max: number | null
  val_factor: number | null
  pricing: string | null
  scope: string | null
  min_level: string | null
  in_interiorismo: boolean | null
  is_contact: boolean | null
  is_custom: boolean | null
  explanation: string | null
  source: string | null
  active: boolean
  updated_at: string
  updated_by: string | null
}

type NumField = 'val_min' | 'val_mid' | 'val_max' | 'val_factor'

const CATEGORY_META: { key: string; title: string; intro: string }[] = [
  { key: 'level', title: 'Niveles de calidad', intro: 'Precio por m² (€) según la gama. Base = reforma integral en zona estándar.' },
  { key: 'project_type', title: 'Tipos de proyecto', intro: 'Factor (×) que se aplica al €/m² del nivel según el tipo de obra.' },
  { key: 'zone', title: 'Zonas', intro: 'Multiplicador (×) por localización.' },
  { key: 'global', title: 'Otros factores', intro: 'Ajustes opcionales globales (p. ej. edificio protegido).' },
  { key: 'extra', title: 'Extras', intro: 'Partidas opcionales (€ fijos o €/m²). La gama mínima y el ámbito controlan dónde aparecen en la calculadora.' },
]

// Campos numéricos editables según la categoría de la fila.
function editableFields(row: PricingConfigRow): { key: NumField; label: string; suffix: string; step: number }[] {
  if (row.category === 'level') {
    if (row.is_contact) return []
    return [
      { key: 'val_min', label: 'Mínimo', suffix: '€/m²', step: 10 },
      { key: 'val_mid', label: 'Medio', suffix: '€/m²', step: 10 },
      { key: 'val_max', label: 'Máximo', suffix: '€/m²', step: 10 },
    ]
  }
  if (row.category === 'extra') {
    const suffix = row.pricing === 'perM2' ? '€/m²' : '€'
    const step = row.pricing === 'perM2' ? 5 : 500
    return [
      { key: 'val_min', label: 'Mínimo', suffix, step },
      { key: 'val_max', label: 'Máximo', suffix, step },
    ]
  }
  // project_type / zone / global → factor
  if (row.is_custom) return []
  return [{ key: 'val_factor', label: 'Factor', suffix: '×', step: 0.05 }]
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1'
const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2.5 text-sm'

function RowCard({ row, userEmail, onSaved }: { row: PricingConfigRow; userEmail: string; onSaved: (r: PricingConfigRow) => void }) {
  const [draft, setDraft] = useState(row)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fields = editableFields(draft)

  const setField = (k: NumField, v: string) => {
    const n = parseFloat(v)
    setDraft((d) => ({ ...d, [k]: Number.isFinite(n) ? n : 0 }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const payload: Record<string, unknown> = { id: draft.id, updated_by: userEmail }
      for (const f of fields) payload[f.key] = draft[f.key]
      const res = await fetch('/api/db/pricing-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Error ${res.status}`)
      }
      const { data: updated } = await res.json()
      if (updated) { setDraft(updated); onSaved(updated) }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-neutral-200 p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-medium text-neutral-800">{draft.label_es}</p>
          {draft.category === 'extra' && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-neutral-100 text-neutral-500">
                {draft.scope === 'house' ? 'Vivienda unifamiliar' : 'Piso y casa'}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-neutral-100 text-neutral-500">
                Desde {draft.min_level ?? 'económica'}
              </span>
              {draft.in_interiorismo && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-primary/10 text-primary">
                  En interiorismo
                </span>
              )}
            </div>
          )}
        </div>
        {saved && <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest shrink-0">✓ Guardado</span>}
      </div>

      {fields.length > 0 ? (
        <div className={`grid gap-3 mb-3 ${fields.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {fields.map((f) => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <div className="relative">
                <input
                  type="number"
                  step={f.step}
                  value={draft[f.key] ?? 0}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className={inp + ' pr-12'}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-[10px] font-bold">{f.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-400 italic mb-3">A medida — sin precio (deriva a contacto).</p>
      )}

      {draft.explanation && (
        <p className="text-xs text-neutral-500 leading-relaxed mb-2">{draft.explanation}</p>
      )}
      {draft.source && (
        <p className="text-[10px] text-neutral-400 italic mb-3">Fuente: {draft.source}</p>
      )}

      <div className="mt-auto pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
        <span className="text-[10px] text-neutral-400">
          Actualizado {fmtDate(draft.updated_at)}{draft.updated_by ? ` · ${draft.updated_by}` : ' · valor inicial'}
        </span>
        {fields.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-neutral-900 text-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50 shrink-0"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </div>
      {err && <p className="text-[10px] text-red-600 mt-2">{err}</p>}
    </div>
  )
}

export default function CalculadoraPreciosView({
  rows,
  tableMissing,
  userEmail,
}: {
  rows: PricingConfigRow[]
  tableMissing: boolean
  userEmail: string
}) {
  const [data, setData] = useState(rows)

  const onSaved = (r: PricingConfigRow) => setData((prev) => prev.map((x) => (x.id === r.id ? r : x)))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide mb-2">Calculadora — precios</h1>
        <p className="text-sm text-neutral-500 max-w-3xl leading-relaxed">
          Estos valores alimentan la calculadora pública de <strong>/presupuesto</strong>. Salen de un estudio de
          mercado (Madrid 2025-26): cada parámetro lleva su explicación para que sepas el criterio antes de tocarlo.
          Al guardar se registra <strong>quién y cuándo</strong>. Los cambios se reflejan en la web en unos minutos.
        </p>
      </div>

      {tableMissing || data.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 p-6 max-w-3xl">
          <p className="text-sm font-bold text-amber-800 mb-2">La tabla de precios aún no está creada</p>
          <p className="text-sm text-amber-700 leading-relaxed">
            Aplica la migración <code className="bg-amber-100 px-1">20260614000000_pricing_config_fase2.sql</code> en
            Supabase (SQL Editor) para poder editar los precios desde aquí. Mientras tanto, la calculadora de la web
            funciona con los valores por defecto del código (idénticos), así que no se rompe nada.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {CATEGORY_META.map((cat) => {
            const catRows = data.filter((r) => r.category === cat.key)
            if (catRows.length === 0) return null
            return (
              <section key={cat.key}>
                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-700 mb-1">{cat.title}</h2>
                <p className="text-xs text-neutral-400 mb-5 max-w-2xl">{cat.intro}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {catRows.map((row) => (
                    <RowCard key={row.id} row={row} userEmail={userEmail} onSaved={onSaved} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
