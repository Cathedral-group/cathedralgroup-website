'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

interface Employee {
  id: string
  nombre: string | null
  nif: string | null
  fecha_baja?: string | null
}

interface Balance {
  employee: Employee
  balance: {
    employee_id: string
    extras_acumuladas: number
    descontadas: number
    saldo_horas: number
  } | null
}

interface Redemption {
  id: string
  employee_id: string
  fecha: string
  horas_descontadas: number
  motivo: string | null
  modo_canje?: string | null
  status?: string
  requested_at?: string | null
  requested_motivo?: string | null
  decided_at?: string | null
  decided_by_email?: string | null
  decision_notes?: string | null
  created_at: string
  created_by_email: string | null
  employee: { id: string; nombre: string | null } | { id: string; nombre: string | null }[] | null
}

const MODO_LABELS: Record<string, string> = {
  descanso_dia: '🏖️ Día completo (8h)',
  descanso_medio_dia: '🌗 Medio día (4h)',
  descanso_horas: '⏰ Horas sueltas',
  pago_nomina: '💶 Pago en nómina',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Aprobado', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelado', cls: 'bg-stone-100 text-stone-600' },
}

interface Props {
  balances: Balance[]
  redemptions: Redemption[]
}

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function BancoHorasView({ balances, redemptions: initialRedemptions }: Props) {
  const [redemptions, setRedemptions] = useState<Redemption[]>(initialRedemptions)
  const [busyId, setBusyId] = useState<string | null>(null)
  const pending = redemptions.filter((r) => r.status === 'pending')

  async function decidir(id: string, action: 'approve' | 'reject') {
    const notes = action === 'reject' ? (prompt('Motivo del rechazo (opcional):') ?? undefined) : undefined
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/personal/canjes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        alert(json.error ?? 'Error decidiendo canje')
        return
      }
      setRedemptions((prev) => prev.map((r) => (r.id === id ? { ...r, ...json.row } : r)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }
  const [showForm, setShowForm] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [horas, setHoras] = useState<number>(8)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalAcumulado = useMemo(
    () => balances.reduce((acc, b) => acc + Number(b.balance?.extras_acumuladas ?? 0), 0),
    [balances],
  )
  const totalDescontado = useMemo(
    () => balances.reduce((acc, b) => acc + Number(b.balance?.descontadas ?? 0), 0),
    [balances],
  )

  async function crear() {
    if (!employeeId) {
      setError('Selecciona un trabajador')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/personal/banco-horas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          fecha,
          horas_descontadas: horas,
          motivo: motivo.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al guardar')
      } else {
        setShowForm(false)
        setEmployeeId('')
        setMotivo('')
        setHoras(8)
        // Refrescar
        window.location.reload()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <span className="text-stone-900">Banco de horas extras</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Banco de horas extras por trabajador
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Saldo de horas extras acumuladas en modo "compensar" menos canjes (días/horas
            libres tomados a cuenta del banco). Cuando el trabajador toma media jornada o un
            día libre a cuenta de horas extras, lo descuentas aquí.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Resumen */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-stone-500">Acumulado</div>
            <div className="mt-1 text-2xl font-light tabular-nums">{totalAcumulado.toFixed(1)}h</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-stone-500">Descontado</div>
            <div className="mt-1 text-2xl font-light tabular-nums">{totalDescontado.toFixed(1)}h</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-900 p-4 text-center text-white">
            <div className="text-xs uppercase tracking-wider text-stone-300">Saldo total</div>
            <div className="mt-1 text-2xl font-medium tabular-nums">
              {(totalAcumulado - totalDescontado).toFixed(1)}h
            </div>
          </div>
        </div>

        {/* Saldos por trabajador */}
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Por trabajador
        </h2>
        {balances.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No hay trabajadores activos.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Trabajador</th>
                  <th className="px-4 py-2.5 text-right">Acumulado</th>
                  <th className="px-4 py-2.5 text-right">Descontado</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {balances.map((b) => {
                  const saldo = Number(b.balance?.saldo_horas ?? 0)
                  return (
                    <tr key={b.employee.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{(b.employee.nombre ?? '').trim() || '—'}</div>
                        <div className="font-mono text-[11px] text-stone-500">{b.employee.nif}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(b.balance?.extras_acumuladas ?? 0).toFixed(1)}h
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(b.balance?.descontadas ?? 0).toFixed(1)}h
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                          saldo > 0
                            ? 'text-emerald-700'
                            : saldo < 0
                              ? 'text-red-700'
                              : 'text-stone-500'
                        }`}
                      >
                        {saldo > 0 ? '+' : ''}
                        {saldo.toFixed(1)}h
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Canjes pendientes solicitados por trabajadores */}
        {pending.length > 0 && (
          <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-amber-900 mb-3">
              ⏳ Canjes pendientes de aprobar ({pending.length})
            </h2>
            <ul className="space-y-2">
              {pending.map((r) => {
                const emp = singleRef(r.employee)
                return (
                  <li key={r.id} className="rounded bg-white border border-amber-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-900">
                          {emp?.nombre ?? '—'}
                          <span className="ml-2 text-xs text-stone-500">
                            {MODO_LABELS[r.modo_canje ?? ''] ?? r.modo_canje ?? '—'}
                          </span>
                        </div>
                        <div className="mt-1 text-stone-700">
                          <span className="font-mono text-xs">{r.fecha}</span>
                          <span className="ml-2 text-xs text-stone-500">({r.horas_descontadas} h)</span>
                        </div>
                        {r.requested_motivo && (
                          <div className="mt-1 text-xs text-stone-500">Motivo: {r.requested_motivo}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decidir(r.id, 'approve')}
                          className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          ✓ Aprobar
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decidir(r.id, 'reject')}
                          className="rounded border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50 disabled:opacity-50"
                        >
                          ✕ Rechazar
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Botón nuevo canje */}
        <div className="mt-5">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800"
            >
              + Nuevo canje (descontar horas)
            </button>
          ) : (
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <h3 className="text-sm font-medium uppercase tracking-wider text-stone-700">
                Descontar horas del banco
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Trabajador *
                  </label>
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— seleccionar —</option>
                    {balances.map((b) => (
                      <option key={b.employee.id} value={b.employee.id}>
                        {(b.employee.nombre ?? '').trim()} (saldo:{' '}
                        {Number(b.balance?.saldo_horas ?? 0).toFixed(1)}h)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Horas a descontar *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={horas}
                    onChange={(e) => setHoras(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Motivo
                  </label>
                  <input
                    type="text"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="ej: media jornada libre el viernes"
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              {error && (
                <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                  ⚠️ {error}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={crear}
                  disabled={saving}
                  className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Descontar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setError(null)
                  }}
                  className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Histórico canjes */}
        {redemptions.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
              Histórico de canjes ({redemptions.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Trabajador</th>
                    <th className="px-4 py-2 text-right">Horas</th>
                    <th className="px-4 py-2">Motivo</th>
                    <th className="px-4 py-2">Creado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {redemptions.map((r) => {
                    const emp = singleRef(r.employee)
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2 font-mono text-xs">{r.fecha}</td>
                        <td className="px-4 py-2 text-xs">{(emp?.nombre ?? '').trim()}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-red-700">
                          -{Number(r.horas_descontadas).toFixed(1)}h
                        </td>
                        <td className="px-4 py-2 text-xs text-stone-600">{r.motivo ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-stone-500">
                          {r.created_by_email ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
