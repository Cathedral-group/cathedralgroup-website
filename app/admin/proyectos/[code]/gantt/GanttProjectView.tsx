'use client'

/**
 * GanttProjectView — diagrama de Gantt por obra (modelo de segmentos).
 *
 * Cada tarea tiene un array de segmentos de trabajo [{inicio,fin}]. Cada
 * segmento es una barra; los huecos entre segmentos son las pausas (no se
 * modelan como dato). Dentro de cada segmento, los findes/festivos se dibujan
 * como hueco (no se trabaja) y no cuentan como días, salvo días extra.
 *
 * Edición: mover segmento, redimensionar por izquierda/derecha, partir (divide
 * un segmento en dos) y fusionar (une dos segmentos contiguos cerrando el
 * hueco). Toda edición manda el array completo a /api/admin/proyectos/gantt/segmentos.
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
  gantt_inicio_previsto?: string | null
  gantt_fin_previsto?: string | null
  gantt_horas_previstas?: number | null
  gantt_trabajadores_previstos?: number | null
}

interface Seg { inicio: string; fin: string }

interface Task {
  id: string
  texto: string
  estado: string
  prioridad: string
  subtipo: string | null
  tipo: string | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  orden: number | null
  segmentos?: Seg[] | null
  dias_extra?: Array<{ fecha: string; horas: number }> | string[] | null
}

interface Props {
  project: Project
  tasks: Task[]
  holidays?: Array<{ fecha: string; nombre: string }>
}

const DAY_MS = 86400000
const DAY_W = 22
// Acrónimo de día de la semana indexado por getDay() (0=domingo)
const WEEKDAY_ABBR = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function startOfWeek(d: Date): Date {
  const r = new Date(d); const dow = r.getDay(); const off = dow === 0 ? -6 : 1 - dow
  r.setDate(r.getDate() + off); r.setHours(0, 0, 0, 0); return r
}
function diffDays(a: Date, b: Date): number { return Math.round((a.getTime() - b.getTime()) / DAY_MS) }

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-stone-400',
  en_curso: 'bg-blue-500',
  hecha: 'bg-emerald-500',
  bloqueada: 'bg-red-500',
}

// Segmentos de una tarea (con fallback a fecha_inicio/fin si no hay)
function segmentosDe(t: Task): Seg[] {
  if (Array.isArray(t.segmentos) && t.segmentos.length > 0) {
    return [...t.segmentos].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
  }
  if (t.fecha_inicio_plan && t.fecha_fin_plan) return [{ inicio: t.fecha_inicio_plan, fin: t.fecha_fin_plan }]
  return []
}

export default function GanttProjectView({ project, tasks: initialTasks, holidays = [] }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const router = useRouter()

  const holidayMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of holidays) m[h.fecha] = h.nombre
    return m
  }, [holidays])

  // ─── Rango temporal ───
  const { rangeStart, totalDays, weeks, weekends } = useMemo(() => {
    const dates: Date[] = []
    for (const t of tasks) {
      for (const s of segmentosDe(t)) {
        const i = parseISO(s.inicio), f = parseISO(s.fin)
        if (i) dates.push(i); if (f) dates.push(f)
      }
      for (const x of (t.dias_extra ?? [])) {
        const d = parseISO(typeof x === 'string' ? x : x.fecha)
        if (d) dates.push(d)
      }
    }
    const projStart = parseISO(project.start_date)
    if (projStart) dates.push(projStart)
    let min = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date()
    let max = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : addDays(new Date(), 56)
    min = addDays(startOfWeek(min), -7)
    if (diffDays(max, min) < 56) max = addDays(min, 56)
    max = addDays(startOfWeek(max), 112) // margen amplio (16 sem) para días lejanos
    const total = diffDays(max, min) + 1
    const ws: { label: string; offsetDays: number }[] = []
    let cur = new Date(min)
    while (cur <= max) {
      ws.push({ label: cur.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }), offsetDays: diffDays(cur, min) })
      cur = addDays(cur, 7)
    }
    const wk: { offset: number; domingo: boolean }[] = []
    for (let i = 0; i < total; i++) {
      const dow = addDays(min, i).getDay()
      if (dow === 6) wk.push({ offset: i, domingo: false })
      else if (dow === 0) wk.push({ offset: i, domingo: true })
    }
    return { rangeStart: min, totalDays: total, weeks: ws, weekends: wk }
  }, [tasks, project.start_date])

  const todayOffset = diffDays(new Date(new Date().setHours(0, 0, 0, 0)), rangeStart)
  const hoyISO = toISO(new Date())

  const festivos = useMemo(() => {
    const out: { offset: number; nombre: string }[] = []
    for (let i = 0; i < totalDays; i++) {
      const iso = toISO(addDays(rangeStart, i))
      if (holidayMap[iso]) out.push({ offset: i, nombre: holidayMap[iso] })
    }
    return out
  }, [rangeStart, totalDays, holidayMap])

  const nonWorkingSet = useMemo(() => {
    const s = new Set<number>()
    for (const w of weekends) s.add(w.offset)
    for (const f of festivos) s.add(f.offset)
    return s
  }, [weekends, festivos])

  // ─── Persistencia ───
  async function saveSegmentos(id: string, segmentos: Seg[]) {
    setBusyId(id)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, segmentos } : t)))
    try {
      const res = await fetch('/api/admin/proyectos/gantt/segmentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, segmentos }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); router.refresh(); return }
      setMsg('✓ Guardado')
      setTimeout(() => setMsg(null), 1200)
      router.refresh()
    } catch { setMsg('Error de red'); router.refresh() } finally { setBusyId(null) }
  }

  async function confirmarPlanificacion() {
    if (!confirm('Confirmar esta planificación como línea base? A partir de aquí se medirá la desviación (días/horas de más o de menos).')) return
    setBusyId('__confirm__')
    try {
      const res = await fetch('/api/admin/proyectos/gantt/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, num_trabajadores: 2 }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); return }
      setMsg('✓ Planificación confirmada'); router.refresh()
    } catch { setMsg('Error de red') } finally { setBusyId(null) }
  }

  async function generarDesdePresupuesto() {
    if (tasks.length > 0 && !confirm('Regenera la planificación automática desde el presupuesto. Las tareas auto-generadas se reemplazan. ¿Continuar?')) return
    setGenerando(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/proyectos/gantt/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, num_trabajadores: 2 }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); return }
      setMsg(`✓ Generadas ${json.tareas} tareas`); router.refresh()
    } catch { setMsg('Error de red al generar') } finally { setGenerando(false) }
  }

  // Añadir una barra nueva (segmento independiente) en la misma línea. Se coloca
  // tras el último tramo; el usuario la mueve/redimensiona donde quiera.
  function anadirSegmento(id: string, segs: Seg[]) {
    const ultimoFin = segs.length > 0
      ? segs.reduce((m, s) => (s.fin > m ? s.fin : m), segs[0].fin)
      : toISO(new Date())
    const base = parseISO(ultimoFin) ?? new Date()
    const ini = addDays(base, 3)   // unos días después del final
    const fin = addDays(ini, 2)    // 3 días de duración por defecto
    saveSegmentos(id, [...segs, { inicio: toISO(ini), fin: toISO(fin) }])
  }

  // Días extra (sin cambios de modelo: finde/festivo trabajados)
  async function postDiaExtra(id: string, fecha: string, horas: number) {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/proyectos/gantt/dia-extra', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, fecha, horas }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { setMsg(`Error: ${json.error ?? res.status}`); return }
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, dias_extra: json.dias_extra } : t)))
      setMsg(json.activo ? `✓ Día de trabajo añadido (${horas}h)` : '✓ Día quitado')
      router.refresh()
    } catch { setMsg('Error de red') } finally { setBusyId(null) }
  }
  function anadirDiaExtra(id: string, fecha: string) {
    const h = prompt('¿Cuántas horas se trabajan ese día? (un sábado suele ser 4)', '4')
    if (h === null || h.trim() === '') return
    const horas = Math.max(0, Math.min(24, parseFloat(h.replace(',', '.')) || 0))
    if (horas === 0) return
    postDiaExtra(id, fecha, horas)
  }
  function quitarDiaExtra(id: string, fecha: string) { postDiaExtra(id, fecha, 0) }

  // ─── Drag (mover / redimensionar izquierda o derecha de un segmento) ───
  type DragMode = 'move' | 'resize-left' | 'resize-right'
  const dragRef = useRef<{ id: string; segIdx: number; mode: DragMode; startX: number; segs: Seg[] } | null>(null)
  const [preview, setPreview] = useState<{ id: string; segIdx: number; mode: DragMode; deltaDays: number } | null>(null)

  useEffect(() => {
    if (!preview) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      setPreview({ id: d.id, segIdx: d.segIdx, mode: d.mode, deltaDays: Math.round((e.clientX - d.startX) / DAY_W) })
    }
    function onUp() {
      const d = dragRef.current
      const pv = preview
      dragRef.current = null
      setPreview(null)
      if (!d || !pv || pv.deltaDays === 0) return
      const segs = d.segs.map((s) => ({ ...s }))
      const seg = segs[d.segIdx]
      const ini = parseISO(seg.inicio)!, fin = parseISO(seg.fin)!
      if (d.mode === 'move') {
        seg.inicio = toISO(addDays(ini, pv.deltaDays))
        seg.fin = toISO(addDays(fin, pv.deltaDays))
      } else if (d.mode === 'resize-left') {
        let nIni = addDays(ini, pv.deltaDays)
        if (nIni > fin) nIni = new Date(fin)
        seg.inicio = toISO(nIni)
      } else {
        let nFin = addDays(fin, pv.deltaDays)
        if (nFin < ini) nFin = new Date(ini)
        seg.fin = toISO(nFin)
      }
      saveSegmentos(d.id, segs)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [preview]) // eslint-disable-line react-hooks/exhaustive-deps

  function startDrag(e: React.PointerEvent, id: string, segIdx: number, mode: DragMode, segs: Seg[]) {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { id, segIdx, mode, startX: e.clientX, segs }
    setPreview({ id, segIdx, mode, deltaDays: 0 })
  }

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ao = a.orden ?? 9999, bo = b.orden ?? 9999
      if (ao !== bo) return ao - bo
      const ai = parseISO(segmentosDe(a)[0]?.inicio)?.getTime() ?? Infinity
      const bi = parseISO(segmentosDe(b)[0]?.inicio)?.getTime() ?? Infinity
      return ai - bi
    })
  }, [tasks])

  const planificadas = sorted.filter((t) => segmentosDe(t).length > 0)
  const sinPlanificar = sorted.filter((t) => segmentosDe(t).length === 0)

  // ─── Resumen: previsto vs actual ───
  const fmtDia = (iso: string | null | undefined) =>
    iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  function busDaysBetween(aISO: string, bISO: string): number {
    const a = parseISO(aISO), b = parseISO(bISO)
    if (!a || !b) return 0
    const sign = b >= a ? 1 : -1
    const lo = b >= a ? a : b, hi = b >= a ? b : a
    let n = 0; const c = new Date(lo)
    while (c < hi) { c.setDate(c.getDate() + 1); const dow = c.getDay(); if (dow !== 0 && dow !== 6 && !holidayMap[toISO(c)]) n++ }
    return n * sign
  }
  const { finActual, inicioActual, diasTrabajoTotal } = useMemo(() => {
    let fin: string | null = null, ini: string | null = null, dias = 0
    for (const t of tasks) {
      for (const s of segmentosDe(t)) {
        if (!fin || s.fin > fin) fin = s.fin
        if (!ini || s.inicio < ini) ini = s.inicio
        // días de trabajo del segmento (laborables, sin findes/festivos)
        const a = parseISO(s.inicio), b = parseISO(s.fin)
        if (a && b) { const c = new Date(a); while (c <= b) { const dow = c.getDay(); if (dow !== 0 && dow !== 6 && !holidayMap[toISO(c)]) dias++; c.setDate(c.getDate() + 1) } }
      }
    }
    return { finActual: fin, inicioActual: ini, diasTrabajoTotal: dias }
  }, [tasks, holidayMap])
  const finPrevisto = project.gantt_fin_previsto ?? null
  const nTrab = project.gantt_trabajadores_previstos ?? 2
  const desviacionDias = finPrevisto && finActual ? busDaysBetween(finPrevisto, finActual) : null
  const desviacionHoras = desviacionDias !== null ? desviacionDias * 8 * nTrab : null

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin" className="hover:text-stone-900">Admin</Link><span>›</span>
            <Link href="/admin/proyectos" className="hover:text-stone-900">Proyectos</Link><span>›</span>
            <span className="text-stone-900">{project.code}</span><span>›</span>
            <span className="text-stone-900">Gantt</span>
          </div>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-stone-900">{project.name || project.code}</h1>
          <p className="text-xs text-stone-500 mt-0.5">Planificación temporal · {planificadas.length} tareas</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <div className={`text-xs px-3 py-1.5 rounded ${msg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}
          {planificadas.length > 0 && (
            <button onClick={confirmarPlanificacion} disabled={busyId === '__confirm__'}
              className={`text-xs px-4 py-2 rounded font-medium disabled:opacity-50 ${finPrevisto ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
              title="Fija la planificación actual como línea base para medir la desviación">
              {busyId === '__confirm__' ? 'Confirmando…' : finPrevisto ? '✓ Reconfirmar base' : '✓ Confirmar planificación'}
            </button>
          )}
          <button onClick={generarDesdePresupuesto} disabled={generando}
            className={`text-xs px-4 py-2 rounded disabled:opacity-50 font-medium transition-colors ${
              planificadas.length === 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
            }`}
            title={planificadas.length === 0 ? 'Crea la planificación automática desde las partidas del presupuesto' : 'Reemplaza la planificación auto-generada por una nueva desde el presupuesto'}>
            {generando ? 'Generando…' : planificadas.length === 0 ? '⚡ Generar desde presupuesto' : '⚡ Regenerar'}
          </button>
        </div>
      </div>

      {/* Resumen del proyecto */}
      {planificadas.length > 0 && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-stone-400">Inicio</div>
            <div className="text-sm font-medium text-stone-800">{fmtDia(inicioActual)}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-stone-400">Fin previsto</div>
            <div className="text-sm font-medium text-stone-800">{fmtDia(finPrevisto)}</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-stone-400">Fin actual</div>
            <div className="text-sm font-medium text-stone-800">{fmtDia(finActual)}</div>
          </div>
          <div className={`rounded-lg border px-3 py-2 ${desviacionDias === null ? 'border-stone-200 bg-white' : desviacionDias > 0 ? 'border-red-200 bg-red-50' : desviacionDias < 0 ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
            <div className="text-[9px] uppercase tracking-widest text-stone-400">Desviación</div>
            <div className={`text-sm font-bold ${desviacionDias === null ? 'text-stone-400' : desviacionDias > 0 ? 'text-red-700' : desviacionDias < 0 ? 'text-emerald-700' : 'text-stone-700'}`}>
              {desviacionDias === null ? 'Sin confirmar'
                : desviacionDias === 0 ? 'En plazo'
                : `${desviacionDias > 0 ? '+' : ''}${desviacionDias} día${Math.abs(desviacionDias) === 1 ? '' : 's'}`}
            </div>
            {desviacionHoras !== null && desviacionDias !== 0 && (
              <div className="text-[10px] text-stone-500">{desviacionHoras > 0 ? '+' : ''}{desviacionHoras} h</div>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-stone-400">Días de trabajo</div>
            <div className="text-sm font-medium text-blue-700">{diasTrabajoTotal} d</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-stone-400">Horas previstas</div>
            <div className="text-sm font-medium text-stone-800">{project.gantt_horas_previstas ? `${project.gantt_horas_previstas} h` : '—'}</div>
            {nTrab ? <div className="text-[10px] text-stone-500">{nTrab} trabajadores</div> : null}
          </div>
        </div>
      )}

      {planificadas.length === 0 && sinPlanificar.length === 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          Este proyecto no tiene tareas. Genera desde el presupuesto o añádelas en la planificación.
        </div>
      )}

      {planificadas.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
          <div className="min-w-max">
            {/* Cabecera */}
            <div className="flex border-b border-stone-200 bg-stone-50 sticky top-0 z-10">
              <div className="w-[260px] flex-none px-3 flex items-end pb-1 text-[10px] uppercase tracking-widest text-stone-500 border-r border-stone-200 sticky left-0 z-30 bg-stone-50">Tarea</div>
              <div className="relative" style={{ width: totalDays * DAY_W }}>
                {weekends.map((w, i) => (
                  <div key={`wk-${i}`} className={`absolute top-0 h-full pointer-events-none ${w.domingo ? 'bg-red-100' : 'bg-stone-100'}`} style={{ left: w.offset * DAY_W, width: DAY_W }} title={w.domingo ? 'Domingo' : 'Sábado'} />
                ))}
                {festivos.map((f, i) => (
                  <div key={`fe-${i}`} className="absolute top-0 h-full bg-orange-200 pointer-events-none" style={{ left: f.offset * DAY_W, width: DAY_W }} title={`Festivo: ${f.nombre}`} />
                ))}
                {/* Tira superior: etiqueta mes/semana */}
                <div className="relative h-4">
                  {weeks.map((w, i) => (
                    <div key={i} className="absolute top-0 border-l border-stone-200 pl-1 text-[9px] text-stone-400 leading-4" style={{ left: w.offsetDays * DAY_W }}>{w.label}</div>
                  ))}
                </div>
                {/* Tira inferior: acrónimo de día (L M X J V S D) con separadores gris claro */}
                <div className="relative flex h-4">
                  {Array.from({ length: totalDays }).map((_, i) => {
                    const dow = addDays(rangeStart, i).getDay()
                    const finde = dow === 0 || dow === 6
                    return (
                      <div key={i} className={`flex-none text-center text-[8px] leading-4 border-l border-stone-200/70 ${finde ? 'text-stone-400 font-semibold' : 'text-stone-400'}`} style={{ width: DAY_W }}>
                        {WEEKDAY_ABBR[dow]}
                      </div>
                    )
                  })}
                </div>
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div className="absolute top-0 h-full w-px bg-red-400 z-20" style={{ left: todayOffset * DAY_W }} title="Hoy" />
                )}
              </div>
            </div>

            {/* Filas */}
            {planificadas.map((t) => {
              const segs = segmentosDe(t)
              const color = t.tipo === 'obra_remate' ? 'bg-blue-600' : (ESTADO_COLOR[t.estado] ?? 'bg-stone-400')
              const esExtra = t.tipo === 'obra_remate'
              const esRetraso = !!t.fecha_fin_plan && t.fecha_fin_plan < hoyISO && t.estado !== 'hecha'
              // días extra → offset:horas
              const extraMap = new Map<number, number>()
              for (const x of (t.dias_extra ?? [])) {
                const fecha = typeof x === 'string' ? x : x.fecha
                const horas = typeof x === 'string' ? 8 : x.horas
                const d = parseISO(fecha)
                if (d) extraMap.set(diffDays(d, rangeStart), horas)
              }
              return (
                <div key={t.id} className="flex border-b border-stone-100 hover:bg-stone-50/50">
                  <div className="w-[260px] flex-none px-3 py-2 border-r border-stone-100 sticky left-0 z-20 bg-white">
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-xs font-medium text-stone-800 truncate" title={t.texto}>
                        {t.subtipo === 'reunion' ? '🤝 ' : ''}{t.texto}
                      </div>
                      <button
                        onClick={() => anadirSegmento(t.id, segs)}
                        disabled={busyId === t.id}
                        className="flex-none text-[11px] text-blue-500 hover:text-blue-700 disabled:opacity-40 px-1 border border-blue-200 rounded leading-none"
                        title="Añadir otra barra de trabajo en esta misma línea (p.ej. el oficio vuelve más adelante)"
                      >＋</button>
                    </div>
                    <div className="mt-0.5 text-[9px] text-stone-400">
                      {t.fecha_inicio_plan} → {t.fecha_fin_plan}
                    </div>
                    {/* huecos (pausas) entre segmentos, con fusionar */}
                    {segs.length > 1 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {segs.slice(0, -1).map((s, gi) => {
                          const finA = parseISO(s.fin)!, iniB = parseISO(segs[gi + 1].inicio)!
                          const d1 = addDays(finA, 1).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
                          const d2 = addDays(iniB, -1).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
                          return (
                            <span key={`gap-${gi}`} className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1 py-0.5" title="Parada entre barras">
                              parada {d1}–{d2}
                              <button
                                onClick={() => {
                                  const next = [...segs]
                                  next.splice(gi, 2, { inicio: segs[gi].inicio, fin: segs[gi + 1].fin })
                                  saveSegmentos(t.id, next)
                                }}
                                disabled={busyId === t.id}
                                className="text-amber-400 hover:text-red-600 font-bold leading-none"
                                title="Unir los dos tramos (quitar la parada)"
                              >×</button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {/* días extra con borrar */}
                    {extraMap.size > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Array.from(extraMap.entries()).sort((a, b) => a[0] - b[0]).map(([off, horas]) => {
                          const f = addDays(rangeStart, off)
                          return (
                            <span key={`exl-${off}`} className="inline-flex items-center gap-1 text-[9px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 py-0.5">
                              {f.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })} · {horas}h
                              <button onClick={() => quitarDiaExtra(t.id, toISO(f))} disabled={busyId === t.id}
                                className="text-blue-400 hover:text-red-600 font-bold leading-none" title="Quitar día de trabajo extra">×</button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Timeline de la fila */}
                  <div
                    className="relative py-2"
                    style={{ width: totalDays * DAY_W }}
                    title="Clica un día gris/rojo/naranja para añadirlo como día de trabajo extra"
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const off = Math.floor((e.clientX - rect.left) / DAY_W)
                      if (off < 0 || off >= totalDays) return
                      if (!nonWorkingSet.has(off)) return
                      if (extraMap.has(off)) return
                      anadirDiaExtra(t.id, toISO(addDays(rangeStart, off)))
                    }}
                  >
                    {weekends.map((w, i) => (
                      <div key={`wk-${i}`} className={`absolute top-0 h-full pointer-events-none ${w.domingo ? 'bg-red-100' : 'bg-stone-100'}`} style={{ left: w.offset * DAY_W, width: DAY_W }} />
                    ))}
                    {festivos.map((f, i) => (
                      <div key={`fe-${i}`} className="absolute top-0 h-full bg-orange-200 pointer-events-none" style={{ left: f.offset * DAY_W, width: DAY_W }} />
                    ))}
                    {weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 h-full border-l border-stone-100 pointer-events-none" style={{ left: w.offsetDays * DAY_W }} />
                    ))}
                    {todayOffset >= 0 && todayOffset < totalDays && (
                      <div className="absolute top-0 h-full w-px bg-red-400/50 pointer-events-none" style={{ left: todayOffset * DAY_W }} />
                    )}

                    {/* una barra por segmento; dentro, cortada en findes/festivos */}
                    {segs.map((s, segIdx) => {
                      const pv = preview?.id === t.id && preview.segIdx === segIdx ? preview : null
                      const segIni = parseISO(s.inicio)!, segFin = parseISO(s.fin)!
                      let off0 = diffDays(segIni, rangeStart)
                      let off1 = diffDays(segFin, rangeStart) // inclusive
                      if (pv?.mode === 'move') { off0 += pv.deltaDays; off1 += pv.deltaDays }
                      else if (pv?.mode === 'resize-left') { off0 = Math.min(off1, off0 + pv.deltaDays) }
                      else if (pv?.mode === 'resize-right') { off1 = Math.max(off0, off1 + pv.deltaDays) }
                      const segLen = off1 - off0 + 1
                      // sub-tramos laborables dentro del segmento (cortar findes/festivos)
                      const subs: { rel: number; len: number }[] = []
                      let i = 0
                      while (i < segLen) {
                        if (nonWorkingSet.has(off0 + i)) { i++; continue }
                        let j = i
                        while (j < segLen && !nonWorkingSet.has(off0 + j)) j++
                        subs.push({ rel: i, len: j - i })
                        i = j
                      }
                      const diasTrabajo = subs.reduce((a, x) => a + x.len, 0)
                      return (
                        <div key={`seg-${segIdx}`}>
                          {subs.map((sub, sui) => (
                            <div
                              key={`sub-${sui}`}
                              onPointerDown={(e) => startDrag(e, t.id, segIdx, 'move', segs)}
                              className={`absolute h-5 rounded ${color} overflow-hidden cursor-grab active:cursor-grabbing select-none ${esRetraso ? 'ring-1 ring-red-500' : ''} ${pv ? 'opacity-80' : ''}`}
                              style={{
                                left: (off0 + sub.rel) * DAY_W, width: sub.len * DAY_W - 2, top: 4, touchAction: 'none',
                                ...(esExtra ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px)' } : {}),
                              }}
                              title={`${s.inicio} → ${s.fin} · ${diasTrabajo} días de trabajo${esExtra ? ' · EXTRA' : ''}${esRetraso ? ' · ⚠ RETRASO' : ''}`}
                            >
                              {sui === 0 && (
                                <span className="relative flex items-center h-full px-1.5 text-[9px] text-white font-medium pointer-events-none whitespace-nowrap">
                                  {esRetraso ? '⚠ ' : esExtra ? '★ ' : ''}{diasTrabajo}d
                                </span>
                              )}
                              {/* handle resize izquierda (en el primer sub-tramo) */}
                              {sui === 0 && (
                                <div onPointerDown={(e) => startDrag(e, t.id, segIdx, 'resize-left', segs)}
                                  className="absolute top-0 left-0 h-full w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                                  style={{ touchAction: 'none' }} title="Arrastra para mover el inicio" />
                              )}
                              {/* handle resize derecha (en el último sub-tramo) */}
                              {sui === subs.length - 1 && (
                                <div onPointerDown={(e) => startDrag(e, t.id, segIdx, 'resize-right', segs)}
                                  className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-white/30 hover:bg-white/60"
                                  style={{ touchAction: 'none' }} title="Arrastra para mover el fin" />
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })}

                    {/* mini-barras de días extra (jornada parcial) */}
                    {Array.from(extraMap.entries()).map(([off, horas]) => {
                      const altura = Math.min(20, Math.max(4, Math.round((horas / 8) * 20)))
                      return (
                        <div key={`ex-${off}`} className={`absolute rounded ${color} ring-1 ring-blue-500 pointer-events-none flex items-end justify-center`}
                          style={{ left: off * DAY_W, width: DAY_W - 2, height: altura, bottom: 6 }} title={`Día extra: ${horas}h`}>
                          <span className="text-[7px] text-white leading-none pb-0.5">{horas}h</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tareas sin planificar */}
      {sinPlanificar.length > 0 && (
        <div className="mt-6 rounded-lg border border-stone-200 bg-white">
          <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/60 text-xs font-bold uppercase tracking-widest text-stone-500">
            Sin planificar ({sinPlanificar.length}) — asigna fechas
          </div>
          <ul className="divide-y divide-stone-100">
            {sinPlanificar.map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-stone-700 truncate">{t.subtipo === 'reunion' ? '🤝 ' : '📋 '}{t.texto}</span>
                <div className="flex items-center gap-1 flex-none">
                  <input type="date" disabled={busyId === t.id}
                    onChange={(e) => { if (e.target.value) saveSegmentos(t.id, [{ inicio: e.target.value, fin: e.target.value }]) }}
                    className="text-[10px] border border-stone-200 rounded px-1 py-0.5" title="Fecha de inicio (luego ajusta el fin arrastrando)" />
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
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 ring-1 ring-amber-500" /> Extra/remate</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-stone-100 border border-stone-200" /> Sábado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Domingo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 border border-orange-300" /> Festivo</span>
        <span className="flex items-center gap-1">＋ añade otra barra en la línea · arrastra bordes para redimensionar · clic en día gris/rojo = trabajo extra</span>
      </div>
    </div>
  )
}
