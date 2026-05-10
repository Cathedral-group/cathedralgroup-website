'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Employee {
  id: string
  nombre: string | null
  nif: string | null
}

interface Project {
  id: string
  code: string
  name?: string | null
  status?: string | null
}

interface Assignment {
  id: string
  fecha: string
  employee_id: string
  project_id: string | null
  jornada_esperada_horas: number | null
  notas: string | null
  project?: { id: string; code: string; name?: string | null } | { id: string; code: string; name?: string | null }[] | null
}

interface Holiday {
  fecha: string
  nombre: string
  ambito: string
}

interface JornadaDia {
  fecha: string
  horas: number
}

interface Props {
  employees: Employee[]
  projects: Project[]
  assignments: Assignment[]
  days: string[]
  mondayIso: string
  holidays: Holiday[]
  jornadas: JornadaDia[]
  vista: 'semana' | 'mes'
}

const DOW_LABEL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function shiftWeek(mondayIso: string, weeks: number): string {
  const d = new Date(mondayIso + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

function shiftMonth(anyDayIso: string, months: number): string {
  // Devuelve YYYY-MM del mes desplazado relativo al mes que cubre el rango
  const d = new Date(anyDayIso + 'T00:00:00')
  // Apuntar al día 15 del mes para evitar problemas de overflow
  const target = new Date(d.getFullYear(), d.getMonth() + months, 15)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(firstIso: string): string {
  // El "mes" de la vista es el mes del día 15 del rango (mayor cobertura)
  const d = new Date(firstIso + 'T00:00:00')
  // Avanzar al día 15
  d.setDate(15)
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()}`
}

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10)
}

export default function CuadranteView({
  employees,
  projects,
  assignments: initialAssignments,
  days,
  mondayIso,
  holidays,
  jornadas,
  vista,
}: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [editing, setEditing] = useState<{ employeeId: string; fecha: string } | null>(null)
  const [editProjectId, setEditProjectId] = useState<string>('')
  const [editJornada, setEditJornada] = useState<number>(9)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const holidayByDate = new Map<string, Holiday>()
  for (const h of holidays) holidayByDate.set(h.fecha, h)
  const jornadaByDate = new Map<string, number>()
  for (const j of jornadas) jornadaByDate.set(j.fecha, j.horas)

  function findAssignment(employeeId: string, fecha: string): Assignment | null {
    return assignments.find((a) => a.employee_id === employeeId && a.fecha === fecha) ?? null
  }

  function startEdit(employeeId: string, fecha: string) {
    const existing = findAssignment(employeeId, fecha)
    const jornadaEsperada = jornadaByDate.get(fecha) ?? 9
    setEditing({ employeeId, fecha })
    setEditProjectId(existing?.project_id ?? '')
    setEditJornada(Number(existing?.jornada_esperada_horas ?? jornadaEsperada))
    setError(null)
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/personal/cuadrante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: editing.employeeId,
          fecha: editing.fecha,
          project_id: editProjectId || null,
          jornada_esperada_horas: editJornada,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al guardar')
      } else {
        // Actualizar estado local
        const proj = projects.find((p) => p.id === editProjectId)
        const newAssignment: Assignment = {
          id: json.row?.id ?? `temp-${Date.now()}`,
          fecha: editing.fecha,
          employee_id: editing.employeeId,
          project_id: editProjectId || null,
          jornada_esperada_horas: editJornada,
          notas: null,
          project: proj
            ? { id: proj.id, code: proj.code, name: proj.name ?? null }
            : null,
        }
        setAssignments((prev) => {
          const filtered = prev.filter(
            (a) => !(a.employee_id === editing.employeeId && a.fecha === editing.fecha),
          )
          return [...filtered, newAssignment]
        })
        setEditing(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function clearAssignment(employeeId: string, fecha: string) {
    const existing = findAssignment(employeeId, fecha)
    if (!existing) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/personal/cuadrante?id=${encodeURIComponent(existing.id)}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al borrar')
      } else {
        setAssignments((prev) => prev.filter((a) => a.id !== existing.id))
        setEditing(null)
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
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <span className="text-stone-900">Cuadrante semanal</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Cuadrante semanal — qué proyecto está cada trabajador cada día
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Cuando el trabajador abra su portal, verá pre-rellenado el proyecto que has asignado.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Toggle vista */}
        <div className="mb-3 inline-flex rounded-lg border border-stone-300 p-0.5">
          <Link
            href="/admin/personal/cuadrante?vista=semana"
            className={`rounded-md px-3 py-1 text-xs transition ${
              vista === 'semana' ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            Vista semana
          </Link>
          <Link
            href="/admin/personal/cuadrante?vista=mes"
            className={`rounded-md px-3 py-1 text-xs transition ${
              vista === 'mes' ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
            }`}
          >
            Vista mes
          </Link>
        </div>

        {/* Navegación */}
        {vista === 'semana' ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
            <Link
              href={`/admin/personal/cuadrante?vista=semana&semana=${shiftWeek(mondayIso, -1)}`}
              className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              ← Semana anterior
            </Link>
            <span className="text-sm font-medium">
              Semana del {days[0]} al {days[days.length - 1]}
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/personal/cuadrante?vista=semana"
                className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
              >
                Esta semana
              </Link>
              <Link
                href={`/admin/personal/cuadrante?vista=semana&semana=${shiftWeek(mondayIso, 1)}`}
                className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
              >
                Semana siguiente →
              </Link>
            </div>
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
            <Link
              href={`/admin/personal/cuadrante?vista=mes&mes=${shiftMonth(days[0], -1)}`}
              className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              ← Mes anterior
            </Link>
            <span className="text-sm font-medium">
              {monthLabel(days[0])} {/* Mes que cubre la mayor parte */}
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/personal/cuadrante?vista=mes"
                className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
              >
                Este mes
              </Link>
              <Link
                href={`/admin/personal/cuadrante?vista=mes&mes=${shiftMonth(days[0], 1)}`}
                className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
              >
                Mes siguiente →
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {employees.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No hay trabajadores activos en la empresa.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="sticky left-0 bg-stone-50 px-4 py-2.5 min-w-[180px]">
                    Trabajador
                  </th>
                  {days.map((d) => {
                    const holiday = holidayByDate.get(d)
                    const horas = jornadaByDate.get(d) ?? 0
                    const dt = new Date(d + 'T00:00:00')
                    const dow = dt.getDay() // 0=dom...6=sab
                    const labelIdx = dow === 0 ? 6 : dow - 1
                    const isWeekend = dow === 0 || dow === 6
                    const cellMin = vista === 'mes' ? 'min-w-[60px]' : 'min-w-[110px]'
                    return (
                      <th
                        key={d}
                        className={`px-2 py-2 text-center ${cellMin} ${
                          isToday(d) ? 'bg-amber-50 text-amber-900' : ''
                        } ${isWeekend ? 'bg-stone-100' : ''} ${
                          holiday ? 'bg-rose-50 text-rose-900' : ''
                        }`}
                        title={holiday?.nombre ?? ''}
                      >
                        <div className="text-[10px]">{DOW_LABEL[labelIdx]}</div>
                        <div className={vista === 'mes' ? 'text-xs font-medium' : 'text-base font-medium'}>{dayLabel(d)}</div>
                        {holiday ? (
                          vista === 'semana' && (
                            <div className="text-[9px] mt-0.5 truncate" style={{ maxWidth: '110px' }}>
                              {holiday.nombre}
                            </div>
                          )
                        ) : (
                          vista === 'semana' && (
                            <div className="text-[9px] mt-0.5 text-stone-500">{horas}h</div>
                          )
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="sticky left-0 bg-white px-4 py-2.5 align-top">
                      <div className="font-medium text-stone-900">
                        {(e.nombre ?? '').trim() || '—'}
                      </div>
                      {e.nif && (
                        <div className="font-mono text-[11px] text-stone-500">{e.nif}</div>
                      )}
                    </td>
                    {days.map((d) => {
                      const a = findAssignment(e.id, d)
                      const proj = singleProj(a?.project)
                      const isEditing = editing?.employeeId === e.id && editing.fecha === d
                      const isHoliday = holidayByDate.has(d)
                      const horas = jornadaByDate.get(d) ?? 0
                      return (
                        <td
                          key={d}
                          className={`px-2 py-2 align-top ${isToday(d) ? 'bg-amber-50/30' : ''} ${
                            isHoliday ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          {isHoliday ? (
                            <div className="text-center text-[10px] text-rose-700 italic">
                              No laborable
                            </div>
                          ) : isEditing ? (
                            <div className="space-y-1">
                              <select
                                value={editProjectId}
                                onChange={(ev) => setEditProjectId(ev.target.value)}
                                className="w-full rounded border border-stone-300 px-1.5 py-1 text-xs"
                              >
                                <option value="">— Sin proyecto</option>
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.code}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="24"
                                value={editJornada}
                                onChange={(ev) => setEditJornada(parseFloat(ev.target.value) || 0)}
                                placeholder="h"
                                className="w-full rounded border border-stone-300 px-1.5 py-1 text-xs"
                              />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={saveEdit}
                                  disabled={saving}
                                  className="flex-1 rounded bg-stone-900 px-1.5 py-1 text-xs text-white hover:bg-stone-800 disabled:opacity-50"
                                >
                                  ✓
                                </button>
                                {a && (
                                  <button
                                    type="button"
                                    onClick={() => clearAssignment(e.id, d)}
                                    disabled={saving}
                                    className="rounded border border-red-300 px-1.5 py-1 text-xs text-red-700 hover:bg-red-50"
                                  >
                                    🗑
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  className="rounded border border-stone-300 px-1.5 py-1 text-xs hover:bg-stone-100"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(e.id, d)}
                              className={`block w-full rounded p-2 text-left text-xs transition hover:bg-stone-100 ${
                                a && proj
                                  ? 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                  : a
                                    ? 'bg-stone-50 text-stone-700'
                                    : 'text-stone-400'
                              }`}
                            >
                              {proj ? (
                                <>
                                  <div className="font-medium">{proj.code}</div>
                                  {a?.jornada_esperada_horas && (
                                    <div className="text-[10px]">
                                      {Number(a.jornada_esperada_horas)}h
                                    </div>
                                  )}
                                </>
                              ) : a ? (
                                <span className="italic">sin proyecto</span>
                              ) : (
                                <span className="italic">+ asignar</span>
                              )}
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-stone-500">
          Tip: pulsa una celda para asignar/cambiar el proyecto del día. El trabajador verá esta
          asignación pre-rellenada al abrir su portal.
        </p>
      </div>
    </div>
  )
}
