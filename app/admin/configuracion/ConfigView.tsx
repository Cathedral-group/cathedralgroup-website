'use client'

import { useState } from 'react'

interface QualityCoefficient {
  id: string
  level: string
  coefficient: number
  label: string
  description: string | null
}

export default function ConfigView({ initial }: { initial: QualityCoefficient[] }) {
  const [data, setData] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  const update = (id: string, field: string, value: string | number) => {
    setData((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
  }

  const handleSave = async (row: QualityCoefficient) => {
    setSaving(row.id)
    try {
      const res = await fetch('/api/admin/quality-coefficients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          coefficient: row.coefficient,
          label: row.label,
          description: row.description,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Error ${res.status}`)
      }
      const { data: updated } = await res.json()
      if (updated) setData((prev) => prev.map((r) => r.id === row.id ? updated : r))
      setSaved(row.id)
      setTimeout(() => setSaved(null), 2000)
    } catch (err) {
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(null)
    }
  }

  const levelColors: Record<string, string> = {
    estandar: 'bg-neutral-100 text-neutral-700',
    premium: 'bg-blue-100 text-blue-700',
    lujo: 'bg-amber-100 text-amber-700',
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide mb-2">Configuración</h1>
        <p className="text-sm text-neutral-500">Ajusta los coeficientes de calidad que se aplican a los precios base del catálogo de partidas.</p>
      </div>

      <section className="mb-10">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">Coeficientes de calidad</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {data.map((row) => (
            <div key={row.id} className="bg-white border border-neutral-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${levelColors[row.level] ?? 'bg-neutral-100'}`}>
                  {row.level}
                </span>
                {saved === row.id && (
                  <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest">✓ Guardado</span>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className={lbl}>Nombre</label>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => update(row.id, 'label', e.target.value)}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Coeficiente</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={row.coefficient}
                      onChange={(e) => update(row.id, 'coefficient', parseFloat(e.target.value) || 1)}
                      step="0.1"
                      min="0.1"
                      className={inp + ' pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-bold">×</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1.5">
                    Precio final = precio base × {row.coefficient}
                  </p>
                </div>
                <div>
                  <label className={lbl}>Descripción</label>
                  <textarea
                    value={row.description ?? ''}
                    onChange={(e) => update(row.id, 'description', e.target.value)}
                    rows={3}
                    className={inp}
                  />
                </div>
              </div>

              <button
                onClick={() => handleSave(row)}
                disabled={saving === row.id}
                className="mt-5 w-full bg-neutral-900 text-white py-2.5 text-[10px] font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
              >
                {saving === row.id ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-neutral-50 border border-neutral-100 p-6 max-w-2xl">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Referencia de coeficientes</h3>
        <div className="space-y-2 text-sm text-neutral-600">
          <p><strong>Estándar ×1.0</strong> — Materiales de alta calidad, ejecución profesional. Precio base del catálogo. Equivale a ~650-800 €/m² en reforma completa.</p>
          <p><strong>Premium ×2.0</strong> — Materiales de selección, acabados cuidados, plazos más amplios. Artesanos con mayor especialización. ~1.000-1.300 €/m².</p>
          <p><strong>Lujo ×3.0</strong> — Primera selección de materiales, técnicas artesanales, control de calidad exhaustivo. Tiempos de ejecución 3-4x superiores. ~1.500-2.000 €/m².</p>
        </div>
        <p className="text-[10px] text-neutral-400 mt-3">Los coeficientes se aplican principalmente a mano de obra especializada y tiempo de ejecución. Los precios base ya incluyen materiales de calidad.</p>
      </section>
    </div>
  )
}
