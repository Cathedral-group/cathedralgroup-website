'use client'

/**
 * Bloque "Mis tareas" en la home del portal trabajador.
 *
 * Muestra:
 *   - Sección "Mías" (tareas asignadas al trabajador, tipo obra_*)
 *   - Sección "Del equipo" (sin asignar, de proyectos donde estoy hoy)
 *   - Botón "+ Apuntar tarea" → form simple
 *
 * Acciones:
 *   - Tap en checkbox: ciclar estado (pendiente → en_curso → hecha)
 *   - Tap en "tomar" (en sin asignar): asignarse la tarea
 *   - Tap en "soltar" (en mías): devolverla al equipo
 *
 * David: 'el trabajador tacha tareas, pero NO certifica. Eso lo hace el admin'.
 */

import { useEffect, useState } from 'react'

interface Project {
  id: string
  code: string
  name: string | null
}

interface Task {
  id: string
  project_id: string | null
  texto: string
  notas: string | null
  estado: 'pendiente' | 'en_curso' | 'hecha'
  prioridad: string
  tipo: 'obra_presupuesto' | 'obra_remate'
  fecha_objetivo: string | null
  asignada_a: string | null
  created_at: string
  created_source: string
  completed_at: string | null
  project: Project | Project[] | null
}

interface Props {
  token: string
}

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

