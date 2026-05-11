'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

interface Employee {
  id: string
  nombre: string | null
  nif: string | null
}

interface Absence {
  id: string
  tipo: string
  motivo_detalle: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_total: number
  horas_total: number | null
  solicitado_at: string
  solicitado_por: string | null
  solicitud_fuente: string
  status: string
  decided_at: string | null
  decided_by_email: string | null
  decision_notes: string | null
  justificante_attachment_id: string | null
  cancellation_requested_at?: string | null
  cancellation_requested_motivo?: string | null
  cancellation_decided_at?: string | null
  cancellation_decision?: 'approved' | 'rejected' | null
  cancellation_admin_motivo?: string | null
  employee: { id: string; nombre: string | null; nif: string | null }
    | { id: string; nombre: string | null; nif: string | null }[]
    | null
}

interface Props {
  initialAbsences: Absence[]
  employees: Employee[]
}

const TIPO_LABELS: Record<string, string> = {
  vacaciones: '🏖️ Vacaciones',
  baja_medica: '🏥 Baja médica',
  permiso_retribuido: '📋 Permiso',
  asuntos_propios: '📅 Asuntos propios',
  banco_horas: '🪙 Banco horas',
  ausencia_no_justificada: '⚠️ No justificada',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada', cls: 'bg-stone-100 text-stone-600' },
}

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function AusenciasAdminView({ initialAbsences, employees }: Props) {
  const [absences, setAbsences] = useState<Absence[]>(initialAbsences)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  // Form crear directa (admin)
  const [createEmp, setCreateEmp] = useState('')
  const [createTipo, setCreateTipo] = useState('vacaciones')
  const [createDesde, setCreateDesde] = useState('')
  const [createHasta, setCreateHasta] = useState('')
  const [createMotivo, setCreateMotivo] = useState('')

  const filtered = useMemo(() => {
    if (filter === 'all') return absences
    return absences.filter((a) => a.status === filter)
  }, [absences, filter])

  const counts = useMemo(
    () => ({
      pending: absences.filter((a) => a.status === 'pending').length,
      approved: absences.filter((a) => a.status === 'approved').length,
      total: absences.length,
    }),
    [absences],
  )

  async function decidir(id: string, status: 'approved' | 'rejected', notes?: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/personal/ausencias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, decision_notes: notes }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al decidir')
      } else {
        setAbsences((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.row } : a)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  // Cancelar directamente (admin) — pide motivo
  async function cancelarDirecto(id: string) {
    const motivo = prompt('Motivo de la cancelación (queda registrado):')
    if (motivo === null) return // canceló el prompt
    setBusyId(id); setError(null)
    try {
      const res = await fetch(`/api/admin/personal/ausencias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancellation_admin_motivo: motivo.trim() || 'Cancelada por admin',
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al cancelar'); return }
      setAbsences((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.row } : a)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  // Decisión sobre solicitud de cancelación del trabajador
  async function decidirCancelacion(id: string, decision: 'approved' | 'rejected') {
    setBusyId(id); setError(null)
    try {
      const res = await fetch(`/api/admin/personal/ausencias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancellation_decision: decision }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error al decidir cancelación'); return }
      setAbsences((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.row } : a)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  async function crear() {
    if (!createEmp || !createDesde || !createHasta) {
      setError('Empleado y fechas requeridas')
      return
    }
    setBusyId('new')
    setError(null)
    try {
      const res = await fetch('/api/admin/personal/ausencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: createEmp,
          tipo: createTipo,
          fecha_inicio: createDesde,
          fecha_fin: createHasta,
          motivo_detalle: createMotivo.trim() || undefined,
          status: 'approved',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al crear')
      } else {
        // Recargar para tener employee join
        window.location.reload()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <span className="text-stone-900">Ausencias</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Ausencias trabajadores
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Vacaciones, bajas, permisos. Aprueba o rechaza solicitudes del portal, o crea
            ausencias directamente desde aquí.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {(['pending', 'approved', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                filter === f
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {f === 'pending' && `Pendientes (${counts.pending})`}
              {f === 'approved' && `Aprobadas (${counts.approved})`}
              {f === 'all' && `Todas (${counts.total})`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="ml-auto rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
          >
            + Crear ausencia
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {showCreate && (
          <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-stone-700">
              Crear ausencia (auto-aprobada)
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <select
                value={createEmp}
                onChange={(e) => setCreateEmp(e.target.value)}
                className="rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                <option value="">— Trabajador —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {(emp.nombre ?? '').trim()}
                  </option>
                ))}
              </select>
              <select
                value={createTipo}
                onChange={(e) => setCreateTipo(e.target.value)}
                className="rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={createDesde}
                onChange={(e) => setCreateDesde(e.target.value)}
                className="rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={createHasta}
                onChange={(e) => setCreateHasta(e.target.value)}
                className="rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={createMotivo}
                onChange={(e) => setCreateMotivo(e.target.value)}
                placeholder="Motivo (opcional)"
                className="rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={crear}
              disabled={busyId === 'new'}
              className="mt-3 rounded bg-emerald-700 px-4 py-1.5 text-sm text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {busyId === 'new' ? 'Creando…' : 'Crear y aprobar'}
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No hay ausencias en este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-3 py-2.5">Trabajador</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Periodo</th>
                  <th className="px-3 py-2.5 text-right">Días</th>
                  <th className="px-3 py-2.5">Detalle</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((a) => {
                  const emp = singleRef(a.employee)
                  const status = STATUS_LABELS[a.status] ?? STATUS_LABELS.pending
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2.5 text-xs">
                        {(emp?.nombre ?? '').trim() || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {TIPO_LABELS[a.tipo] ?? a.tipo}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {a.fecha_inicio} → {a.fecha_fin}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{a.dias_total}</td>
                      <td className="px-3 py-2.5 text-xs text-stone-600">
                        {a.motivo_detalle ?? '—'}
                        {a.solicitud_fuente === 'portal' && (
                          <div className="text-[10px] text-stone-400">📱 Solicitud trabajador</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {/* Solicitud de cancelación del trabajador, pendiente de respuesta */}
                        {a.status === 'approved' && a.cancellation_requested_at && !a.cancellation_decided_at ? (
                          <div className="flex flex-col gap-1 min-w-[160px]">
                            <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] text-amber-800">
                              ⏳ Pide cancelar
                            </span>
                            {a.cancellation_requested_motivo && (
                              <span className="text-[10px] text-stone-500 line-clamp-2">
                                {a.cancellation_requested_motivo}
                              </span>
                            )}
                            <div className="flex gap-1 mt-1">
                              <button
                                type="button"
                                disabled={busyId === a.id}
                                onClick={() => {
                                  if (!confirm('¿Aceptar la cancelación? (si es banco_horas se restituyen las horas)')) return
                                  decidirCancelacion(a.id, 'approved')
                                }}
                                className="rounded bg-stone-900 px-2 py-1 text-[10px] text-white hover:bg-stone-800 disabled:opacity-50"
                              >
                                Aceptar cancelación
                              </button>
                              <button
                                type="button"
                                disabled={busyId === a.id}
                                onClick={() => {
                                  if (!confirm('¿Rechazar la cancelación? La ausencia sigue aprobada.')) return
                                  decidirCancelacion(a.id, 'rejected')
                                }}
                                className="rounded border border-stone-300 px-2 py-1 text-[10px] hover:bg-stone-100 disabled:opacity-50"
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        ) : a.status === 'pending' ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => decidir(a.id, 'approved')}
                              className="rounded bg-emerald-700 px-2 py-1 text-[10px] text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => {
                                const notes = prompt('Motivo del rechazo:')
                                if (notes !== null) decidir(a.id, 'rejected', notes)
                              }}
                              className="rounded border border-stone-300 px-2 py-1 text-[10px] hover:bg-stone-100 disabled:opacity-50"
                            >
                              ✕ Rechazar
                            </button>
                          </div>
                        ) : a.status === 'approved' ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-stone-400">
                              {a.decided_by_email ?? '—'}
                            </span>
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => cancelarDirecto(a.id)}
                              className="rounded border border-red-300 px-2 py-1 text-[10px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                              title="Cancelar directamente esta ausencia (con motivo). Si es banco_horas, restituye saldo."
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-400">
                            {a.decided_by_email ?? '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
