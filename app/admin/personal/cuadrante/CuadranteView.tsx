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

interface Props {
  employees: Employee[]
  projects: Project[]
  assignments: Assignment[]
  days: string[]
  mondayIso: string
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
}: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [editing, setEditing] = useState<{ employeeId: string; fecha: string } | null>(null)
  const [editProjectId, setEditProjectId] = useState<string>('')
  const [editJornada, setEditJornada] = useState<number>(8)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function findAssignment(employeeId: string, fecha: string): Assignment | null {
    return assignments.find((a) => a.employee_id === employeeId && a.fecha === fecha) ?? null
  }

  function startEdit(employeeId: string, fecha: string) {
    const existing = findAssignment(employeeId, fecha)
    setEditing({ employeeId, fecha })
    setEditProjectId(existing?.project_id ?? '')
    setEditJornada(Number(existing?.jornada_esperada_horas ?? 8))
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
        {/* Navegación semanas */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
          <Link
            href={`/admin/personal/cuadrante?semana=${shiftWeek(mondayIso, -1)}`}
            className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            ← Semana anterior
          </Link>
          <span className="text-sm font-medium">
            Semana del {days[0]} al {days[6]}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/personal/cuadrante"
              className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              Esta semana
            </Link>
            <Link
              href={`/admin/personal/cuadrante?semana=${shiftWeek(mondayIso, 1)}`}
              className="rounded px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              Semana siguiente →
            </Link>
          </div>
        </div>

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
                  {days.map((d, i) => (
                    <th
                      key={d}
                      className={`px-3 py-2.5 text-center min-w-[110px] ${
                        isToday(d) ? 'bg-amber-50 text-amber-900' : ''
                      } ${i >= 5 ? 'bg-stone-100' : ''}`}
                    >
                      <div className="text-[10px]">{DOW_LABEL[i]}</div>
                      <div className="text-base font-medium">{dayLabel(d)}</div>
                    </th>
                  ))}
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
                      return (
                        <td
                          key={d}
                          className={`px-2 py-2 align-top ${isToday(d) ? 'bg-amber-50/30' : ''}`}
                        >
                          {isEditing ? (
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
