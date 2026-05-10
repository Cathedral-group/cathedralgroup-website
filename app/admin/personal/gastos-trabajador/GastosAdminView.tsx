'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

interface Project {
  id: string
  code: string
  name: string | null
}

interface Expense {
  id: string
  fecha: string
  tipo: string
  project_id: string | null
  importe: number | null
  km_recorridos: number | null
  km_origen: string | null
  km_destino: string | null
  material_descripcion: string | null
  material_cantidad: number | null
  material_unidad: string | null
  observaciones: string | null
  fuente: string
  status: string
  reviewed_at: string | null
  reviewed_by_email: string | null
  created_at: string
  employee: { id: string; nombre: string | null; nif: string | null }
    | { id: string; nombre: string | null; nif: string | null }[]
    | null
  project: { id: string; code: string; name: string | null }
    | { id: string; code: string; name: string | null }[]
    | null
}

interface Props {
  initialExpenses: Expense[]
  projects: Project[]
}

const TIPO_LABELS: Record<string, string> = {
  dieta: '🍽️ Dieta',
  kilometraje: '🚗 Km',
  material: '🧱 Material',
  aparcamiento: '🅿️ Aparc.',
  peaje: '🛣️ Peaje',
  otro: '💼 Otro',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Aprobado', cls: 'bg-emerald-100 text-emerald-800' },
  ignored: { label: 'Ignorado', cls: 'bg-stone-100 text-stone-600' },
  reimbursed: { label: 'Reembolsado', cls: 'bg-emerald-100 text-emerald-800' },
}

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n))
}

export default function GastosAdminView({ initialExpenses, projects }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'reimbursed'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return expenses
    return expenses.filter((e) => e.status === filter)
  }, [expenses, filter])

  const counts = useMemo(
    () => ({
      pending: expenses.filter((e) => e.status === 'pending').length,
      confirmed: expenses.filter((e) => e.status === 'confirmed').length,
      reimbursed: expenses.filter((e) => e.status === 'reimbursed').length,
      total: expenses.length,
    }),
    [expenses],
  )

  async function patch(
    id: string,
    update: { status?: string; project_id?: string | null },
  ) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/personal/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al actualizar')
      } else {
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === id
              ? { ...e, ...update, reviewed_at: new Date().toISOString() }
              : e,
          ),
        )
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
            <span className="text-stone-900">Gastos de trabajadores</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Gastos apuntados por trabajadores
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Dietas, kilometraje, material consumido y otros gastos. Apruébalos y márcalos como
            reembolsados cuando los pagues al trabajador.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {(['pending', 'confirmed', 'reimbursed', 'all'] as const).map((f) => (
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
              {f === 'confirmed' && `Aprobados (${counts.confirmed})`}
              {f === 'reimbursed' && `Reembolsados (${counts.reimbursed})`}
              {f === 'all' && `Todos (${counts.total})`}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No hay gastos en este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Trabajador</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Proyecto</th>
                  <th className="px-3 py-2.5">Detalle</th>
                  <th className="px-3 py-2.5 text-right">Importe</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((e) => {
                  const emp = singleRef(e.employee)
                  const proj = singleRef(e.project)
                  const status = STATUS_LABELS[e.status] ?? STATUS_LABELS.pending
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2.5 font-mono text-xs">{e.fecha}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {(emp?.nombre ?? '').trim() || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {TIPO_LABELS[e.tipo] ?? e.tipo}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {proj ? proj.code : (
                          <select
                            disabled={busyId === e.id}
                            onChange={(ev) => {
                              if (ev.target.value)
                                patch(e.id, { project_id: ev.target.value })
                            }}
                            defaultValue=""
                            className="rounded border border-stone-300 px-1 py-0.5 text-xs"
                          >
                            <option value="">— sin —</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {e.tipo === 'kilometraje' ? (
                          <>
                            <span className="font-medium">{e.km_recorridos} km</span>
                            {e.km_origen && e.km_destino && (
                              <div className="text-[10px] text-stone-500">
                                {e.km_origen} → {e.km_destino}
                              </div>
                            )}
                          </>
                        ) : e.tipo === 'material' ? (
                          <>
                            <span className="font-medium">
                              {e.material_cantidad} {e.material_unidad}
                            </span>{' '}
                            {e.material_descripcion}
                          </>
                        ) : (
                          '—'
                        )}
                        {e.observaciones && (
                          <div className="text-[10px] text-stone-500">{e.observaciones}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {e.tipo === 'kilometraje'
                          ? `${e.km_recorridos} km`
                          : eur(e.importe)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {e.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === e.id}
                                onClick={() => patch(e.id, { status: 'confirmed' })}
                                className="rounded bg-emerald-700 px-2 py-1 text-[10px] text-white hover:bg-emerald-800 disabled:opacity-50"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                disabled={busyId === e.id}
                                onClick={() => patch(e.id, { status: 'ignored' })}
                                className="rounded border border-stone-300 px-2 py-1 text-[10px] hover:bg-stone-100 disabled:opacity-50"
                              >
                                ✕
                              </button>
                            </>
                          )}
                          {e.status === 'confirmed' && (
                            <button
                              type="button"
                              disabled={busyId === e.id}
                              onClick={() => patch(e.id, { status: 'reimbursed' })}
                              className="rounded bg-stone-900 px-2 py-1 text-[10px] text-white hover:bg-stone-800 disabled:opacity-50"
                            >
                              💰 pagado
                            </button>
                          )}
                        </div>
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
