'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import SegmentsModal from './SegmentsModal'

interface EmployeeRef {
  id: string
  nombre: string | null
  nif?: string | null
  fecha_baja?: string | null
}

interface ProjectRef {
  id: string
  code: string
  name?: string | null
  description?: string | null
  status?: string | null
}

const PROJECT_HISTORICO = new Set(['completado', 'finalizado', 'cancelado'])

function isProjectActive(p: ProjectRef): boolean {
  return !PROJECT_HISTORICO.has((p.status ?? '').toLowerCase())
}

function isEmployeeActive(e: EmployeeRef, todayStr: string): boolean {
  return !e.fecha_baja || e.fecha_baja > todayStr
}

interface TimeRecord {
  id: string
  fecha: string
  project_id: string | null
  employee_id: string
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  observaciones: string | null
  fuente: string | null
  registrado_por: string | null
  foto_avance_url?: string | null
  employee: EmployeeRef | EmployeeRef[] | null
  project: ProjectRef | ProjectRef[] | null
}

interface Props {
  employees: EmployeeRef[]
  projects: ProjectRef[]
  timeRecords: TimeRecord[]
  defaultDesde: string
  defaultHasta: string
}

function singleRef<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function employeeName(e: EmployeeRef | EmployeeRef[] | null): string {
  const r = singleRef(e)
  if (!r) return '—'
  return (r.nombre ?? '').trim() || '—'
}

function totalHoras(r: TimeRecord): number {
  return (
    Number(r.horas_ordinarias ?? 0) +
    Number(r.horas_extra ?? 0) +
    Number(r.horas_nocturnas ?? 0)
  )
}

