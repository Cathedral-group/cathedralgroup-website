'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Redemption {
  id: string
  fecha: string
  horas_descontadas: number
  motivo: string | null
  modo_canje: string | null
  status: string
  requested_at: string | null
  requested_motivo: string | null
  decided_at: string | null
  decision_notes: string | null
  created_at: string
}

interface Balance {
  horas_acumuladas?: number
  horas_canjeadas?: number
  horas_pendientes_canje?: number
  horas_disponibles?: number
}

interface Props {
  token: string
  employeeName: string
  initialRedemptions: Redemption[]
  initialBalance: Balance | null
}

const MODO_LABELS: Record<string, string> = {
  descanso_dia: '🏖️ Día completo de descanso (8h)',
  descanso_medio_dia: '🌗 Medio día de descanso (4h)',
  descanso_horas: '⏰ Horas sueltas',
  pago_nomina: '💶 Pago en nómina',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente decisión', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: '✓ Aprobado', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: '✕ Rechazado', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelado', cls: 'bg-stone-100 text-stone-600' },
}

export default function CanjesView({ token, employeeName, initialRedemptions, initialBalance }: Props) {
  const [redemptions, setRedemptions] = useState<Redemption[]>(initialRedemptions)
  const [balance, setBalance] = useState<Balance | null>(initialBalance)
  const [showForm, setShowForm] = useState(false)
  const [modo, setModo] = useState('descanso_dia')
  const [fecha, setFecha] = useState('')
  const [horas, setHoras] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const disponibles = Number(balance?.horas_disponibles ?? 0)

  async function solicitar() {
    if (!fecha) { setError('Indica la fecha'); return }
    if ((modo === 'descanso_horas' || modo === 'pago_nomina') && (!horas || Number(horas) <= 0)) {
      setError('Indica las horas'); return
    }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const body: Record<string, unknown> = { modo_canje: modo, fecha, motivo: motivo.trim() || undefined }
      if (modo === 'descanso_horas' || modo === 'pago_nomina') body.horas = Number(horas)

      const res = await fetch(`/api/portal/trabajador/${token}/canjes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setError(json.error ?? 'Error'); return }

      setRedemptions((prev) => [json.row, ...prev])
      setShowForm(false)
      setFecha(''); setHoras(''); setMotivo('')
      setSuccess('Solicitud enviada. El admin la revisará.')

      // Refresca balance
      const balRes = await fetch(`/api/portal/trabajador/${token}/canjes`, { cache: 'no-store' })
      if (balRes.ok) {
        const balJson = await balRes.json()
        setBalance(balJson.balance ?? null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function cancelar(id: string) {
    if (!confirm('¿Retirar la solicitud?')) return
    setBusyId(id); setError(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/canjes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'cancel' }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setError(json.error ?? 'Error'); return }
      setRedemptions((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-12">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Link href={`/portal/trabajador/${token}`} className="text-xs text-stone-500 hover:text-stone-900">
            ← Inicio
          </Link>
          <h1 className="mt-1 text-xl font-medium text-stone-900">🪙 Banco de horas</h1>
          <p className="text-xs text-stone-500 mt-0.5">{employeeName}</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 space-y-4">
        {/* Balance */}
        <div className="rounded-lg bg-white border border-stone-200 p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">Tu saldo</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Acumuladas</div>
              <div className="text-lg font-medium tabular-nums">{(balance?.horas_acumuladas ?? 0).toFixed(2)} h</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Canjeadas</div>
              <div className="text-lg font-medium tabular-nums">{(balance?.horas_canjeadas ?? 0).toFixed(2)} h</div>
            </div>
            <div className="col-span-2 pt-3 border-t border-stone-100">
              <div className="text-[10px] uppercase tracking-wider text-stone-400">Disponibles para canjear</div>
              <div className="text-2xl font-medium tabular-nums text-emerald-700">{disponibles.toFixed(2)} h</div>
              {(balance?.horas_pendientes_canje ?? 0) > 0 && (
                <div className="text-[11px] text-amber-700 mt-1">
                  ({(balance?.horas_pendientes_canje ?? 0).toFixed(2)} h pendientes de aprobar)
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">⚠️ {error}</div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">✓ {success}</div>
        )}

        {/* Botón solicitar */}
        {!showForm && disponibles > 0 && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white hover:bg-stone-800"
          >
            + Solicitar canje
          </button>
        )}
        {!showForm && disponibles <= 0 && (
          <p className="text-center text-sm text-stone-500 py-2">
            No tienes horas disponibles para canjear todavía.
          </p>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-medium text-stone-900">Nueva solicitud de canje</h3>

            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">¿Cómo lo quieres?</label>
              <select
                value={modo}
                onChange={(e) => setModo(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              >
                {Object.entries(MODO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            {(modo === 'descanso_horas' || modo === 'pago_nomina') && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Horas {modo === 'pago_nomina' ? 'a pagar' : 'a descansar'} (max {disponibles.toFixed(2)})
                </label>
                <input
                  type="number" step="0.25" min="0" max={disponibles}
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm tabular-nums"
                  placeholder="ej: 4"
                />
              </div>
            )}

            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Motivo (opcional)</label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ej: cita médica, viaje familiar..."
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={solicitar}
                disabled={saving}
                className="flex-1 rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {saving ? 'Enviando...' : 'Enviar solicitud'}
              </button>
              <button
                onClick={() => { setShowForm(false); setError(null) }}
                className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Listado canjes */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">Mis canjes</h2>
          {redemptions.length === 0 ? (
            <p className="text-sm text-stone-500 py-3">No has solicitado canjes todavía.</p>
          ) : (
            <ul className="space-y-2">
              {redemptions.map((r) => {
                const status = STATUS_LABELS[r.status] ?? STATUS_LABELS.pending
                return (
                  <li key={r.id} className="rounded border border-stone-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium">
                        {MODO_LABELS[r.modo_canje ?? ''] ?? r.modo_canje ?? '—'}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>{status.label}</span>
                    </div>
                    <div className="mt-1 text-stone-700">
                      <span className="font-mono text-xs">{r.fecha}</span>
                      <span className="ml-2 text-xs text-stone-500">({r.horas_descontadas} h)</span>
                    </div>
                    {r.requested_motivo && (
                      <div className="mt-1 text-xs text-stone-500">{r.requested_motivo}</div>
                    )}
                    {r.decision_notes && (
                      <div className="mt-1 text-xs text-stone-600">
                        <span className="text-stone-400">Nota admin:</span> {r.decision_notes}
                      </div>
                    )}
                    {r.status === 'pending' && (
                      <button
                        onClick={() => cancelar(r.id)}
                        disabled={busyId === r.id}
                        className="mt-2 rounded border border-stone-300 px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                      >
                        {busyId === r.id ? '...' : 'Retirar solicitud'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
