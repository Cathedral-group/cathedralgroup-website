'use client'

/**
 * Tab "Planificación" en ficha proyecto.
 *
 * Estructura:
 *   1. Fases del proyecto (del presupuesto):
 *      - Por cada fase: nombre + start/end + % certificado editable inline
 *      - "X de Y tareas hechas" como referencia (NO certifica automático)
 *      - Tareas tipo='obra_presupuesto' dentro
 *   2. Tareas extras de obra (tipo='obra_remate'): no en presupuesto, en margen
 *   3. Tareas internas socio (tipo='interna_socio'): gestión admin de este proyecto
 *
 * David: 'el trabajador tacha tareas pero NO certifica. Somos nosotros
 * los que, viendo lo que va haciendo, certificamos manualmente.'
 */

import { useEffect, useState, useMemo } from 'react'

interface Phase {
  id: string
  name: string
  status: string | null
  start_date: string | null
  end_date: string | null
  pct_certificado?: number | null
  pct_certificado_updated_at?: string | null
  pct_certificado_updated_by?: string | null
}

interface Task {
  id: string
  project_id: string | null
  texto: string
  notas: string | null
  estado: 'pendiente' | 'en_curso' | 'hecha'
  prioridad: string
  tipo: 'obra_presupuesto' | 'obra_remate' | 'interna_socio'
  fecha_objetivo: string | null
  asignada_a: string | null
  phase_id: string | null
  created_at: string
  created_source: string
  completed_at: string | null
  completed_by_email: string | null
  project?: { id: string; code: string; name: string | null } | { id: string; code: string; name: string | null }[] | null
  assigned_employee?: { id: string; nombre: string | null } | { id: string; nombre: string | null }[] | null
}

interface EmployeeRef {
  id: string
  nombre: string | null
}

interface Props {
  projectId: string
  projectCode: string
  employees: EmployeeRef[]
  initialPhases: Phase[]
}

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

const ESTADO_LABELS: Record<Task['estado'], { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-stone-100 text-stone-700' },
  en_curso: { label: 'En curso', cls: 'bg-blue-100 text-blue-800' },
  hecha: { label: 'Hecha', cls: 'bg-emerald-100 text-emerald-800' },
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit',
  })
}

