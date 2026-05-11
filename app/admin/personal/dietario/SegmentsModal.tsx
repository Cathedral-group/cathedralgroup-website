'use client'

/**
 * Editor de tramos múltiples (segments) para un parte de horas existente.
 *
 * Caso: el trabajador estuvo en obra A de 8:00 a 12:00 y en obra B de 12:00 a 17:00.
 * Sin segments → time_records guarda 1 proyecto + horas totales (modo simple).
 * Con segments → cada tramo lleva su proyecto + horas; trigger BD recalcula time_records.
 *
 * Props:
 *   recordId: id del time_record padre
 *   fecha:    fecha del parte (solo display)
 *   employeeName: nombre del trabajador (solo display)
 *   projects: lista de proyectos activos (para el selector)
 *   onClose:  callback al cerrar
 *   onSaved:  callback tras guardar (refresca dietario)
 */

import { useEffect, useState } from 'react'

interface ProjectRef {
  id: string
  code: string
  name?: string | null
}

interface SegmentRow {
  id?: string
  project_id: string | null
  hora_inicio: string
  hora_fin: string
  horas_ordinarias: string
  horas_extra: string
  horas_nocturnas: string
  observaciones: string
}

interface Props {
  recordId: string
  fecha: string
  employeeName: string
  projects: ProjectRef[]
  onClose: () => void
  onSaved: () => void
}

function emptySegment(): SegmentRow {
  return {
    project_id: null,
    hora_inicio: '',
    hora_fin: '',
    horas_ordinarias: '',
    horas_extra: '',
    horas_nocturnas: '',
    observaciones: '',
  }
}

export default function SegmentsModal({
  recordId, fecha, employeeName, projects, onClose, onSaved,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [segments, setSegments] = useState<SegmentRow[]>([emptySegment()])

  // Cargar tramos existentes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/personal/segments/${recordId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`Error ${res.status}`)
        const json = await res.json()
        const existing: SegmentRow[] = (json.segments ?? []).map((s: Record<string, unknown>) => ({
          id: s.id as string | undefined,
          project_id: (s.project_id as string | null) ?? null,
          hora_inicio: ((s.hora_inicio as string | null) ?? '').slice(0, 5),
          hora_fin: ((s.hora_fin as string | null) ?? '').slice(0, 5),
          horas_ordinarias: String(s.horas_ordinarias ?? ''),
          horas_extra: String(s.horas_extra ?? ''),
          horas_nocturnas: String(s.horas_nocturnas ?? ''),
          observaciones: (s.observaciones as string) ?? '',
        }))
        if (!cancelled) setSegments(existing.length > 0 ? existing : [emptySegment()])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando tramos')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [recordId])

  function update(idx: number, patch: Partial<SegmentRow>) {
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function add() {
    if (segments.length >= 12) return
    // Pre-rellenar hora_inicio del nuevo con hora_fin del anterior
    const last = segments[segments.length - 1]
    setSegments((prev) => [...prev, { ...emptySegment(), hora_inicio: last?.hora_fin ?? '' }])
  }

  function remove(idx: number) {
    setSegments((prev) => prev.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      const payload = segments.map((s, i) => ({
        project_id: s.project_id || null,
        hora_inicio: s.hora_inicio || null,
        hora_fin: s.hora_fin || null,
        horas_ordinarias: parseFloat(s.horas_ordinarias) || 0,
        horas_extra: parseFloat(s.horas_extra) || 0,
        horas_nocturnas: parseFloat(s.horas_nocturnas) || 0,
        observaciones: s.observaciones.trim() || null,
        orden: i + 1,
      }))
      const res = await fetch(`/api/admin/personal/segments/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: payload }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error guardando')
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  async function deleteAll() {
    if (!confirm('¿Eliminar todos los tramos? El parte volverá al modo simple (1 proyecto + horas totales).')) return
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/admin/personal/segments/${recordId}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `Error ${res.status}`)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error borrando')
    } finally {
      setDeleting(false)
    }
  }

  const totalOrd = segments.reduce((s, x) => s + (parseFloat(x.horas_ordinarias) || 0), 0)
  const totalExt = segments.reduce((s, x) => s + (parseFloat(x.horas_extra) || 0), 0)
  const totalNoc = segments.reduce((s, x) => s + (parseFloat(x.horas_nocturnas) || 0), 0)
  const totalAll = totalOrd + totalExt + totalNoc

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">
              Tramos del día — {employeeName}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {fecha} · Trabajador en varias obras durante el día
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-stone-500">Cargando tramos...</div>
        ) : (
          <div className="p-5 space-y-3">
            {error && (
              <div className="rounded border border-red-300 bg-red-50 p-2.5 text-sm text-red-700">⚠️ {error}</div>
            )}

            {segments.map((s, idx) => (
              <div key={idx} className="border border-stone-200 rounded p-3 bg-stone-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                    Tramo {idx + 1}
                  </span>
                  {segments.length > 1 && (
                    <button
                      onClick={() => remove(idx)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">Proyecto</label>
                    <select
                      value={s.project_id ?? ''}
                      onChange={(e) => update(idx, { project_id: e.target.value || null })}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">— Sin proyecto —</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">Desde</label>
                    <input
                      type="time"
                      value={s.hora_inicio}
                      onChange={(e) => update(idx, { hora_inicio: e.target.value })}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">Hasta</label>
                    <input
                      type="time"
                      value={s.hora_fin}
                      onChange={(e) => update(idx, { hora_fin: e.target.value })}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">H. Ord</label>
                    <input
                      type="number" step="0.25" min="0"
                      value={s.horas_ordinarias}
                      onChange={(e) => update(idx, { horas_ordinarias: e.target.value })}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">H. Ext</label>
                    <input
                      type="number" step="0.25" min="0"
                      value={s.horas_extra}
                      onChange={(e) => update(idx, { horas_extra: e.target.value })}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="block text-[10px] uppercase tracking-wider text-stone-500">Observaciones (opcional)</label>
                  <input
                    type="text"
                    value={s.observaciones}
                    onChange={(e) => update(idx, { observaciones: e.target.value })}
                    placeholder="Ej: cambio de obra por necesidad operativa"
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            ))}

            <button
              onClick={add}
              disabled={segments.length >= 12}
              className="w-full rounded border-2 border-dashed border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              + Añadir otro tramo
            </button>

            <div className="rounded bg-stone-100 px-3 py-2 text-xs text-stone-700">
              Total del día: <strong>{totalAll.toFixed(2)} h</strong>{' '}
              ({totalOrd.toFixed(2)} ord + {totalExt.toFixed(2)} ext + {totalNoc.toFixed(2)} noc)
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={deleteAll}
                disabled={deleting || saving}
                className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? '...' : 'Volver a modo simple'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={saving || deleting}
                  className="rounded border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving || deleting || segments.length === 0}
                  className="rounded bg-stone-900 px-4 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar tramos'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
