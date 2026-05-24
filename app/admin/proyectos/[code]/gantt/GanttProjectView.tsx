'use client'

/**
 * GanttProjectView — diagrama de Gantt por obra.
 *
 * Timeline horizontal por semanas. Cada tarea es una fila con su barra
 * posicionada según fecha_inicio_plan → fecha_fin_plan. Editable: fechas por
 * tarea (date inputs) que persisten vía PATCH /api/admin/proyectos/gantt.
 *
 * A medida (sin librería externa) para control total y compatibilidad React 19.
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Project {
  id: string
  code: string
  name: string | null
  status: string | null
  start_date: string | null
  end_date_planned: string | null
  end_date_real: string | null
}

interface Task {
  id: string
  texto: string
  estado: string
  prioridad: string
  subtipo: string | null
  tipo: string | null
  phase_id: string | null
  fecha_objetivo: string | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  orden: number | null
  parent_task_id: string | null
  dependencias: unknown
}

interface Props {
  project: Project
  tasks: Task[]
}

const DAY_MS = 86400000

function parseISO(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const dow = r.getDay()
  const off = dow === 0 ? -6 : 1 - dow
  r.setDate(r.getDate() + off)
  r.setHours(0, 0, 0, 0)
  return r
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-stone-400',
  en_curso: 'bg-blue-500',
  hecha: 'bg-emerald-500',
  bloqueada: 'bg-red-500',
}

export default function GanttProjectView({ project, tasks: initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const router = useRouter()
  const DAY_W = 22 // ancho px por día

  // Autogenerar el Gantt desde el presupuesto del proyecto
  async function generarDesdePresupuesto() {
    const hayAuto = tasks.length > 0
    if (hayAuto && !confirm('Esto regenera la planificación automática desde el presupuesto (las tareas auto-generadas se reemplazan; las que hayas añadido o movido a mano se conservan). ¿Continuar?')) return
    setGenerando(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/proyectos/gantt/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, num_trabajadores: 2 }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); return }
      setMsg(`✓ Generadas ${json.tareas} tareas (fin ${json.fin})`)
      router.refresh()
    } catch {
      setMsg('Error de red al generar')
    } finally {
      setGenerando(false)
    }
  }

  // Rango temporal: del mínimo inicio al máximo fin de las tareas planificadas;
  // fallback al start_date del proyecto + 8 semanas.
  const { rangeStart, totalDays, weeks, weekends } = useMemo(() => {
    const dates: Date[] = []
    for (const t of tasks) {
      const ini = parseISO(t.fecha_inicio_plan)
      const fin = parseISO(t.fecha_fin_plan)
      if (ini) dates.push(ini)
      if (fin) dates.push(fin)
    }
    const projStart = parseISO(project.start_date)
    if (projStart) dates.push(projStart)
    let min = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date()
    let max = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : addDays(new Date(), 56)
    min = startOfWeek(min)
    // margen: 1 semana antes, mínimo 8 semanas de ancho
    min = addDays(min, -7)
    if (diffDays(max, min) < 56) max = addDays(min, 56)
    max = addDays(startOfWeek(max), 13) // completar 2 semanas tras el último
    const total = diffDays(max, min) + 1
    const ws: { label: string; offsetDays: number }[] = []
    let cur = new Date(min)
    while (cur <= max) {
      ws.push({
        label: cur.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
        offsetDays: diffDays(cur, min),
      })
      cur = addDays(cur, 7)
    }
    // Sábados (gris) y domingos (rojo) — no laborables
    const wk: { offset: number; domingo: boolean }[] = []
    for (let i = 0; i < total; i++) {
      const dow = addDays(min, i).getDay()
      if (dow === 6) wk.push({ offset: i, domingo: false })
      else if (dow === 0) wk.push({ offset: i, domingo: true })
    }
    return { rangeStart: min, totalDays: total, weeks: ws, weekends: wk }
  }, [tasks, project.start_date])

  const todayOffset = diffDays(new Date(new Date().setHours(0, 0, 0, 0)), rangeStart)
  const hoyISO = toISO(new Date()) // fecha local (no UTC) para comparar retrasos

  // ─── Drag / resize de barras ───
  // mode 'move' arrastra toda la barra (cambia inicio+fin manteniendo duración).
  // mode 'resize' estira el borde derecho (cambia solo el fin → más/menos días).
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; ini: Date; fin: Date } | null>(null)
  const [preview, setPreview] = useState<{ id: string; mode: 'move' | 'resize'; deltaDays: number } | null>(null)

  useEffect(() => {
    if (!preview) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const deltaDays = Math.round((e.clientX - d.startX) / DAY_W)
      setPreview({ id: d.id, mode: d.mode, deltaDays })
    }
    function onUp() {
      const d = dragRef.current
      const pv = preview
      dragRef.current = null
      setPreview(null)
      if (!d || !pv || pv.deltaDays === 0) return
      if (d.mode === 'move') {
        const nIni = addDays(d.ini, pv.deltaDays)
        const nFin = addDays(d.fin, pv.deltaDays)
        saveDates(d.id, { fecha_inicio_plan: toISO(nIni), fecha_fin_plan: toISO(nFin) })
      } else {
        // resize: el fin no puede quedar antes del inicio (mínimo 1 día)
        let nFin = addDays(d.fin, pv.deltaDays)
        if (nFin < d.ini) nFin = new Date(d.ini)
        saveDates(d.id, { fecha_fin_plan: toISO(nFin) })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [preview])

  async function partirTarea(id: string) {
    if (!confirm('Partir esta tarea en dos (deja un hueco de 2 días y el resto continúa después). Luego puedes arrastrar cada parte. ¿Continuar?')) return
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/proyectos/gantt/partir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, hueco_dias: 2 }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); return }
      setMsg('✓ Tarea partida'); router.refresh()
    } catch {
      setMsg('Error de red al partir')
    } finally { setBusyId(null) }
  }

  function startDrag(e: React.PointerEvent, id: string, mode: 'move' | 'resize', ini: Date, fin: Date) {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { id, mode, startX: e.clientX, ini, fin }
    setPreview({ id, mode, deltaDays: 0 })
  }

  async function saveDates(id: string, patch: { fecha_inicio_plan?: string | null; fecha_fin_plan?: string | null }) {
    setBusyId(id)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      const res = await fetch('/api/admin/proyectos/gantt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); router.refresh(); return }
      setMsg('✓ Guardado')
      setTimeout(() => setMsg(null), 1500)
    } catch {
      setMsg('Error de red'); router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ao = a.orden ?? 9999, bo = b.orden ?? 9999
      if (ao !== bo) return ao - bo
      const ai = parseISO(a.fecha_inicio_plan)?.getTime() ?? Infinity
      const bi = parseISO(b.fecha_inicio_plan)?.getTime() ?? Infinity
      return ai - bi
    })
  }, [tasks])

  const sinPlanificar = sorted.filter((t) => !t.fecha_inicio_plan || !t.fecha_fin_plan)
  const planificadas = sorted.filter((t) => t.fecha_inicio_plan && t.fecha_fin_plan)

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin" className="hover:text-stone-900">Admin</Link>
            <span>›</span>
            <Link href="/admin/proyectos" className="hover:text-stone-900">Proyectos</Link>
            <span>›</span>
            <span className="text-stone-900">{project.code}</span>
            <span>›</span>
            <span className="text-stone-900">Gantt</span>
          </div>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-stone-900">
            {project.name || project.code}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">Planificación temporal de la obra · {planificadas.length} tareas en el diagrama</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <div className={`text-xs px-3 py-1.5 rounded ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>
          )}
          <button
            onClick={generarDesdePresupuesto}
            disabled={generando}
            className="text-xs bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
            title="Crea las tareas del Gantt agrupando las partidas del presupuesto por capítulo, en orden de obra y con fechas en cascada"
          >
            {generando ? 'Generando…' : '⚡ Generar desde presupuesto'}
          </button>
        </div>
      </div>

      {planificadas.length === 0 && sinPlanificar.length === 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          Este proyecto no tiene tareas. Añádelas desde la planificación del proyecto.
        </div>
      )}

      {/* GANTT */}
      {planificadas.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <div className="min-w-max">
            {/* Cabecera semanas */}
            <div className="flex border-b border-stone-200 bg-stone-50 sticky top-0 z-10">
              <div className="w-[260px] flex-none px-3 py-2 text-[10px] uppercase tracking-widest text-stone-500 border-r border-stone-200 sticky left-0 z-30 bg-stone-50">
                Tarea
              </div>
              <div className="relative" style={{ width: totalDays * DAY_W }}>
                {weekends.map((w, i) => (
                  <div
                    key={`wk-${i}`}
                    className={`absolute top-0 h-full ${w.domingo ? 'bg-red-100' : 'bg-stone-100'}`}
                    style={{ left: w.offset * DAY_W, width: DAY_W }}
                    title={w.domingo ? 'Domingo (no laborable)' : 'Sábado (no laborable)'}
                  />
                ))}
                {weeks.map((w, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-stone-200 px-1 py-2 text-[9px] text-stone-400"
                    style={{ left: w.offsetDays * DAY_W }}
                  >
                    {w.label}
                  </div>
                ))}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div className="absolute top-0 h-full w-px bg-red-400 z-20" style={{ left: todayOffset * DAY_W }} title="Hoy" />
                )}
              </div>
            </div>

            {/* Filas tareas */}
            {planificadas.map((t) => {
              const ini = parseISO(t.fecha_inicio_plan)!
              const fin = parseISO(t.fecha_fin_plan)!
              const offset = diffDays(ini, rangeStart)
              const dur = Math.max(1, diffDays(fin, ini) + 1)
              // Extras (remates fuera de presupuesto) → azul + rayado
              const esExtra = t.tipo === 'obra_remate'
              const color = esExtra ? 'bg-blue-600' : (ESTADO_COLOR[t.estado] ?? 'bg-stone-400')
              // % avance por estado
              const pct = t.estado === 'hecha' ? 100 : t.estado === 'en_curso' ? 50 : 0
              // Retraso: fin planificado pasado y no terminada
              const esRetraso = !!t.fecha_fin_plan && t.fecha_fin_plan < hoyISO && t.estado !== 'hecha'
              return (
                <div key={t.id} className="flex border-b border-stone-100 hover:bg-stone-50/50">
                  <div className="w-[260px] flex-none px-3 py-2 border-r border-stone-100 sticky left-0 z-20 bg-white">
                    <div className="text-xs font-medium text-stone-800 truncate" title={t.texto}>
                      {t.subtipo === 'reunion' ? '🤝 ' : ''}{t.texto}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <input
                        type="date"
                        value={t.fecha_inicio_plan ?? ''}
                        disabled={busyId === t.id}
                        onChange={(e) => saveDates(t.id, { fecha_inicio_plan: e.target.value || null })}
                        className="text-[9px] border border-stone-200 rounded px-1 py-0.5 w-[88px]"
                      />
                      <span className="text-[9px] text-stone-300">→</span>
                      <input
                        type="date"
                        value={t.fecha_fin_plan ?? ''}
                        disabled={busyId === t.id}
                        onChange={(e) => saveDates(t.id, { fecha_fin_plan: e.target.value || null })}
                        className="text-[9px] border border-stone-200 rounded px-1 py-0.5 w-[88px]"
                      />
                    </div>
                  </div>
                  <div className="relative py-2" style={{ width: totalDays * DAY_W }}>
                    {/* sábados (gris) y domingos (rojo): no laborables */}
                    {weekends.map((w, i) => (
                      <div key={`wk-${i}`} className={`absolute top-0 h-full ${w.domingo ? 'bg-red-100' : 'bg-stone-100'}`} style={{ left: w.offset * DAY_W, width: DAY_W }} />
                    ))}
                    {/* rejilla semanal */}
                    {weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 h-full border-l border-stone-100" style={{ left: w.offsetDays * DAY_W }} />
                    ))}
                    {todayOffset >= 0 && todayOffset < totalDays && (
                      <div className="absolute top-0 h-full w-px bg-red-400/50" style={{ left: todayOffset * DAY_W }} />
                    )}
                    {/* barra (arrastrable: mover toda la barra; borde dcho: estirar días) */}
                    {(() => {
                      const pv = preview?.id === t.id ? preview : null
                      const liveOffset = offset + (pv?.mode === 'move' ? pv.deltaDays : 0)
                      const liveDur = Math.max(1, dur + (pv?.mode === 'resize' ? pv.deltaDays : 0))
                      return (
                        <div
                          onPointerDown={(e) => startDrag(e, t.id, 'move', ini, fin)}
                          className={`absolute h-5 rounded ${color} overflow-hidden cursor-grab active:cursor-grabbing select-none ${esRetraso ? 'ring-2 ring-red-500' : esExtra ? 'ring-1 ring-amber-500' : ''} ${pv ? 'opacity-80 ring-2 ring-blue-400' : ''}`}
                          style={{
                            left: liveOffset * DAY_W,
                            width: liveDur * DAY_W - 2,
                            top: 4,
                            touchAction: 'none',
                            ...(esExtra ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px)' } : {}),
                          }}
                          title={`${t.fecha_inicio_plan} → ${t.fecha_fin_plan} (${dur} días) · ${t.estado} · ${pct}%${esExtra ? ' · EXTRA (remate)' : ''}${esRetraso ? ' · ⚠ RETRASO' : ''} · arrastra para mover, borde derecho para alargar`}
                        >
                          {pct > 0 && pct < 100 && (
                            <div className="absolute inset-y-0 left-0 bg-black/25 pointer-events-none" style={{ width: `${pct}%` }} />
                          )}
                          <span className="relative flex items-center h-full px-1.5 text-[9px] text-white font-medium pointer-events-none">
                            {esRetraso ? '⚠ ' : esExtra ? '★ ' : ''}{liveDur >= 3 ? `${liveDur}d` : ''}
                          </span>
                          {/* botón partir (✂) — solo si dura ≥2 días */}
                          {dur >= 2 && !pv && (
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); partirTarea(t.id) }}
                              className="absolute top-0 left-0 h-full px-1 flex items-center text-white/70 hover:text-white text-[10px] bg-black/10 hover:bg-black/30"
                              title="Partir la tarea (los trabajadores se van unos días)"
                            >✂</button>
                          )}
                          {/* handle resize borde derecho */}
                          <div
                            onPointerDown={(e) => startDrag(e, t.id, 'resize', ini, fin)}
                            className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                            style={{ touchAction: 'none' }}
                            title="Arrastra para alargar/acortar días"
                          />
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tareas sin planificar — asignar fechas */}
      {sinPlanificar.length > 0 && (
        <div className="mt-6 rounded-lg border border-stone-200 bg-white">
          <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/60 text-xs font-bold uppercase tracking-widest text-stone-500">
            Sin planificar ({sinPlanificar.length}) — asigna fechas para que aparezcan en el diagrama
          </div>
          <ul className="divide-y divide-stone-100">
            {sinPlanificar.map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-stone-700 truncate">{t.subtipo === 'reunion' ? '🤝 ' : '📋 '}{t.texto}</span>
                <div className="flex items-center gap-1 flex-none">
                  <input
                    type="date"
                    value={t.fecha_inicio_plan ?? ''}
                    disabled={busyId === t.id}
                    onChange={(e) => saveDates(t.id, { fecha_inicio_plan: e.target.value || null })}
                    className="text-[10px] border border-stone-200 rounded px-1 py-0.5"
                  />
                  <span className="text-[10px] text-stone-300">→</span>
                  <input
                    type="date"
                    value={t.fecha_fin_plan ?? ''}
                    disabled={busyId === t.id}
                    onChange={(e) => saveDates(t.id, { fecha_fin_plan: e.target.value || null })}
                    className="text-[10px] border border-stone-200 rounded px-1 py-0.5"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-600">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-stone-400" /> Pendiente</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> En curso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Hecha</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-1 ring-amber-500 bg-blue-600" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 2px, transparent 2px, transparent 4px)' }} /> ★ Extra / remate</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-red-500 bg-stone-400" /> ⚠ Retraso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-stone-100 border border-stone-200" /> Sábado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Domingo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400" /> Hoy</span>
      </div>
    </div>
  )
}
