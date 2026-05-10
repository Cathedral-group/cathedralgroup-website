'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Deadline {
  modelo: string
  nombre: string
  descripcion: string | null
  ejercicio: number
  periodo: string
  fecha_limite: string
  days_until_deadline: number
  estado: string
  importe_a_ingresar: number | null
  filing_id: string | null
  is_overdue: boolean
}

interface MarkPresentedModalState {
  modelo: string
  ejercicio: number
  periodo: string
  importe: string
  csv_aeat: string
  notes: string
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function FiscalCalendarCompact() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)
  const [markModal, setMarkModal] = useState<MarkPresentedModalState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fiscal/upcoming?days_ahead=90&days_overdue=30', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setDeadlines(json.deadlines ?? [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleMarkPresented = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!markModal) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const payload: Record<string, unknown> = {
        modelo: markModal.modelo,
        ejercicio: markModal.ejercicio,
        periodo: markModal.periodo,
      }
      if (markModal.importe) payload.importe_a_ingresar = parseFloat(markModal.importe)
      if (markModal.csv_aeat) payload.csv_aeat = markModal.csv_aeat.trim()
      if (markModal.notes) payload.notes = markModal.notes.trim()

      const res = await fetch('/api/fiscal/mark-presented', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      setMarkModal(null)
      await load()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || deadlines.length === 0) return null

  // Top 5: vencidos primero (ya vienen ordenados), luego próximos
  const top = deadlines.slice(0, 5)
  const overdueCount = deadlines.filter((d) => d.is_overdue).length
  const within7d = deadlines.filter((d) => !d.is_overdue && d.days_until_deadline <= 7).length

  const headerColor = overdueCount > 0
    ? 'bg-red-50 border-red-200'
    : within7d > 0
    ? 'bg-amber-50 border-amber-200'
    : 'bg-neutral-50 border-neutral-200'

  return (
    <div className={`${headerColor} border rounded-lg p-4 mb-4`}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            🗓️ Calendario fiscal AEAT
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5 leading-tight max-w-2xl">
            Modelos a presentar en Hacienda. Cada trimestre/año hay declaraciones obligatorias para Cathedral SL.
            Los vencidos aparecen primero en rojo.
          </p>
        </div>
        {(overdueCount > 0 || within7d > 0) && (
          <div className="text-right text-xs flex items-center gap-3">
            {overdueCount > 0 && (
              <span className="text-red-700 font-bold">⚠ {overdueCount} vencido{overdueCount !== 1 ? 's' : ''}</span>
            )}
            {within7d > 0 && (
              <span className="text-amber-700 font-bold">⏰ {within7d} en 7d</span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5 mt-3">
        {top.map((d) => {
          const color = d.is_overdue
            ? 'bg-red-100 border-red-300 text-red-900'
            : d.days_until_deadline <= 7
            ? 'bg-amber-100 border-amber-300 text-amber-900'
            : 'bg-white border-neutral-200 text-neutral-700'
          const daysLabel = d.is_overdue
            ? `Vencido hace ${Math.abs(d.days_until_deadline)}d`
            : d.days_until_deadline === 0
            ? 'Hoy'
            : d.days_until_deadline === 1
            ? 'Mañana'
            : `En ${d.days_until_deadline}d`
          return (
            <div
              key={`${d.modelo}-${d.ejercicio}-${d.periodo}`}
              className={`${color} border rounded px-3 py-2 flex items-center gap-3 text-sm`}
            >
              <span className="font-bold text-xs px-2 py-0.5 bg-white rounded border border-current">
                {d.modelo}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {d.nombre} · {d.periodo} {d.ejercicio}
                </div>
                <div className="text-[10px] opacity-70">{fmtDate(d.fecha_limite)}</div>
              </div>
              <span className="text-xs font-bold whitespace-nowrap">{daysLabel}</span>
              {d.estado !== 'pendiente' ? (
                <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-green-200 text-green-800">
                  {d.estado}
                </span>
              ) : (
                <button
                  onClick={() =>
                    setMarkModal({
                      modelo: d.modelo,
                      ejercicio: d.ejercicio,
                      periodo: d.periodo,
                      importe: d.importe_a_ingresar?.toString() ?? '',
                      csv_aeat: '',
                      notes: '',
                    })
                  }
                  className="text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-white border border-current hover:bg-current hover:text-white transition-colors whitespace-nowrap"
                  title="Marcar como presentado en AEAT"
                >
                  ✓ Presentado
                </button>
              )}
            </div>
          )
        })}
      </div>
      {deadlines.length > 5 && (
        <Link
          href="/admin/documentos/fiscal"
          className="mt-3 block text-center text-[11px] uppercase tracking-widest text-neutral-500 hover:text-neutral-900"
        >
          Ver todos ({deadlines.length}) →
        </Link>
      )}

      {/* Modal Marcar presentado */}
      {markModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-neutral-800 mb-1">
              Marcar modelo {markModal.modelo} como presentado
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              {markModal.periodo} {markModal.ejercicio} · Quedará registrado en{' '}
              <code className="text-[10px] bg-neutral-100 px-1">tax_filings</code> con
              estado=presentado y desaparecerá de los próximos vencimientos.
            </p>

            {errorMsg && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleMarkPresented} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">
                  Importe a ingresar (opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={markModal.importe}
                  onChange={(e) => setMarkModal({ ...markModal, importe: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">
                  CSV AEAT (opcional)
                </label>
                <input
                  type="text"
                  value={markModal.csv_aeat}
                  onChange={(e) => setMarkModal({ ...markModal, csv_aeat: e.target.value })}
                  placeholder="Código Seguro Verificación devuelto por AEAT"
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">
                  Notas
                </label>
                <textarea
                  value={markModal.notes}
                  onChange={(e) => setMarkModal({ ...markModal, notes: e.target.value })}
                  placeholder="Notas internas (opcional)"
                  rows={2}
                  className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMarkModal(null)}
                  disabled={submitting}
                  className="text-sm text-neutral-500 hover:text-neutral-800 px-3 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-white px-4 py-2 rounded text-sm font-semibold hover:bg-[#5A5550] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Guardando…' : '✓ Marcar presentado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