export default function PlanificacionTab({ projectId, projectCode, employees, initialPhases }: Props) {
  void projectCode
  const [phases, setPhases] = useState<Phase[]>(initialPhases)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newTipo, setNewTipo] = useState<Task['tipo']>('obra_remate')
  const [newPhaseId, setNewPhaseId] = useState<string>('')
  const [newTexto, setNewTexto] = useState('')
  const [newFecha, setNewFecha] = useState('')
  const [newAsignada, setNewAsignada] = useState('')
  const [newNotas, setNewNotas] = useState('')

  // Cargar tareas del proyecto al montar
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/personal/project-tasks?project_id=${projectId}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`Error ${res.status}`)
        const json = await res.json()
        if (!cancelled) setTasks(json.tasks ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando tareas')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [projectId])

  const tasksByPhase = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (t.tipo === 'obra_presupuesto' && t.phase_id) {
        ;(map[t.phase_id] ??= []).push(t)
      }
    }
    return map
  }, [tasks])

  const tareasRemate = useMemo(
    () => tasks.filter((t) => t.tipo === 'obra_remate'),
    [tasks],
  )
  const tareasSocio = useMemo(
    () => tasks.filter((t) => t.tipo === 'interna_socio'),
    [tasks],
  )

  /* ─────── Acciones tareas ─────── */

  async function toggleEstado(t: Task) {
    const next: Task['estado'] =
      t.estado === 'pendiente' ? 'en_curso' :
      t.estado === 'en_curso' ? 'hecha' :
      'pendiente'
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/admin/personal/project-tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: next }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      setTasks((prev) => prev.map((x) => (x.id === t.id ? json.task : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteTask(t: Task) {
    if (!confirm(`¿Eliminar "${t.texto}"?`)) return
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/admin/personal/project-tasks/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setTasks((prev) => prev.filter((x) => x.id !== t.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function editTask(t: Task, patch: Partial<Task>) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/admin/personal/project-tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      setTasks((prev) => prev.map((x) => (x.id === t.id ? json.task : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function createTask() {
    const texto = newTexto.trim()
    if (!texto) { setError('Texto requerido'); return }
    setBusyId('new')
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        project_id: projectId,
        texto,
        tipo: newTipo,
        notas: newNotas.trim() || undefined,
        fecha_objetivo: newFecha || undefined,
        asignada_a: newAsignada || undefined,
      }
      if (newTipo === 'obra_presupuesto') {
        payload.phase_id = newPhaseId || undefined
      }
      const res = await fetch('/api/admin/personal/project-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      setTasks((prev) => [json.task, ...prev])
      setShowAddForm(false)
      setNewTexto(''); setNewNotas(''); setNewFecha(''); setNewAsignada(''); setNewPhaseId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  /* ─────── Certificación de fase ─────── */

  async function updatePhasePct(phaseId: string, pct: number) {
    setBusyId(phaseId)
    try {
      const res = await fetch(`/api/admin/personal/project-phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct_certificado: pct }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      setPhases((prev) => prev.map((p) => (p.id === phaseId ? json.phase : p)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const empMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of employees) if (e.id) m[e.id] = (e.nombre ?? '').trim() || '—'
    return m
  }, [employees])

  if (loading) {
    return <div className="text-sm text-stone-500 py-4">Cargando planificación…</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">⚠️ {error}</div>
      )}

      {/* ─── Botón Añadir tarea ─── */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded bg-stone-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-stone-800"
        >
          + Añadir tarea
        </button>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-700">Nueva tarea</h3>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500">Tipo</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(['obra_presupuesto', 'obra_remate', 'interna_socio'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewTipo(t)}
                  className={`rounded border px-3 py-1.5 text-xs ${
                    newTipo === t
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {t === 'obra_presupuesto' ? '📋 Del presupuesto'
                    : t === 'obra_remate' ? '🔧 Remate/extra de obra'
                    : '🏢 Interna socios'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-stone-500">
              {newTipo === 'obra_presupuesto' && 'Tarea de una fase del presupuesto. Al hacerla, info para certificar.'}
              {newTipo === 'obra_remate' && 'Trabajo extra en la obra que no está en presupuesto. Va en margen.'}
              {newTipo === 'interna_socio' && 'Gestión interna para socios. NO se muestra al trabajador.'}
            </p>
          </div>

          {newTipo === 'obra_presupuesto' && phases.length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-stone-500">Fase (opcional)</label>
              <select
                value={newPhaseId}
                onChange={(e) => setNewPhaseId(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                <option value="">— Sin fase específica —</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>{ph.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500">Tarea *</label>
            <input
              type="text"
              value={newTexto}
              onChange={(e) => setNewTexto(e.target.value)}
              placeholder="Ej: Comprar grifería, instalar enchufes salón, llamar arquitecto…"
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-stone-500">Para el día (opcional)</label>
              <input
                type="date"
                value={newFecha}
                onChange={(e) => setNewFecha(e.target.value)}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            {newTipo !== 'interna_socio' && (
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-stone-500">Asignar a (opcional)</label>
                <select
                  value={newAsignada}
                  onChange={(e) => setNewAsignada(e.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— Cualquier oficial del equipo —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{(e.nombre ?? '').trim()}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500">Notas (opcional)</label>
            <textarea
              value={newNotas}
              onChange={(e) => setNewNotas(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={createTask}
              disabled={busyId === 'new' || !newTexto.trim()}
              className="rounded bg-stone-900 px-4 py-1.5 text-xs text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {busyId === 'new' ? '…' : 'Crear tarea'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setError(null) }}
              className="rounded border border-stone-300 px-4 py-1.5 text-xs hover:bg-stone-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── 1. Fases del presupuesto con % cert + tareas ─── */}
      {phases.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-600 mb-3">
            📋 Fases del presupuesto
          </h3>
          <div className="space-y-3">
            {phases.map((ph) => {
              const phTasks = tasksByPhase[ph.id] ?? []
              const hechas = phTasks.filter((t) => t.estado === 'hecha').length
              const total = phTasks.length
              const pctCert = Number(ph.pct_certificado ?? 0)
              return (
                <div key={ph.id} className="rounded-lg border border-stone-200 bg-white">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-900">{ph.name}</div>
                        <div className="mt-0.5 text-xs text-stone-500">
                          {ph.start_date && ph.end_date ? (
                            <span>{fmtDate(ph.start_date)} → {fmtDate(ph.end_date)} · </span>
                          ) : null}
                          {total > 0 ? (
                            <span>
                              {hechas}/{total} tareas hechas{' '}
                              <span className="text-stone-400">(referencia)</span>
                            </span>
                          ) : (
                            <span className="text-stone-400">Sin tareas todavía</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wider text-stone-500">Certificado</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          defaultValue={pctCert}
                          onBlur={(e) => {
                            const val = Number(e.target.value)
                            if (Number.isFinite(val) && val !== pctCert) {
                              updatePhasePct(ph.id, val)
                            }
                          }}
                          disabled={busyId === ph.id}
                          className="w-16 rounded border border-stone-300 px-2 py-1 text-sm text-right tabular-nums disabled:opacity-50"
                        />
                        <span className="text-sm text-stone-700">%</span>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-stone-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${pctCert}%` }}
                      />
                    </div>
                    {ph.pct_certificado_updated_by && ph.pct_certificado_updated_at && (
                      <p className="mt-1 text-[10px] text-stone-400">
                        Última actualización: {ph.pct_certificado_updated_by} el{' '}
                        {new Date(ph.pct_certificado_updated_at).toLocaleString('es-ES', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>

                  {phTasks.length > 0 && (
                    <div className="divide-y divide-stone-100">
                      {phTasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          empMap={empMap}
                          busy={busyId === t.id}
                          onToggle={() => toggleEstado(t)}
                          onDelete={() => deleteTask(t)}
                          onEdit={(patch) => editTask(t, patch)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ─── 2. Tareas extras de obra ─── */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-600 mb-3">
          🔧 Tareas extras de obra
          <span className="ml-2 text-[10px] font-normal text-stone-400 normal-case">
            (no en presupuesto, dentro del margen)
          </span>
        </h3>
        {tareasRemate.length === 0 ? (
          <p className="text-sm text-stone-400 py-2">Sin tareas extras todavía.</p>
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
            {tareasRemate.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                empMap={empMap}
                busy={busyId === t.id}
                onToggle={() => toggleEstado(t)}
                onDelete={() => deleteTask(t)}
                onEdit={(patch) => editTask(t, patch)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── 3. Tareas internas socio ─── */}
      {tareasSocio.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-600 mb-3">
            🏢 Gestión interna socios
            <span className="ml-2 text-[10px] font-normal text-stone-400 normal-case">
              (NO se muestra al trabajador)
            </span>
          </h3>
          <div className="rounded-lg border border-amber-200 bg-amber-50/30 divide-y divide-amber-100">
            {tareasSocio.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                empMap={empMap}
                busy={busyId === t.id}
                onToggle={() => toggleEstado(t)}
                onDelete={() => deleteTask(t)}
                onEdit={(patch) => editTask(t, patch)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ─────── Sub-componente fila de tarea ─────── */

function TaskRow({
  task, empMap, busy, onToggle, onDelete, onEdit,
}: {
  task: Task
  empMap: Record<string, string>
  busy: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: (patch: Partial<Task>) => void
}) {
  void onEdit
  const estado = ESTADO_LABELS[task.estado]
  const asignada = task.asignada_a ? empMap[task.asignada_a] : null
  const completedHoy = task.completed_at
    ? new Date(task.completed_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
    : null
  const isOverdue = task.fecha_objetivo && task.estado !== 'hecha' && task.fecha_objetivo < new Date().toISOString().slice(0, 10)
  const fromPortal = task.created_source === 'portal'

  return (
    <div className="px-4 py-2.5 flex items-start gap-3 hover:bg-stone-50/50">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title={`Estado actual: ${estado.label}. Tap para cambiar.`}
        className={`mt-0.5 flex-none w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
          task.estado === 'hecha'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : task.estado === 'en_curso'
            ? 'bg-blue-100 border-blue-500 text-blue-700'
            : 'bg-white border-stone-300'
        } disabled:opacity-50`}
      >
        {task.estado === 'hecha' ? '✓' : task.estado === 'en_curso' ? '·' : ''}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`text-sm ${task.estado === 'hecha' ? 'line-through text-stone-400' : 'text-stone-900'}`}>
          {task.texto}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-500">
          {task.fecha_objetivo && (
            <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
              📅 {fmtDate(task.fecha_objetivo)}
              {isOverdue ? ' (vencida)' : ''}
            </span>
          )}
          {asignada && <span>👤 {asignada}</span>}
          {!asignada && task.tipo !== 'interna_socio' && (
            <span className="text-stone-400">Sin asignar (equipo)</span>
          )}
          {fromPortal && <span className="text-blue-600">📱 desde portal</span>}
          {completedHoy && <span className="text-emerald-600">hecha {completedHoy}</span>}
          {task.notas && <span className="text-stone-400">· {task.notas}</span>}
        </div>
      </div>

      <span className={`rounded px-1.5 py-0.5 text-[9px] ${estado.cls}`}>{estado.label}</span>

      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="flex-none text-stone-300 hover:text-red-600 text-sm disabled:opacity-50"
        title="Eliminar"
      >
        ✕
      </button>
    </div>
  )
}