export default function MisTareasBlock({ token }: Props) {
  const [mias, setMias] = useState<Task[]>([])
  const [equipo, setEquipo] = useState<Task[]>([])
  const [todayProjectIds, setTodayProjectIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [newProjectId, setNewProjectId] = useState('')
  const [newTexto, setNewTexto] = useState('')
  const [newFecha, setNewFecha] = useState('')
  const [newNotas, setNewNotas] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/tareas`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      setMias(json.mias ?? [])
      setEquipo(json.equipo ?? [])
      setTodayProjectIds(json.today_project_ids ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando tareas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Polling cada 60s para detectar cambios admin
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function toggle(t: Task) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/tareas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, action: 'toggle' }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      // Optimistic: si la tarea sin asignar se completa, pasa a mias. Si no, actualiza en su lista.
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function take(t: Task) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/tareas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, action: 'take' }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function release(t: Task) {
    if (!confirm('¿Devolver al equipo? Otra persona podrá hacerla.')) return
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/tareas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, action: 'release' }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  async function createNew() {
    if (!newProjectId || !newTexto.trim()) { setError('Obra y texto requeridos'); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/tareas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: newProjectId,
          texto: newTexto.trim(),
          fecha_objetivo: newFecha || undefined,
          notas: newNotas.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error')
      setShowAdd(false)
      setNewTexto(''); setNewFecha(''); setNewNotas(''); setNewProjectId('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCreating(false)
    }
  }

  if (loading && mias.length === 0 && equipo.length === 0) {
    return null // No molestamos hasta tener datos
  }

  // Pre-rellenar selector con primer proyecto de hoy
  if (showAdd && !newProjectId && todayProjectIds[0]) {
    setNewProjectId(todayProjectIds[0])
  }

  const tieneAlgo = mias.length > 0 || equipo.length > 0

  if (!tieneAlgo && !showAdd) {
    return (
      <div className="mb-4 rounded-lg border border-stone-200 bg-white p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-stone-600">📋 No tienes tareas pendientes</span>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-stone-500 hover:text-stone-900 underline"
          >
            + Apuntar tarea
          </button>
        </div>
      </div>
    )
  }

  // Obtener proyectos únicos de mías + equipo para selector "Apuntar tarea"
  const projectMap = new Map<string, Project>()
  for (const t of [...mias, ...equipo]) {
    const p = singleRef(t.project)
    if (p?.id) projectMap.set(p.id, p)
  }
  const projectOptions = Array.from(projectMap.values())

  const today = todayStr()
  const misPendientes = mias.filter((t) => t.estado !== 'hecha')
  const misHechas = mias.filter((t) => t.estado === 'hecha')

  return (
    <div className="mb-4 rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100">
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-600">
          📋 Mis tareas {misPendientes.length > 0 && <span className="text-red-500">({misPendientes.length})</span>}
        </h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900"
        >
          {showAdd ? 'Cancelar' : '+ Apuntar tarea'}
        </button>
      </div>

      {error && (
        <div className="mx-3 my-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">⚠️ {error}</div>
      )}

      {/* Form alta */}
      {showAdd && (
        <div className="border-b border-stone-100 p-3 space-y-2 bg-stone-50">
          <select
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          >
            <option value="">— Elige obra —</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ''}</option>
            ))}
          </select>
          <input
            type="text"
            value={newTexto}
            onChange={(e) => setNewTexto(e.target.value)}
            placeholder="¿Qué hay que hacer? Ej: comprar grifería, llamar fontanero…"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            maxLength={500}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={newFecha}
              onChange={(e) => setNewFecha(e.target.value)}
              placeholder="Para el día"
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={newNotas}
              onChange={(e) => setNewNotas(e.target.value)}
              placeholder="Notas (opcional)"
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              maxLength={300}
            />
          </div>
          <button
            onClick={createNew}
            disabled={creating || !newProjectId || !newTexto.trim()}
            className="w-full rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {creating ? 'Apuntando…' : 'Apuntar tarea'}
          </button>
        </div>
      )}

      {/* Mías pendientes */}
      {misPendientes.length > 0 && (
        <div className="divide-y divide-stone-100">
          {misPendientes.map((t) => (
            <TaskItem key={t.id} t={t} busy={busyId === t.id} today={today} onToggle={() => toggle(t)} onRelease={() => release(t)} />
          ))}
        </div>
      )}

      {/* Sin asignar (equipo) */}
      {equipo.length > 0 && (
        <div className="border-t-2 border-stone-100">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-400 bg-stone-50">
            Del equipo (sin asignar) — toca para coger
          </div>
          <div className="divide-y divide-stone-100">
            {equipo.map((t) => (
              <TaskItem
                key={t.id}
                t={t}
                busy={busyId === t.id}
                today={today}
                isEquipo
                onToggle={() => toggle(t)}
                onTake={() => take(t)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mías hechas (collapsable) */}
      {misHechas.length > 0 && (
        <details className="border-t-2 border-stone-100">
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:bg-stone-50">
            ✓ Hechas ({misHechas.length})
          </summary>
          <div className="divide-y divide-stone-100">
            {misHechas.slice(0, 10).map((t) => (
              <TaskItem key={t.id} t={t} busy={busyId === t.id} today={today} onToggle={() => toggle(t)} muted />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function TaskItem({
  t, busy, today, isEquipo = false, muted = false, onToggle, onTake, onRelease,
}: {
  t: Task
  busy: boolean
  today: string
  isEquipo?: boolean
  muted?: boolean
  onToggle: () => void
  onTake?: () => void
  onRelease?: () => void
}) {
  const proj = singleRef(t.project)
  const isOverdue = t.fecha_objetivo && t.estado !== 'hecha' && t.fecha_objetivo < today

  return (
    <div className={`px-3 py-2.5 flex items-start gap-3 ${muted ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`mt-0.5 flex-none w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm ${
          t.estado === 'hecha'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : t.estado === 'en_curso'
            ? 'bg-blue-100 border-blue-500 text-blue-700'
            : 'bg-white border-stone-300'
        } disabled:opacity-50`}
        title={`Estado: ${t.estado}. Tap para cambiar.`}
      >
        {t.estado === 'hecha' ? '✓' : t.estado === 'en_curso' ? '·' : ''}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`text-sm ${t.estado === 'hecha' ? 'line-through text-stone-400' : 'text-stone-900'}`}>
          {t.texto}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-500">
          {proj && <span className="font-mono">{proj.code}</span>}
          {t.fecha_objetivo && (
            <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
              📅 {t.fecha_objetivo}{isOverdue ? ' (vencida)' : ''}
            </span>
          )}
          {t.notas && <span className="text-stone-400 truncate">· {t.notas}</span>}
        </div>
      </div>

      {isEquipo && onTake && t.estado !== 'hecha' && (
        <button
          onClick={onTake}
          disabled={busy}
          className="flex-none rounded bg-stone-900 px-2.5 py-1 text-[10px] text-white hover:bg-stone-800 disabled:opacity-50"
        >
          Coger
        </button>
      )}
      {!isEquipo && !muted && onRelease && t.estado !== 'hecha' && (
        <button
          onClick={onRelease}
          disabled={busy}
          className="flex-none text-[10px] text-stone-400 hover:text-stone-700"
          title="Devolver al equipo"
        >
          Soltar
        </button>
      )}
    </div>
  )
}
