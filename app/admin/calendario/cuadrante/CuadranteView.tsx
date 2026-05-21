'use client'

/**
 * CuadranteView — grid spreadsheet trabajadores × días con drag-drop.
 *
 * Feedback David sesión 22/05: reemplazo Excel rápido.
 * Library: Pragmatic Drag and Drop (@atlaskit/pragmatic-drag-and-drop).
 *
 * Interacciones:
 *   - Drag proyecto (sidebar) → celda día = crea asignación
 *   - Drag asignación entre celdas = mueve fecha
 *   - Shift+drag asignación = copia (mantiene origen)
 *   - Click X en chip = borra asignación
 *   - Festivos/ausencias = celdas bloqueadas (gris rayado)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

interface Employee { id: string; nombre: string }
interface Project { id: string; code: string; name: string | null; status: string | null; address: string | null }
interface Assignment {
  id: string
  employee_id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
}
interface Holiday { fecha: string; nombre: string; ambito: string }
interface Absence {
  employee_id: string
  tipo: string
  fecha_inicio: string
  fecha_fin: string
  status: string
}

interface Props {
  refFecha: string
  weekDays: string[]
  employees: Employee[]
  projects: Project[]
  assignments: Assignment[]
  holidays: Holiday[]
  absences: Absence[]
  today: string
  recentProjectIds: string[]
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function fmtDayShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
}

function fmtFullDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Colores hash project_id → tailwind class
const PROJECT_COLORS = [
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-sky-100 text-sky-900 border-sky-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-pink-100 text-pink-900 border-pink-200',
  'bg-violet-100 text-violet-900 border-violet-200',
  'bg-orange-100 text-orange-900 border-orange-200',
  'bg-cyan-100 text-cyan-900 border-cyan-200',
  'bg-rose-100 text-rose-900 border-rose-200',
]

function projectColor(id: string | null): string {
  if (!id) return 'bg-stone-100 text-stone-700 border-stone-200'
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]
}

export default function CuadranteView({
  refFecha, weekDays, employees, projects, assignments: initialAssignments,
  holidays, absences, today, recentProjectIds,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [shiftDown, setShiftDown] = useState(false)
  const shiftRef = useRef(false)
  const router = useRouter()

  // Tracking global tecla Shift: Pragmatic DnD `location.current.input` NO
  // expone shiftKey. Solución: window listeners + ref. Visual hint UI cuando
  // está presionado para que David sepa "modo copiar activo".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { shiftRef.current = true; setShiftDown(true) }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { shiftRef.current = false; setShiftDown(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Project lookup
  const projectMap = useMemo(() => {
    const m: Record<string, Project> = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])

  // Orden inteligente sidebar: usados últimas 8 semanas primero (orden uso
  // reciente), resto al final ordenado por code desc.
  const sortedProjects = useMemo(() => {
    const recentSet = new Set(recentProjectIds)
    const recent: Project[] = []
    const unused: Project[] = []
    const byId: Record<string, Project> = {}
    for (const p of projects) byId[p.id] = p
    for (const id of recentProjectIds) {
      if (byId[id]) recent.push(byId[id])
    }
    for (const p of projects) {
      if (!recentSet.has(p.id)) unused.push(p)
    }
    unused.sort((a, b) => (a.code < b.code ? 1 : -1))
    return { recent, unused }
  }, [projects, recentProjectIds])

  // Festivos por fecha
  const holidayByDate = useMemo(() => {
    const m: Record<string, Holiday> = {}
    for (const h of holidays) m[h.fecha] = h
    return m
  }, [holidays])

  // Ausencias por employee + fecha (expandido rango)
  const absenceMap = useMemo(() => {
    const m: Record<string, { tipo: string; status: string }> = {}
    for (const a of absences) {
      const start = new Date(a.fecha_inicio + 'T00:00:00')
      const end = new Date(a.fecha_fin + 'T00:00:00')
      const cur = new Date(start)
      while (cur <= end) {
        m[`${a.employee_id}|${toLocalISODate(cur)}`] = { tipo: a.tipo, status: a.status }
        cur.setDate(cur.getDate() + 1)
      }
    }
    return m
  }, [absences])

  // Assignments por employee+fecha
  const assignmentsByCell = useMemo(() => {
    const m: Record<string, Assignment[]> = {}
    for (const a of assignments) {
      const key = `${a.employee_id}|${a.fecha}`
      ;(m[key] ??= []).push(a)
    }
    return m
  }, [assignments])

  // Capacity por trabajador (DÍAS asignados, NO horas).
  // Horas reales las apuntan los trabajadores cuando fichan en su portal.
  // Cathedral jornada estándar convenio Madrid 2026: ~8h/día efectivas L-V.
  // Semana laboral = 5 días = 40h (sin contar extras).
  const capacityByEmp = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const a of assignments) {
      if (!m[a.employee_id]) m[a.employee_id] = new Set()
      m[a.employee_id].add(a.fecha)
    }
    return m
  }, [assignments])

  function showMsg(msg: string, ms = 2500) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), ms)
  }

  // ─── Drag-drop monitor (Pragmatic DnD) ───
  useEffect(() => {
    return monitorForElements({
      async onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const targetData = target.data as { type: 'cell'; employee_id: string; fecha: string }
        const sourceData = source.data as
          | { type: 'project'; project_id: string }
          | { type: 'assignment'; assignment_id: string; employee_id: string; fecha: string; project_id: string | null }

        if (!targetData || targetData.type !== 'cell') return
        const { employee_id, fecha } = targetData

        // Bloquear si festivo/ausencia
        if (holidayByDate[fecha]) {
          showMsg('🇪🇸 Festivo — no asignable')
          return
        }
        if (absenceMap[`${employee_id}|${fecha}`]) {
          showMsg('🏖️ Trabajador con ausencia este día')
          return
        }

        // 1. Drag PROYECTO sidebar → celda: crea asignación
        if (sourceData.type === 'project') {
          await createAssignment(employee_id, fecha, sourceData.project_id)
          return
        }

        // 2. Drag asignación existente → otra celda
        if (sourceData.type === 'assignment') {
          // Shift trackeado vía window keydown/keyup ref (Pragmatic DnD no
          // expone shiftKey en location.current.input).
          const isCopy = shiftRef.current
          if (isCopy) {
            if (!sourceData.project_id) {
              showMsg('Asignación sin proyecto — no se puede copiar')
              return
            }
            await createAssignment(employee_id, fecha, sourceData.project_id)
          } else {
            // mover: si misma celda no hacer nada
            if (sourceData.employee_id === employee_id && sourceData.fecha === fecha) return
            await moveAssignment(sourceData.assignment_id, employee_id, fecha)
          }
        }
      },
    })
  }, [holidayByDate, absenceMap])

  async function createAssignment(employee_id: string, fecha: string, project_id: string) {
    // Optimistic update: añadir asignación local con id temporal antes del POST.
    // Si POST falla → rollback. Si OK → router.refresh substituirá con id real.
    const tempId = `temp-${Math.random().toString(36).slice(2)}`
    const optimistic: Assignment = {
      id: tempId,
      employee_id,
      fecha,
      project_id,
      horas_ordinarias: 8,
      horas_extra: null,
    }
    setAssignments((prev) => [...prev, optimistic])

    try {
      const res = await fetch('/api/admin/calendario/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          asignaciones: [{ employee_id, project_id }],
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        // Rollback optimistic
        setAssignments((prev) => prev.filter((a) => a.id !== tempId))
        showMsg(`Error: ${json.error || 'no se creó'}`)
        return
      }
      showMsg(`✓ Asignado ${projectMap[project_id]?.code ?? ''}`)
      router.refresh()
    } catch {
      // Rollback en error red
      setAssignments((prev) => prev.filter((a) => a.id !== tempId))
      showMsg('Error red al crear')
    }
  }

  async function moveAssignment(id: string, new_employee_id: string, new_fecha: string) {
    try {
      // Optimistic update
      setAssignments((prev) => prev.map((a) => (
        a.id === id ? { ...a, fecha: new_fecha, employee_id: new_employee_id } : a
      )))
      const res = await fetch(`/api/admin/calendario/assignment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: new_fecha, employee_id: new_employee_id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        showMsg(`Error: ${json.error || 'no se movió'}`)
        router.refresh()
        return
      }
      showMsg('✓ Movido')
    } catch {
      showMsg('Error red al mover')
      router.refresh()
    }
  }

  async function deleteAssignment(id: string) {
    // Sin confirm() — feedback David sesión 22/05: borrado directo cuadrante.
    setAssignments((prev) => prev.filter((a) => a.id !== id))
    try {
      const res = await fetch(`/api/admin/calendario/assignment/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        showMsg('Error borrando')
        router.refresh()
        return
      }
      showMsg('✓ Borrado')
    } catch {
      showMsg('Error red')
      router.refresh()
    }
  }

  // Navegación
  function shiftWeek(delta: number) {
    const r = new Date(refFecha + 'T00:00:00')
    r.setDate(r.getDate() + 7 * delta)
    router.push(`/admin/calendario/cuadrante?fecha=${toLocalISODate(r)}`)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin" className="hover:text-stone-900">Admin</Link>
            <span>›</span>
            <Link href="/admin/calendario" className="hover:text-stone-900">Calendario</Link>
            <span>›</span>
            <span className="text-stone-900">Asignaciones</span>
          </div>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-stone-900">
            Asignaciones · {fmtDayShort(weekDays[0])} → {fmtDayShort(weekDays[6])}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Arrastra proyectos del lateral a las celdas. Drag entre celdas = mover. Shift+drag = copiar.
          </p>
        </div>
        <div className="inline-flex rounded border border-stone-300 overflow-hidden">
          <button onClick={() => shiftWeek(-1)} className="px-3 py-1.5 text-sm hover:bg-stone-50">‹ Semana anterior</button>
          <button onClick={() => router.push('/admin/calendario/cuadrante')} className="px-3 py-1.5 text-xs uppercase tracking-widest border-x border-stone-300 hover:bg-stone-50">Hoy</button>
          <button onClick={() => shiftWeek(1)} className="px-3 py-1.5 text-sm hover:bg-stone-50">Semana siguiente ›</button>
        </div>
      </div>

      {shiftDown && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded shadow-lg">
          ⇧ Modo COPIAR activo · suelta para duplicar
        </div>
      )}

      {feedback && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-2 rounded">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-[1fr,300px] gap-3">
        {/* GRID PRINCIPAL */}
        <div className="bg-white border border-stone-200 rounded">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-[10px] uppercase tracking-widest text-stone-500 bg-stone-50 border-b border-r border-stone-200 w-[140px]">
                  Trabajador
                </th>
                {weekDays.map((d, i) => {
                  const hol = holidayByDate[d]
                  const isToday = d === today
                  return (
                    <th key={d} className={`px-1 py-2 text-center text-[10px] uppercase tracking-widest border-b border-stone-200 ${
                      isToday ? 'bg-emerald-50 text-emerald-900' : hol ? 'bg-red-50 text-red-700' : 'bg-stone-50 text-stone-600'
                    }`}>
                      <div>{DAY_NAMES[i]}</div>
                      <div className="font-mono">{fmtDayShort(d)}</div>
                      {hol && <div className="text-[9px] mt-0.5 truncate" title={hol.nombre}>🇪🇸 {hol.nombre}</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const diasAsignados = capacityByEmp[emp.id]?.size || 0
                // Verde 0-5 días (semana normal), amber 6 días, rojo 7 días
                const capColor = diasAsignados === 0 ? 'bg-stone-100'
                  : diasAsignados <= 5 ? 'bg-emerald-200'
                  : diasAsignados === 6 ? 'bg-amber-200'
                  : 'bg-red-200'
                return (
                  <tr key={emp.id}>
                    <td className="px-3 py-2 align-top border-b border-r border-stone-100 sticky left-0 bg-white z-10">
                      <div className="text-sm font-medium text-stone-800 truncate">{emp.nombre}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <div className="w-full h-1.5 bg-stone-100 rounded overflow-hidden">
                          <div className={`h-full ${capColor}`} style={{ width: `${Math.min(100, (diasAsignados / 5) * 100)}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-stone-400">{diasAsignados}/5d</span>
                      </div>
                    </td>
                    {weekDays.map((d) => {
                      const cellAssigns = assignmentsByCell[`${emp.id}|${d}`] ?? []
                      const hol = holidayByDate[d]
                      const abs = absenceMap[`${emp.id}|${d}`]
                      const blocked = !!hol || !!abs
                      return (
                        <DroppableCell
                          key={`${emp.id}|${d}`}
                          employee_id={emp.id}
                          fecha={d}
                          blocked={blocked}
                          blockReason={hol ? `🇪🇸 ${hol.nombre}` : abs ? `🏖️ ${abs.tipo}` : null}
                          assignments={cellAssigns}
                          projectMap={projectMap}
                          onDelete={deleteAssignment}
                        />
                      )
                    })}
                  </tr>
                )
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-stone-400">
                    No hay trabajadores activos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* SIDEBAR PROYECTOS ARRASTRABLES */}
        <aside className="bg-white border border-stone-200 rounded p-3 self-start sticky top-4 max-h-[80vh] overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
            Proyectos · arrastra a celdas
          </p>
          <ul className="grid grid-cols-2 gap-1.5">
            {sortedProjects.recent.length > 0 && (
              <li className="col-span-2 text-[9px] font-bold uppercase tracking-widest text-emerald-600 mt-1">
                ★ Recientes ({sortedProjects.recent.length})
              </li>
            )}
            {sortedProjects.recent.map((p) => (
              <DraggableProject key={p.id} project={p} />
            ))}
            {sortedProjects.unused.length > 0 && sortedProjects.recent.length > 0 && (
              <li className="col-span-2 text-[9px] font-bold uppercase tracking-widest text-stone-400 mt-2">
                Resto ({sortedProjects.unused.length})
              </li>
            )}
            {sortedProjects.unused.map((p) => (
              <DraggableProject key={p.id} project={p} dim />
            ))}
            {projects.length === 0 && (
              <li className="col-span-2 text-xs text-stone-400 italic">Sin proyectos activos</li>
            )}
          </ul>

          <div className="mt-4 pt-3 border-t border-stone-100 text-[10px] text-stone-400 space-y-1">
            <p><strong>Drag</strong> proyecto → celda: asigna</p>
            <p><strong>Drag</strong> celda asignada → otra: mueve</p>
            <p><strong>Shift+drag</strong> → copia</p>
            <p>Click × en chip → borra</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ─── Sub-componente: proyecto draggable ─────────────────────────────────
function DraggableProject({ project, dim = false }: { project: Project; dim?: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return draggable({
      element: el,
      getInitialData: () => ({ type: 'project', project_id: project.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    })
  }, [project.id])

  const color = projectColor(project.id)
  const displayLine = project.address || project.name || project.code
  return (
    <li
      ref={ref}
      className={`${color} border rounded px-2 py-1.5 cursor-grab text-xs select-none ${dragging ? 'opacity-40' : ''} ${dim ? 'opacity-60' : ''}`}
      title={project.name ?? ''}
    >
      <div className="text-sm font-medium leading-tight">{displayLine}</div>
      <div className="text-[10px] font-mono opacity-60 mt-0.5">{project.code}</div>
    </li>
  )
}

// ─── Sub-componente: celda droppable ────────────────────────────────────
function DroppableCell({
  employee_id, fecha, blocked, blockReason, assignments, projectMap, onDelete,
}: {
  employee_id: string
  fecha: string
  blocked: boolean
  blockReason: string | null
  assignments: Assignment[]
  projectMap: Record<string, Project>
  onDelete: (id: string) => void
}) {
  const ref = useRef<HTMLTableCellElement>(null)
  const [isOver, setIsOver] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || blocked) return
    return dropTargetForElements({
      element: el,
      getData: () => ({ type: 'cell', employee_id, fecha }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    })
  }, [employee_id, fecha, blocked])

  return (
    <td
      ref={ref}
      className={`align-top border-b border-r border-stone-100 p-1 h-[64px] ${
        blocked ? 'bg-stone-50 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,#e7e5e4_4px,#e7e5e4_5px)]' : ''
      } ${isOver ? 'bg-emerald-50 ring-2 ring-emerald-400 ring-inset' : ''}`}
      title={blocked ? blockReason || '' : ''}
    >
      <div className="space-y-1">
        {assignments.map((a) => (
          <AssignmentChip
            key={a.id}
            assignment={a}
            project={a.project_id ? projectMap[a.project_id] : null}
            onDelete={onDelete}
          />
        ))}
      </div>
    </td>
  )
}

// ─── Sub-componente: chip asignación draggable ──────────────────────────
function AssignmentChip({
  assignment, project, onDelete,
}: {
  assignment: Assignment
  project: Project | null
  onDelete: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return draggable({
      element: el,
      getInitialData: () => ({
        type: 'assignment',
        assignment_id: assignment.id,
        employee_id: assignment.employee_id,
        fecha: assignment.fecha,
        project_id: assignment.project_id,
      }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    })
  }, [assignment.id, assignment.employee_id, assignment.fecha, assignment.project_id])

  const color = projectColor(assignment.project_id)
  const label = project?.address || project?.name || project?.code || '—'
  const tooltip = `${project?.code ?? ''} · ${project?.name ?? ''}`.trim()

  return (
    <div
      ref={ref}
      className={`${color} border rounded px-1.5 py-1 flex items-center gap-1 cursor-grab text-[11px] ${dragging ? 'opacity-40' : ''}`}
    >
      <span className="flex-1 truncate font-medium" title={tooltip}>{label}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(assignment.id) }}
        className="text-base font-bold leading-none opacity-60 hover:opacity-100 hover:text-red-700 px-1.5 -mr-1"
        title="Borrar"
      >
        ×
      </button>
    </div>
  )
}
