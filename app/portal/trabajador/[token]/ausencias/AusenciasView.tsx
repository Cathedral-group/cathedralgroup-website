'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Absence {
  id: string
  tipo: string
  motivo_detalle: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_total: number
  horas_total: number | null
  solicitado_at: string
  status: string
  decided_at: string | null
  decision_notes: string | null
  justificante_attachment_id: string | null
  cancellation_requested_at?: string | null
  cancellation_requested_motivo?: string | null
  cancellation_decided_at?: string | null
  cancellation_decision?: 'approved' | 'rejected' | null
}

interface VacationSummary {
  employee_id: string
  anio: number
  dias_anuales: number
  dias_disfrutados: number
  dias_planificados: number
  dias_disponibles: number
}

interface Props {
  token: string
  initialAbsences: Absence[]
  vacationSummary: VacationSummary | null
}

const TIPO_LABELS: Record<string, string> = {
  vacaciones: '🏖️ Vacaciones',
  baja_medica: '🏥 Baja médica',
  permiso_retribuido: '📋 Permiso retribuido',
  asuntos_propios: '📅 Asuntos propios',
  banco_horas: '🪙 Banco horas',
  ausencia_no_justificada: '⚠️ No justificada',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente decisión', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: '✓ Aprobada', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: '✕ Rechazada', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada', cls: 'bg-stone-100 text-stone-600' },
}