export default function DietarioView({
  employees,
  projects,
  timeRecords: initialRecords,
  defaultDesde,
  defaultHasta,
}: Props) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const employeesActive = useMemo(() => employees.filter((e) => isEmployeeActive(e, todayStr)), [employees, todayStr])
  const projectsActive = useMemo(() => projects.filter(isProjectActive), [projects])

  const [desde, setDesde] = useState(defaultDesde)
  const [hasta, setHasta] = useState(defaultHasta)
  const [filterEmployee, setFilterEmployee] = useState<string>('')
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterImputable, setFilterImputable] = useState<'all' | 'true' | 'false'>('all')
  const [records, setRecords] = useState<TimeRecord[]>(initialRecords)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editProjectId, setEditProjectId] = useState<string>('')
  const [fullEditId, setFullEditId] = useState<string | null>(null)
  const [segmentsModal, setSegmentsModal] = useState<{ id: string; fecha: string; nombre: string } | null>(null)
  const [fullEdit, setFullEdit] = useState<{
    project_id: string
    horas_ord: string
    horas_ext: string
    horas_noc: string
    observaciones: string
  }>({ project_id: '', horas_ord: '', horas_ext: '', horas_noc: '', observaciones: '' })
  const [savingFull, setSavingFull] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    employee_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    project_id: '',
    horas_ordinarias: 8,
    horas_extra: 0,
    horas_nocturnas: 0,
    observaciones: '',
  })

  const totales = useMemo(() => {
    const horas = records.reduce((acc, r) => acc + totalHoras(r), 0)
    const sinProyecto = records.filter((r) => !r.project_id).length
    return { registros: records.length, horas, sinProyecto }
  }, [records])

  async function aplicarFiltros() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      if (filterEmployee) params.set('employee_id', filterEmployee)
      if (filterProject) params.set('project_id', filterProject)
      if (filterImputable !== 'all') params.set('imputable', filterImputable)
      const res = await fetch(`/api/admin/personal/dietario?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al cargar')
      } else {
        setRecords(json.rows ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }

  async function patchRecord(
    recordId: string,
    update: {
      project_id?: string | null
      horas_ordinarias?: number
      horas_extra?: number
      horas_nocturnas?: number
      observaciones?: string | null
    },
    successMsg?: string,
  ) {
    setError(null)
    try {
      const res = await fetch('/api/admin/personal/dietario', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, ...update }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al actualizar')
        return false
      }
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, ...json.row } : r)),
      )
      if (successMsg) {
        // Toast simple
        // eslint-disable-next-line no-console
        console.log(successMsg)
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
      return false
    }
  }

  function openFullEdit(r: TimeRecord) {
    setFullEditId(r.id)
    setFullEdit({
      project_id: r.project_id ?? '',
      horas_ord: r.horas_ordinarias != null ? String(r.horas_ordinarias) : '',
      horas_ext: r.horas_extra != null && Number(r.horas_extra) > 0 ? String(r.horas_extra) : '',
      horas_noc:
        r.horas_nocturnas != null && Number(r.horas_nocturnas) > 0
          ? String(r.horas_nocturnas)
          : '',
      observaciones: r.observaciones ?? '',
    })
    setError(null)
  }

  async function saveFullEdit() {
    if (!fullEditId) return
    setSavingFull(true)
    const ok = await patchRecord(fullEditId, {
      project_id: fullEdit.project_id || null,
      horas_ordinarias: parseFloat(fullEdit.horas_ord) || 0,
      horas_extra: parseFloat(fullEdit.horas_ext) || 0,
      horas_nocturnas: parseFloat(fullEdit.horas_noc) || 0,
      observaciones: fullEdit.observaciones.trim() || null,
    })
    setSavingFull(false)
    if (ok) setFullEditId(null)
  }

  async function asignarProyecto(recordId: string, projectId: string | null) {
    setError(null)
    try {
      const res = await fetch('/api/admin/personal/dietario', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al actualizar')
      } else {
        setRecords((prev) =>
          prev.map((r) => {
            if (r.id !== recordId) return r
            const proj = projectId ? projects.find((p) => p.id === projectId) ?? null : null
            return { ...r, project_id: projectId, project: proj }
          }),
        )
        setEditingId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    }
  }

  async function crearParte() {
    setError(null)
    if (!createForm.employee_id) {
      setError('Selecciona un empleado')
      return
    }
    try {
      const res = await fetch('/api/admin/personal/dietario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          project_id: createForm.project_id || null,
          observaciones: createForm.observaciones || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al crear')
      } else {
        setShowCreateForm(false)
        await aplicarFiltros()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
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
            <span className="text-stone-900">Dietario</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Dietario — partes de horas
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Revisar y asignar proyecto a los partes de horas. Las imputaciones laborales se calculan
            mes a mes desde la pestaña Mano de obra de cada proyecto.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* KPIs */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-stone-500">Registros</div>
            <div className="mt-2 text-2xl font-light text-stone-900">{totales.registros}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-stone-500">Horas totales</div>
            <div className="mt-2 text-2xl font-light text-stone-900">{totales.horas.toFixed(2)} h</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-stone-500">Sin proyecto</div>
            <div className="mt-2 text-2xl font-light text-amber-700">{totales.sinProyecto}</div>
            <div className="mt-1 text-xs text-stone-500">No imputables hasta asignar</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-6 rounded-lg border border-stone-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Empleado</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {employeesActive.map((e) => (
                  <option key={e.id} value={e.id}>
                    {(e.nombre ?? '').trim()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Proyecto</label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                <option value="">Todos</option>
                {projectsActive.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Imputable</label>
              <select
                value={filterImputable}
                onChange={(e) => setFilterImputable(e.target.value as 'all' | 'true' | 'false')}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                <option value="all">Todos</option>
                <option value="true">Con proyecto</option>
                <option value="false">Sin proyecto</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={aplicarFiltros}
                disabled={loading}
                className="flex-1 rounded bg-stone-900 px-4 py-1.5 text-sm text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {loading ? 'Cargando…' : 'Filtrar'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                + Nuevo
              </button>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-red-700">⚠️ {error}</div>}
        </div>

        {/* Crear nuevo */}
        {showCreateForm && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
            <h3 className="text-sm font-medium uppercase tracking-wider text-stone-700">
              Nuevo parte manual
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Empleado *
                </label>
                <select
                  value={createForm.employee_id}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, employee_id: e.target.value }))
                  }
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {employeesActive.map((e) => (
                    <option key={e.id} value={e.id}>
                      {(e.nombre ?? '').trim()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">Fecha *</label>
                <input
                  type="date"
                  value={createForm.fecha}
                  onChange={(e) => setCreateForm((p) => ({ ...p, fecha: e.target.value }))}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Proyecto
                </label>
                <select
                  value={createForm.project_id}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, project_id: e.target.value }))
                  }
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— Sin proyecto</option>
                  {projectsActive.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">H. Ord</label>
                <input
                  type="number"
                  step="0.25"
                  value={createForm.horas_ordinarias}
                  onChange={(e) =>
                    setCreateForm((p) => ({
                      ...p,
                      horas_ordinarias: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">H. Ext</label>
                <input
                  type="number"
                  step="0.25"
                  value={createForm.horas_extra}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, horas_extra: parseFloat(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">H. Noc</label>
                <input
                  type="number"
                  step="0.25"
                  value={createForm.horas_nocturnas}
                  onChange={(e) =>
                    setCreateForm((p) => ({
                      ...p,
                      horas_nocturnas: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={crearParte}
                  className="w-full rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
                >
                  Crear
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Observaciones
              </label>
              <input
                type="text"
                value={createForm.observaciones}
                onChange={(e) =>
                  setCreateForm((p) => ({ ...p, observaciones: e.target.value }))
                }
                placeholder="Descripción del trabajo realizado…"
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}

        {/* Tabla */}
        {records.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No hay partes de horas en el rango seleccionado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Empleado</th>
                  <th className="px-4 py-2.5">Proyecto</th>
                  <th className="px-4 py-2.5 text-right">H. Ord</th>
                  <th className="px-4 py-2.5 text-right">H. Ext</th>
                  <th className="px-4 py-2.5 text-right">H. Noc</th>
                  <th className="px-4 py-2.5 text-right">Total</th>                  <th className="px-4 py-2.5">Fuente</th>
                  <th className="px-4 py-2.5">Foto</th>
                  <th className="px-4 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {records.map((r) => {
                  const proj = singleRef(r.project)
                  const isEditing = editingId === r.id
                  return (
                    <tr key={r.id} className={!r.project_id ? 'bg-amber-50/40' : ''}>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.fecha}</td>
                      <td className="px-4 py-2.5">{employeeName(r.employee)}</td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editProjectId}
                              onChange={(e) => setEditProjectId(e.target.value)}
                              className="rounded border border-stone-300 px-2 py-1 text-xs"
                            >
                              <option value="">— Sin proyecto</option>
                              {projectsActive.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => asignarProyecto(r.id, editProjectId || null)}
                              className="rounded bg-stone-900 px-2 py-1 text-xs text-white hover:bg-stone-800"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded border border-stone-300 px-2 py-1 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : proj ? (
                          <Link
                            href={`/admin/proyectos/${proj.code}/mano-de-obra`}
                            className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
                          >
                            {proj.code}
                          </Link>
                        ) : (
                          <span className="text-xs text-amber-700">— sin asignar —</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_ordinarias ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_extra ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_nocturnas ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {totalHoras(r).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-stone-500">{r.fuente ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {r.foto_avance_url ? (
                          <a
                            href={r.foto_avance_url}
                            target="_blank"
                            rel="noopener"
                            title="Foto avance del día"
                          >
                            <img
                              src={r.foto_avance_url}
                              alt=""
                              className="h-10 w-10 rounded border border-stone-200 object-cover hover:opacity-80"
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {!isEditing && (
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(r.id)
                                setEditProjectId(r.project_id ?? '')
                              }}
                              className="text-left text-[11px] text-stone-600 underline hover:text-stone-900"
                            >
                              Asignar proyecto
                            </button>
                            <button
                              type="button"
                              onClick={() => openFullEdit(r)}
                              className="text-left text-[11px] text-blue-700 underline hover:text-blue-900"
                            >
                              ✏️ Editar parte
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSegmentsModal({
                                  id: r.id,
                                  fecha: r.fecha,
                                  nombre: employeeName(r.employee),
                                })
                              }
                              className="text-left text-[11px] text-purple-700 underline hover:text-purple-900"
                              title="Editar tramos múltiples (varias obras en el mismo día)"
                            >
                              🔀 Tramos
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal edición completa */}
        {fullEditId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
              <h3 className="text-sm font-medium uppercase tracking-wider text-stone-700">
                Editar parte de horas
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                Como administrador puedes ajustar horas y observaciones. Quedará registro de
                la modificación.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Proyecto
                  </label>
                  <select
                    value={fullEdit.project_id}
                    onChange={(e) => setFullEdit((p) => ({ ...p, project_id: e.target.value }))}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">— Sin proyecto —</option>
                    {projectsActive.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">
                      Ordinarias
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="0"
                      value={fullEdit.horas_ord}
                      onChange={(e) => setFullEdit((p) => ({ ...p, horas_ord: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-center tabular-nums placeholder:text-stone-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">
                      Extra
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="0"
                      value={fullEdit.horas_ext}
                      onChange={(e) => setFullEdit((p) => ({ ...p, horas_ext: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-center tabular-nums placeholder:text-stone-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500">
                      Nocturnas
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="0"
                      value={fullEdit.horas_noc}
                      onChange={(e) => setFullEdit((p) => ({ ...p, horas_noc: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-center tabular-nums placeholder:text-stone-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Observaciones
                  </label>
                  <textarea
                    value={fullEdit.observaciones}
                    onChange={(e) =>
                      setFullEdit((p) => ({ ...p, observaciones: e.target.value }))
                    }
                    rows={2}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveFullEdit}
                  disabled={savingFull}
                  className="flex-1 rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {savingFull ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setFullEditId(null)}
                  className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {segmentsModal && (
        <SegmentsModal
          recordId={segmentsModal.id}
          fecha={segmentsModal.fecha}
          employeeName={segmentsModal.nombre}
          projects={projectsActive}
          onClose={() => setSegmentsModal(null)}
          onSaved={aplicarFiltros}
        />
      )}
    </div>
  )
}