export default function AusenciasView({ token, initialAbsences, vacationSummary }: Props) {
  const [absences, setAbsences] = useState<Absence[]>(initialAbsences)
  const [showForm, setShowForm] = useState(false)
  const [tipo, setTipo] = useState('vacaciones')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [motivoDetalle, setMotivoDetalle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function patchAbsence(id: string, action: 'cancel' | 'request_cancellation' | 'cancel_request', motivo?: string) {
    setBusyId(id); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/ausencias`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, motivo }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setError(json.error ?? 'Error'); return }
      // Refresco optimista
      setAbsences((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a
          if (action === 'cancel') return { ...a, status: 'cancelled' }
          if (action === 'request_cancellation') {
            return { ...a, cancellation_requested_at: new Date().toISOString(), cancellation_requested_motivo: motivo ?? null }
          }
          // cancel_request: retira la petición
          return { ...a, cancellation_requested_at: null, cancellation_requested_motivo: null }
        }),
      )
      setSuccess(
        action === 'cancel'
          ? 'Solicitud cancelada.'
          : action === 'request_cancellation'
          ? 'Petición de cancelación enviada. El admin la revisará.'
          : 'Petición de cancelación retirada.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  async function solicitar() {
    if (!fechaInicio || !fechaFin) {
      setError('Indica las fechas')
      return
    }
    if (fechaFin < fechaInicio) {
      setError('La fecha fin no puede ser antes que el inicio')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/ausencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          motivo_detalle: motivoDetalle.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al solicitar')
      } else {
        setSuccess('Solicitud enviada. La administración te avisará.')
        setAbsences((prev) => [json.row, ...prev])
        setShowForm(false)
        setMotivoDetalle('')
        setFechaInicio('')
        setFechaFin('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/portal/trabajador/${token}`}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="text-xl font-medium text-stone-900">Mis ausencias</h1>
      <p className="mt-1 text-sm text-stone-600">
        Vacaciones, bajas médicas, permisos. Solicítalas aquí y la administración te
        avisará cuando estén aprobadas.
      </p>

      {/* Resumen vacaciones */}
      {vacationSummary && (
        <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-stone-500">
            🏖️ Vacaciones {vacationSummary.anio}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xl font-light tabular-nums">
                {vacationSummary.dias_disfrutados}
              </div>
              <div className="text-[10px] text-stone-500">Disfrutadas</div>
            </div>
            <div>
              <div className="text-xl font-light tabular-nums">
                {vacationSummary.dias_planificados - vacationSummary.dias_disfrutados}
              </div>
              <div className="text-[10px] text-stone-500">Planificadas</div>
            </div>
            <div>
              <div className="text-xl font-light tabular-nums text-emerald-700">
                {vacationSummary.dias_disponibles}
              </div>
              <div className="text-[10px] text-stone-500">
                Disponibles (de {vacationSummary.dias_anuales})
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botón nueva solicitud */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-5 w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white hover:bg-stone-800"
        >
          + Nueva solicitud
        </button>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
            Nueva solicitud
          </h2>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                ¿Qué solicitas?
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['vacaciones', 'baja_medica', 'permiso_retribuido', 'asuntos_propios'] as const).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`rounded-lg border px-2 py-2 text-xs transition ${
                        tipo === t
                          ? 'border-stone-900 bg-stone-900 text-white'
                          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {TIPO_LABELS[t]}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Desde *
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Hasta *
                </label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Detalle (opcional)
              </label>
              <input
                type="text"
                value={motivoDetalle}
                onChange={(e) => setMotivoDetalle(e.target.value)}
                placeholder={
                  tipo === 'permiso_retribuido'
                    ? 'ej: matrimonio, mudanza, fallecimiento familiar'
                    : tipo === 'baja_medica'
                      ? 'ej: contractura espalda'
                      : ''
                }
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            {tipo === 'baja_medica' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                💡 Recuerda traer el justificante médico cuando vuelvas. Puedes subirlo desde
                la sección "Tickets" como documento.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                ✓ {success}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={solicitar}
                disabled={saving}
                className="flex-1 rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {saving ? 'Enviando…' : 'Solicitar'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-stone-300 px-4 py-3 text-base hover:bg-stone-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Mis solicitudes ({absences.length})
        </h2>
        {absences.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500">
            No has solicitado ausencias todavía.
          </div>
        ) : (
          <ul className="space-y-2">
            {absences.map((a) => {
              const status = STATUS_LABELS[a.status] ?? STATUS_LABELS.pending
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">
                          {TIPO_LABELS[a.tipo] ?? a.tipo}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-stone-700">
                        Del{' '}
                        <span className="font-mono text-xs">{a.fecha_inicio}</span> al{' '}
                        <span className="font-mono text-xs">{a.fecha_fin}</span>
                        <span className="ml-2 text-xs text-stone-500">
                          ({a.dias_total} día{a.dias_total > 1 ? 's' : ''})
                        </span>
                      </div>
                      {a.motivo_detalle && (
                        <div className="mt-1 text-xs text-stone-500">{a.motivo_detalle}</div>
                      )}
                      {a.decision_notes && (
                        <div className="mt-1 text-xs text-stone-600">
                          <span className="text-stone-400">Nota admin:</span> {a.decision_notes}
                        </div>
                      )}

                      {/* Si tiene petición de cancelación viva (no decidida todavía) */}
                      {a.cancellation_requested_at && !a.cancellation_decided_at && (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                          ⏳ Has pedido cancelarla.
                          {a.cancellation_requested_motivo && (
                            <span className="block text-amber-700 mt-0.5">Motivo: {a.cancellation_requested_motivo}</span>
                          )}
                          <span className="block text-[10px] text-amber-600 mt-0.5">Pendiente de respuesta del admin.</span>
                        </div>
                      )}
                      {a.cancellation_decision === 'rejected' && a.cancellation_decided_at && (
                        <div className="mt-2 rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-700">
                          El admin rechazó tu petición de cancelación.
                        </div>
                      )}

                      {/* Acciones contextuales */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.status === 'pending' && (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => {
                              if (!confirm('¿Cancelar esta solicitud pendiente?')) return
                              patchAbsence(a.id, 'cancel')
                            }}
                            className="rounded border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                          >
                            {busyId === a.id ? '...' : 'Cancelar solicitud'}
                          </button>
                        )}
                        {a.status === 'approved' && !a.cancellation_requested_at && (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => {
                              const motivo = prompt('Motivo de cancelación (opcional):') ?? undefined
                              if (motivo === null) return
                              patchAbsence(a.id, 'request_cancellation', motivo || undefined)
                            }}
                            className="rounded border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                          >
                            {busyId === a.id ? '...' : 'Pedir cancelación'}
                          </button>
                        )}
                        {a.status === 'approved' && a.cancellation_requested_at && !a.cancellation_decided_at && (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => {
                              if (!confirm('¿Retirar la petición de cancelación?')) return
                              patchAbsence(a.id, 'cancel_request')
                            }}
                            className="rounded border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                          >
                            {busyId === a.id ? '...' : 'Retirar petición'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
