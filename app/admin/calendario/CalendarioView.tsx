'use client'

/**
 * Calendario admin — vistas día/semana/mes con capas toggleables.
 *
 * Vista Semana: grid 7 columnas, filas por trabajador (estilo cuadrante).
 * Vista Mes: grid 7x5/6 con compresión (chips por obra/empleado por día).
 * Vista Día: lista vertical de eventos agrupados por hora/proyecto.
 *
 * Click en celda → drawer lateral con TODO lo del día agrupado por obra.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import CuadranteView from './cuadrante/CuadranteView'

interface CalendarEvent {
  fecha: string
  employee_id: string | null
  employee_nombre: string | null
  project_id: string | null
  project_code: string | null
  project_name: string | null
  event_type: 'assignment' | 'absence' | 'task' | 'time_record' | 'holiday'
  ref_id: string
  company_id: string
  payload: Record<string, unknown> | null
}

interface Employee {
  id: string
  nombre: string | null
}

interface Socio {
  user_id: string
  email: string
  nombre: string
}

interface YearEvent {
  fecha: string
  event_type: string
  tipo: string | null
  subtipo: string | null
}

interface Project {
  id: string
  code: string
  name: string | null
  status: string | null
  address?: string | null
}

interface CuadranteAssignment {
  id: string
  employee_id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
}
interface CuadranteHoliday { fecha: string; nombre: string; ambito: string }
interface CuadranteAbsence {
  employee_id: string
  tipo: string
  fecha_inicio: string
  fecha_fin: string
  status: string
}

interface FiscalEntry {
  modelo: string
  ejercicio: number
  periodo: string
  fecha_inicio_plazo: string
  fecha_limite: string
  nombre: string
  descripcion: string | null
}

interface Props {
  vista: 'dia' | 'semana' | 'mes'
  desde: string
  hasta: string
  refFecha: string
  events: CalendarEvent[]
  employees: Employee[]
  socios?: Socio[]
  projects: Project[]
  cuadranteWeekDays?: string[]
  cuadranteAssignments?: CuadranteAssignment[]
  cuadranteHolidays?: CuadranteHoliday[]
  cuadranteAbsences?: CuadranteAbsence[]
  yearHolidays?: string[]
  yearEvents?: YearEvent[]
  fiscalEntries?: FiscalEntry[]
}

const EVENT_ICONS: Record<CalendarEvent['event_type'], string> = {
  assignment: '👷',
  absence: '🏖️',
  task: '📋',
  time_record: '⏱️',
  holiday: '🇪🇸',
}

const EVENT_LABELS: Record<CalendarEvent['event_type'], string> = {
  assignment: 'Asignaciones',
  absence: 'Ausencias',
  task: 'Tareas',
  time_record: 'Fichajes',
  holiday: 'Festivos',
}

function fmtDateShort(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
}

function fmtDateLong(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Fix timezone bug sesión 22/05: toISOString() convierte a UTC, en Madrid
// (UTC+1/+2) días local 00:00 → UTC día anterior 23:00. Usar formato local.
function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(desde: string, hasta: string): string[] {
  const out: string[] = []
  const d = new Date(desde + 'T00:00:00')
  const end = new Date(hasta + 'T00:00:00')
  while (d <= end) {
    out.push(toLocalISODate(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

const DAY_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

export default function CalendarioView({
  vista, desde, hasta, refFecha, events, employees, socios = [], projects,
  cuadranteWeekDays, cuadranteAssignments, cuadranteHolidays, cuadranteAbsences,
  yearHolidays = [], yearEvents = [], fiscalEntries = [],
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Dirección+número como etiqueta de proyecto (feedback David: en el panel
  // siempre la dirección, no el código). Fallback a code si no hay address.
  const projectsById = useMemo(() => {
    const m: Record<string, Project> = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])
  const projLabel = (id: string | null | undefined, fallbackCode?: string | null): string => {
    if (!id) return fallbackCode ?? ''
    const p = projectsById[id]
    return p?.address || p?.name || p?.code || fallbackCode || ''
  }

  const [layers, setLayers] = useState({
    assignment: true,
    time_record: true,
    absence: true,
    holiday: true,
    task: true,
  })
  const [drawerDay, setDrawerDay] = useState<string | null>(null)

  const days = useMemo(() => daysBetween(desde, hasta), [desde, hasta])
  const todayStr = toLocalISODate(new Date())

  // Fiscal obligations indexadas por fecha. Una entry puede aparecer en su
  // fecha_inicio_plazo (amarillo) Y en fecha_limite (rojo).
  const fiscalByStart = useMemo(() => {
    const m: Record<string, FiscalEntry[]> = {}
    for (const f of fiscalEntries) (m[f.fecha_inicio_plazo] ??= []).push(f)
    return m
  }, [fiscalEntries])
  const fiscalByLimit = useMemo(() => {
    const m: Record<string, FiscalEntry[]> = {}
    for (const f of fiscalEntries) (m[f.fecha_limite] ??= []).push(f)
    return m
  }, [fiscalEntries])

  // Resumen año: fecha → flags de actividad (para marcar la vista Año entera).
  const yearFlagsByDay = useMemo(() => {
    const m: Record<string, { assignment: boolean; task: boolean; reunion: boolean; socio: boolean; absence: boolean }> = {}
    for (const e of yearEvents) {
      const f = (m[e.fecha] ??= { assignment: false, task: false, reunion: false, socio: false, absence: false })
      if (e.event_type === 'assignment') f.assignment = true
      else if (e.event_type === 'absence') f.absence = true
      else if (e.event_type === 'task') {
        if (e.tipo === 'interna_socio') f.socio = true
        else if (e.subtipo === 'reunion') f.reunion = true
        else f.task = true
      }
    }
    return m
  }, [yearEvents])

  // Agrupar eventos por día
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const e of events) {
      if (!layers[e.event_type]) continue
      ;(map[e.fecha] ??= []).push(e)
    }
    return map
  }, [events, layers])

  // Para vista Semana (estilo cuadrante): por empleado por día
  const employeeDayMatrix = useMemo(() => {
    const map: Record<string, Record<string, CalendarEvent[]>> = {}
    for (const emp of employees) {
      map[emp.id] = {}
      for (const d of days) map[emp.id][d] = []
    }
    for (const e of events) {
      if (!layers[e.event_type]) continue
      if (e.employee_id && map[e.employee_id]?.[e.fecha]) {
        map[e.employee_id][e.fecha].push(e)
      }
    }
    return map
  }, [events, employees, days, layers])

  function goTo(nextRef: string, nextVista?: 'dia' | 'semana' | 'mes') {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('vista', nextVista ?? vista)
    params.set('fecha', nextRef)
    router.push(`/admin/calendario?${params.toString()}`)
  }

  function nav(direction: 1 | -1) {
    const ref = new Date(refFecha + 'T00:00:00')
    if (vista === 'dia') ref.setDate(ref.getDate() + direction)
    else if (vista === 'semana') ref.setDate(ref.getDate() + 7 * direction)
    else ref.setMonth(ref.getMonth() + direction)
    goTo(toLocalISODate(ref))
  }

  return (
    <div>
      {/* Header con selector vista + navegación */}
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin" className="hover:text-stone-900">Admin</Link>
            <span>›</span>
            <span className="text-stone-900">Calendario</span>
          </div>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-stone-900">Calendario</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Qué pasa cada día: asignaciones, ausencias, festivos, tareas y fichajes
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector vista + Hoy quitados (feedback David sesión 22/05): vista
              semana ya muestra Día + Semana + Mes + Año apilados verticalmente.
              Flechas navegación movidas a headers de cada sección. */}

          {/* Botón Asignaciones (feedback David sesión 22/05: en lugar de
              "Cuadrante" se llama Asignaciones. Gantt pendiente desarrollo
              futuro — ocultado por ahora). */}
          <Link
            href="/admin/calendario/cuadrante"
            className="rounded border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs uppercase tracking-widest text-emerald-800 font-semibold hover:bg-emerald-100"
          >
            📋 Asignaciones
          </Link>
        </div>
      </div>

      {/* Capas toggleables */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-stone-400">Mostrar:</span>
        {(Object.keys(layers) as Array<keyof typeof layers>).map((k) => (
          <button
            key={k}
            onClick={() => setLayers((p) => ({ ...p, [k]: !p[k] }))}
            className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border transition-colors ${
              layers[k]
                ? 'bg-stone-900 text-white border-stone-900'
                : 'bg-white text-stone-400 border-stone-300'
            }`}
          >
            {EVENT_ICONS[k]} {EVENT_LABELS[k]}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-500">
          {vista === 'dia' ? fmtDateLong(desde) : `${fmtDateShort(desde)} → ${fmtDateShort(hasta)}`}
        </span>
      </div>

      {/* Leyenda de colores */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-600">
        <span className="text-stone-400 uppercase tracking-widest">Colores:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300" /> Límite impuestos</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-300" /> Inicio plazo impuestos</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-stone-300 border border-stone-400" /> Festivo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300" /> Asignación trabajador</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-200 border border-violet-300" /> Tareas/reuniones socios</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-pink-500" /> Ausencia</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500" /> Tarea de obra</span>
      </div>

      {/* Vista */}
      {vista === 'dia' && (
        <ViewDia
          day={refFecha}
          events={eventsByDay[refFecha] ?? []}
          employees={employees}
          fiscalStart={fiscalByStart[refFecha] ?? []}
          fiscalLimit={fiscalByLimit[refFecha] ?? []}
        />
      )}

      {vista === 'semana' && (() => {
        // Feedback David sesión 21/05 noche: vista semana muestra 3 secciones
        // apiladas: Día (refFecha) arriba + Semana + Mes completo debajo.
        // Backend carga rango mes completo (lunes-domingo extendido).
        const refDate = new Date(refFecha + 'T00:00:00')
        const dRef = refDate.getDay()
        const offsetMon = dRef === 0 ? -6 : 1 - dRef
        const weekStart = new Date(refDate)
        weekStart.setDate(refDate.getDate() + offsetMon)
        const weekDays: string[] = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart)
          d.setDate(weekStart.getDate() + i)
          weekDays.push(toLocalISODate(d))
        }
        // Navegación delta por sección (feedback David sesión 22/05)
        const shiftDay = (delta: number) => {
          const r = new Date(refFecha + 'T00:00:00')
          r.setDate(r.getDate() + delta)
          goTo(toLocalISODate(r), 'semana')
        }
        const shiftWeek = (delta: number) => {
          const r = new Date(refFecha + 'T00:00:00')
          r.setDate(r.getDate() + 7 * delta)
          goTo(toLocalISODate(r), 'semana')
        }
        const shiftMonth = (delta: number) => {
          const r = new Date(refFecha + 'T00:00:00')
          r.setMonth(r.getMonth() + delta)
          goTo(toLocalISODate(r), 'semana')
        }
        const shiftYear = (delta: number) => {
          const r = new Date(refFecha + 'T00:00:00')
          r.setFullYear(r.getFullYear() + delta)
          goTo(toLocalISODate(r), 'semana')
        }
        const navArrows = (onPrev: () => void, onNext: () => void) => (
          <div className="inline-flex rounded border border-stone-300 overflow-hidden ml-2">
            <button onClick={onPrev} className="px-2 py-0.5 text-xs hover:bg-stone-50">‹</button>
            <button onClick={onNext} className="px-2 py-0.5 text-xs hover:bg-stone-50">›</button>
          </div>
        )
        return (
          <>
            {/* Cuadrante NO embebido — vive en /admin/calendario/cuadrante
                como página separada (sidebar drill-down). Calendario general
                muestra trabajadores + admin propio (reuniones, compras, tareas).
                Decisión David sesión 22/05 noche tras reflexión. */}
            {/* Día (refFecha) arriba */}
            <div>
              <div className="flex items-center mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Día · {fmtDateLong(refFecha)}
                </p>
                {navArrows(() => shiftDay(-1), () => shiftDay(1))}
              </div>
              <ViewDia
                day={refFecha}
                events={eventsByDay[refFecha] ?? []}
                employees={employees}
                fiscalStart={fiscalByStart[refFecha] ?? []}
                fiscalLimit={fiscalByLimit[refFecha] ?? []}
              />
            </div>
            {/* Semana */}
            <div className="mt-8">
              <div className="flex items-center mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Semana · {fmtDateShort(weekDays[0])} → {fmtDateShort(weekDays[6])}
                </p>
                {navArrows(() => shiftWeek(-1), () => shiftWeek(1))}
              </div>
              <ViewSemana
                days={weekDays}
                employees={employees}
                matrix={employeeDayMatrix}
                eventsByDay={eventsByDay}
                today={todayStr}
                onClickDay={(d) => setDrawerDay(d)}
                projects={projects}
                projLabel={projLabel}
                fiscalByStart={fiscalByStart}
                fiscalByLimit={fiscalByLimit}
              />
            </div>
            {/* Mes completo */}
            <div className="mt-8">
              <div className="flex items-center mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Mes completo · {new Date(refFecha + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </p>
                {navArrows(() => shiftMonth(-1), () => shiftMonth(1))}
              </div>
              <ViewMes
                days={days}
                eventsByDay={eventsByDay}
                refFecha={refFecha}
                today={todayStr}
                onClickDay={(d) => setDrawerDay(d)}
                projLabel={projLabel}
                fiscalByStart={fiscalByStart}
                fiscalByLimit={fiscalByLimit}
              />
            </div>
            {/* Año completo (12 mini-meses navegación) */}
            <div className="mt-8">
              <div className="flex items-center mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  Año completo · {new Date(refFecha + 'T00:00:00').getFullYear()}
                </p>
                {navArrows(() => shiftYear(-1), () => shiftYear(1))}
              </div>
              <ViewAno
                refFecha={refFecha}
                today={todayStr}
                onClickDay={(d) => goTo(d, 'semana')}
                yearHolidays={yearHolidays}
                yearFlagsByDay={yearFlagsByDay}
                fiscalByStart={fiscalByStart}
                fiscalByLimit={fiscalByLimit}
              />
            </div>
          </>
        )
      })()}

      {vista === 'mes' && (
        <ViewMes
          days={days}
          eventsByDay={eventsByDay}
          refFecha={refFecha}
          today={todayStr}
          onClickDay={(d) => setDrawerDay(d)}
          projLabel={projLabel}
          fiscalByStart={fiscalByStart}
          fiscalByLimit={fiscalByLimit}
        />
      )}

      {/* Drawer lateral con TODO el día + creación batch */}
      {drawerDay && (
        <DrawerDay
          fecha={drawerDay}
          employees={employees}
          socios={socios}
          projects={projects}
          events={eventsByDay[drawerDay] ?? []}
          onClose={() => setDrawerDay(null)}
        />
      )}
    </div>
  )
}

/* ───────── Vista Día ───────── */

function ViewDia({
  day, events, employees, fiscalStart = [], fiscalLimit = [],
}: {
  day: string
  events: CalendarEvent[]
  employees: Employee[]
  fiscalStart?: FiscalEntry[]
  fiscalLimit?: FiscalEntry[]
}) {
  void employees
  const grouped = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {}
    for (const e of events) {
      const key = e.project_id ?? '__no_project__'
      ;(m[key] ??= []).push(e)
    }
    return m
  }, [events])

  const hasContent = events.length > 0 || fiscalStart.length > 0 || fiscalLimit.length > 0

  if (!hasContent) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Nada planificado para el {fmtDateLong(day)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Fiscal: fecha límite (rojo) */}
      {fiscalLimit.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50">
          <div className="px-4 py-2 border-b border-red-200 bg-red-100/60 text-red-900 font-medium text-sm">
            🛑 Fecha LÍMITE presentación AEAT
          </div>
          <ul className="divide-y divide-red-200">
            {fiscalLimit.map((f) => (
              <li key={`${f.modelo}-${f.ejercicio}-${f.periodo}`} className="px-4 py-2 text-sm text-red-900">
                <div className="font-medium">{f.nombre}</div>
                {f.descripcion && <div className="text-xs text-red-800/80 mt-0.5">{f.descripcion}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Fiscal: inicio plazo (amarillo) */}
      {fiscalStart.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50">
          <div className="px-4 py-2 border-b border-amber-200 bg-amber-100/60 text-amber-900 font-medium text-sm">
            🟡 Inicio plazo presentación AEAT
          </div>
          <ul className="divide-y divide-amber-200">
            {fiscalStart.map((f) => (
              <li key={`${f.modelo}-${f.ejercicio}-${f.periodo}-s`} className="px-4 py-2 text-sm text-amber-900">
                <div className="font-medium">{f.nombre}</div>
                {f.descripcion && <div className="text-xs text-amber-800/80 mt-0.5">{f.descripcion}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Object.entries(grouped).map(([projId, evs]) => {
        const proj = evs.find((e) => e.project_id)
        const label = proj
          ? `${proj.project_code} — ${proj.project_name ?? ''}`
          : 'Sin proyecto (festivos / ausencias generales)'
        return (
          <div key={projId} className="rounded-lg border border-stone-200 bg-white">
            <div className="px-4 py-2 border-b border-stone-100 bg-stone-50/60 font-medium">{label}</div>
            <div className="divide-y divide-stone-100">
              {evs.map((e, i) => (
                <EventRow key={`${e.event_type}-${e.ref_id}-${i}`} event={e} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ───────── Vista Semana ───────── */

function ViewSemana({
  days, employees, matrix, eventsByDay, today, onClickDay, projects, projLabel,
  fiscalByStart = {}, fiscalByLimit = {},
}: {
  days: string[]
  employees: Employee[]
  matrix: Record<string, Record<string, CalendarEvent[]>>
  eventsByDay: Record<string, CalendarEvent[]>
  today: string
  onClickDay: (d: string) => void
  projects: Project[]
  projLabel: (id: string | null | undefined, fallbackCode?: string | null) => string
  fiscalByStart?: Record<string, FiscalEntry[]>
  fiscalByLimit?: Record<string, FiscalEntry[]>
}) {
  void projects
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-stone-500 bg-stone-50 border-b border-stone-200">
              Trabajador
            </th>
            {days.map((d) => {
              const isToday = d === today
              const dow = new Date(d + 'T00:00:00').getDay()
              const dayName = DAY_NAMES[dow === 0 ? 6 : dow - 1]
              const hasHoliday = (eventsByDay[d] ?? []).some((e) => e.event_type === 'holiday')
              const fiscalLim = (fiscalByLimit[d]?.length ?? 0) > 0
              const fiscalIni = (fiscalByStart[d]?.length ?? 0) > 0
              const bg = fiscalLim
                ? 'bg-red-100 text-red-900'
                : fiscalIni
                ? 'bg-amber-100 text-amber-900'
                : isToday
                ? 'bg-emerald-50 text-emerald-900'
                : hasHoliday
                ? 'bg-stone-200 text-stone-700'
                : 'bg-stone-50 text-stone-600'
              return (
                <th
                  key={d}
                  onClick={() => onClickDay(d)}
                  className={`px-2 py-2 text-center text-[10px] uppercase tracking-widest border-b border-stone-200 cursor-pointer hover:bg-stone-100 ${bg}`}
                >
                  <div>{dayName}</div>
                  <div className="font-mono">{fmtDateShort(d)}</div>
                </th>
              )
            })}
          </tr>
          {/* Fila resumen del día (festivos, tareas, fiscal). */}
          <tr>
            <th className="px-3 py-1.5 text-left text-[10px] text-stone-400 bg-stone-50/50 border-b border-stone-100">
              Día (festivos, fiscal, tareas)
            </th>
            {days.map((d) => {
              const todayEvents = eventsByDay[d] ?? []
              const holidays = todayEvents.filter((e) => e.event_type === 'holiday')
              const unassignedTasks = todayEvents.filter(
                (e) => e.event_type === 'task' && !e.employee_id,
              )
              const flim = fiscalByLimit[d] ?? []
              const fini = fiscalByStart[d] ?? []
              const socioTasks = todayEvents.filter((e) => e.event_type === 'task' && String(e.payload?.tipo ?? '') === 'interna_socio')
              return (
                <td
                  key={d}
                  onClick={() => onClickDay(d)}
                  className={`px-2 py-1.5 text-center text-[10px] cursor-pointer hover:opacity-80 border-b border-stone-100 align-top ${
                    flim.length > 0 ? 'bg-red-100' : fini.length > 0 ? 'bg-amber-100' : holidays.length > 0 ? 'bg-stone-200' : socioTasks.length > 0 ? 'bg-violet-100' : ''
                  }`}
                >
                  {holidays.map((h, i) => (
                    <div key={i} className="text-stone-700">Festivo {String(h.payload?.nombre ?? '')}</div>
                  ))}
                  {flim.map((f) => (
                    <div key={`l-${f.modelo}-${f.periodo}`} className="text-red-800 font-semibold" title={f.descripcion ?? ''}>
                      🛑 {f.modelo} {f.periodo}
                    </div>
                  ))}
                  {fini.map((f) => (
                    <div key={`s-${f.modelo}-${f.periodo}`} className="text-amber-900" title={f.descripcion ?? ''}>
                      🟡 {f.modelo} {f.periodo}
                    </div>
                  ))}
                  {unassignedTasks.length > 0 && (
                    <div className="text-stone-500">📋 {unassignedTasks.length} sin asignar</div>
                  )}
                </td>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {employees.map((emp) => (
            <tr key={emp.id}>
              <th className="px-3 py-2 text-left text-xs font-medium text-stone-700 bg-stone-50/30 sticky left-0">
                {(emp.nombre ?? '').trim() || '—'}
              </th>
              {days.map((d) => {
                const cellEvents = matrix[emp.id]?.[d] ?? []
                const isToday = d === today
                return (
                  <td
                    key={d}
                    onClick={() => onClickDay(d)}
                    className={`px-2 py-1.5 align-top cursor-pointer hover:bg-stone-50 ${
                      isToday ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    <CellContent events={cellEvents} projLabel={projLabel} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CellContent({
  events, projLabel,
}: {
  events: CalendarEvent[]
  projLabel: (id: string | null | undefined, fallbackCode?: string | null) => string
}) {
  if (events.length === 0) return <span className="text-[10px] text-stone-300">—</span>

  const assignment = events.find((e) => e.event_type === 'assignment')
  const timeRec = events.find((e) => e.event_type === 'time_record')
  const absence = events.find((e) => e.event_type === 'absence')
  const tasks = events.filter((e) => e.event_type === 'task')

  return (
    <div className="space-y-0.5">
      {absence && (
        <div className="text-[10px] text-amber-700 truncate">
          🏖️ {String(absence.payload?.tipo ?? 'ausencia')}
        </div>
      )}
      {assignment && (
        <div className="text-[10px] truncate" title={projLabel(assignment.project_id, assignment.project_code)}>
          👷 {projLabel(assignment.project_id, assignment.project_code)}
        </div>
      )}
      {timeRec && (
        <div className="text-[10px] text-stone-500">
          ⏱️ {String(timeRec.payload?.horas_ordinarias ?? '')}h
          {timeRec.payload?.horas_extra && Number(timeRec.payload.horas_extra) > 0
            ? ` +${timeRec.payload.horas_extra}`
            : ''}
        </div>
      )}
      {tasks.map((t, i) => {
        const subtipo = String(t.payload?.subtipo ?? 'tarea')
        const esSocio = String(t.payload?.tipo ?? '') === 'interna_socio'
        const hIni = t.payload?.hora_inicio ? String(t.payload.hora_inicio).slice(0, 5) : null
        return (
          <div
            key={i}
            className={`text-[10px] truncate ${esSocio ? 'bg-violet-100 text-violet-800 rounded px-1' : subtipo === 'reunion' ? 'text-violet-700' : 'text-blue-600'}`}
            title={String(t.payload?.texto ?? '')}
          >
            {subtipo === 'reunion' ? '🤝' : '📋'} {hIni && <span className="font-mono">{hIni} </span>}{String(t.payload?.texto ?? '')}
          </div>
        )
      })}
    </div>
  )
}

/* ───────── Vista Mes ───────── */

function ViewMes({
  days, eventsByDay, refFecha, today, onClickDay, projLabel,
  fiscalByStart = {}, fiscalByLimit = {},
}: {
  days: string[]
  eventsByDay: Record<string, CalendarEvent[]>
  refFecha: string
  today: string
  onClickDay: (d: string) => void
  projLabel: (id: string | null | undefined, fallbackCode?: string | null) => string
  fiscalByStart?: Record<string, FiscalEntry[]>
  fiscalByLimit?: Record<string, FiscalEntry[]>
}) {
  const refMonth = new Date(refFecha + 'T00:00:00').getMonth()

  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <div className="grid grid-cols-7">
        {DAY_NAMES.map((n) => (
          <div key={n} className="px-2 py-1.5 text-center text-[10px] uppercase tracking-widest text-stone-500 bg-stone-50 border-b border-stone-200">
            {n}
          </div>
        ))}
        {days.map((d) => {
          const date = new Date(d + 'T00:00:00')
          const isToday = d === today
          const isOtherMonth = date.getMonth() !== refMonth
          const dayEvents = eventsByDay[d] ?? []
          const taskEvents = dayEvents.filter((e) => e.event_type === 'task')
          const socioEvents = taskEvents.filter((e) => String(e.payload?.tipo ?? '') === 'interna_socio')
          const noSocio = taskEvents.filter((e) => String(e.payload?.tipo ?? '') !== 'interna_socio')
          const byType = {
            assignment: dayEvents.filter((e) => e.event_type === 'assignment').length,
            absence: dayEvents.filter((e) => e.event_type === 'absence').length,
            task: noSocio.filter((e) => String(e.payload?.subtipo ?? 'tarea') !== 'reunion').length,
            reunion: noSocio.filter((e) => String(e.payload?.subtipo ?? 'tarea') === 'reunion').length,
            socio: socioEvents.length,
            holiday: dayEvents.filter((e) => e.event_type === 'holiday').length,
          }
          const flim = fiscalByLimit[d] ?? []
          const fini = fiscalByStart[d] ?? []
          // Proyectos únicos del día (dirección, no código)
          const projectsToday = new Set<string>()
          for (const e of dayEvents) {
            if (e.project_id) projectsToday.add(projLabel(e.project_id, e.project_code))
          }
          // Prioridad fondo: fiscal límite > fiscal inicio > festivo > socio > hoy
          const cellBg = isOtherMonth
            ? 'bg-stone-50/30 text-stone-300'
            : flim.length > 0
            ? 'bg-red-100'
            : fini.length > 0
            ? 'bg-amber-100'
            : byType.holiday > 0
            ? 'bg-stone-200'
            : byType.socio > 0
            ? 'bg-violet-100'
            : isToday
            ? 'bg-emerald-50'
            : ''
          return (
            <div
              key={d}
              onClick={() => onClickDay(d)}
              className={`min-h-[90px] px-2 py-1.5 border-b border-r border-stone-100 cursor-pointer hover:opacity-90 ${cellBg}`}
            >
              <div className={`text-xs font-mono ${isToday ? 'text-emerald-900 font-bold' : ''}`}>
                {date.getDate()}
              </div>
              {byType.holiday > 0 && (
                <div className="mt-0.5 text-[10px] text-stone-700 truncate">Festivo</div>
              )}
              {flim.map((f) => (
                <div key={`l-${f.modelo}-${f.periodo}`} className="mt-0.5 text-[10px] text-red-800 font-semibold truncate" title={f.descripcion ?? ''}>
                  🛑 {f.modelo} {f.periodo}
                </div>
              ))}
              {fini.map((f) => (
                <div key={`s-${f.modelo}-${f.periodo}`} className="mt-0.5 text-[10px] text-amber-900 truncate" title={f.descripcion ?? ''}>
                  🟡 {f.modelo} {f.periodo}
                </div>
              ))}
              {projectsToday.size > 0 && (
                <div className="mt-0.5 text-[10px] text-stone-600 truncate" title={Array.from(projectsToday).join(', ')}>
                  👷 {Array.from(projectsToday).slice(0, 2).join(', ')}
                  {projectsToday.size > 2 && ` +${projectsToday.size - 2}`}
                </div>
              )}
              {byType.absence > 0 && (
                <div className="mt-0.5 text-[10px] text-amber-700">🏖️ {byType.absence}</div>
              )}
              {byType.socio > 0 && (
                <div className="mt-0.5 text-[10px] text-violet-800 bg-violet-100 rounded px-1 inline-block">👥 {byType.socio} socios</div>
              )}
              {byType.reunion > 0 && (
                <div className="mt-0.5 text-[10px] text-violet-700">🤝 {byType.reunion} reunión{byType.reunion === 1 ? '' : 'es'}</div>
              )}
              {byType.task > 0 && (
                <div className="mt-0.5 text-[10px] text-blue-600">📋 {byType.task}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────── Vista Año (12 mini-meses navegación) ─────────
   Feedback David sesión 21/05 noche: "debajo ya el año para rematar".
   12 mini-calendarios grid 3×4 (responsive 2×6 móvil). Solo navegación
   visual: click día/mes → goTo refFecha (refetch backend con nueva fecha
   activa). No carga eventos año completo (sería costoso); mes activo
   conserva sus eventos por dots/highlight. */

function ViewAno({
  refFecha, today, onClickDay, yearHolidays, yearFlagsByDay = {},
  fiscalByStart = {}, fiscalByLimit = {},
}: {
  refFecha: string
  today: string
  onClickDay: (d: string) => void
  yearHolidays: string[]
  yearFlagsByDay?: Record<string, { assignment: boolean; task: boolean; reunion: boolean; socio: boolean; absence: boolean }>
  fiscalByStart?: Record<string, FiscalEntry[]>
  fiscalByLimit?: Record<string, FiscalEntry[]>
}) {
  const holidaySet = useMemo(() => new Set(yearHolidays), [yearHolidays])
  const refDate = new Date(refFecha + 'T00:00:00')
  const year = refDate.getFullYear()
  const refMonth = refDate.getMonth()

  const monthLabels = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const dayHeaders = ['L','M','X','J','V','S','D']

  // Fix timezone bug sesión 22/05: toISOString() convierte a UTC, en Madrid
  // (UTC+1/+2) días local 00:00 → UTC día anterior 23:00 → slice(0,10)
  // devolvía fecha errónea. Usar formato local YYYY-MM-DD manual.
  function toLocalISODate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function buildMonthDays(year: number, month: number): Array<{ d: string; otherMonth: boolean }> {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const dStart = first.getDay()
    const offsetStart = dStart === 0 ? -6 : 1 - dStart
    const start = new Date(first)
    start.setDate(first.getDate() + offsetStart)
    const dEnd = last.getDay()
    const offsetEnd = dEnd === 0 ? 0 : 7 - dEnd
    const end = new Date(last)
    end.setDate(last.getDate() + offsetEnd)

    const out: Array<{ d: string; otherMonth: boolean }> = []
    const cursor = new Date(start)
    while (cursor <= end) {
      out.push({
        d: toLocalISODate(cursor),
        otherMonth: cursor.getMonth() !== month,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, m) => {
        const monthDays = buildMonthDays(year, m)
        const isActiveMonth = m === refMonth
        return (
          <div
            key={m}
            className={`rounded-lg border bg-white overflow-hidden ${
              isActiveMonth ? 'border-emerald-300' : 'border-stone-200'
            }`}
          >
            <div className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b ${
              isActiveMonth ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-stone-50 text-stone-600 border-stone-200'
            }`}>
              {monthLabels[m]} {year}
            </div>
            <div className="grid grid-cols-7 text-[9px]">
              {dayHeaders.map((h) => (
                <div key={h} className="px-1 py-0.5 text-center text-stone-400">
                  {h}
                </div>
              ))}
              {monthDays.map((day, i) => {
                // Días de meses vecinos: celda vacía (no número gris). Así todos
                // los números visibles son negros y del mes correcto.
                if (day.otherMonth) {
                  return <div key={i} className="px-1 py-0.5" />
                }
                const isToday = day.d === today
                const isHoliday = holidaySet.has(day.d)
                const fLim = (fiscalByLimit[day.d]?.length ?? 0) > 0
                const fIni = (fiscalByStart[day.d]?.length ?? 0) > 0
                const flags = yearFlagsByDay[day.d]
                const tooltip = day.d
                  + (isHoliday ? ' · Festivo' : '')
                  + (fLim ? ` · LÍMITE: ${(fiscalByLimit[day.d] ?? []).map((f) => `${f.modelo} ${f.periodo}`).join(', ')}` : '')
                  + (fIni ? ` · Inicio plazo: ${(fiscalByStart[day.d] ?? []).map((f) => `${f.modelo} ${f.periodo}`).join(', ')}` : '')
                  + (flags?.socio ? ' · Tarea socios' : '')
                  + (flags?.reunion ? ' · Reunión' : '')
                  + (flags?.task ? ' · Tarea' : '')
                  + (flags?.assignment ? ' · Asignación' : '')
                  + (flags?.absence ? ' · Ausencia' : '')
                // Prioridad fondo: fiscal límite > inicio > festivo > socio > hoy
                const cls = fLim ? 'bg-red-100 text-red-900 font-semibold'
                  : fIni ? 'bg-amber-100 text-amber-900 font-semibold'
                  : isHoliday ? 'bg-stone-200 text-stone-700 font-semibold'
                  : flags?.socio ? 'bg-violet-100 text-violet-900 font-semibold'
                  : isToday ? 'bg-emerald-200 text-emerald-900 font-bold'
                  : 'text-stone-700'
                return (
                  <button
                    key={i}
                    onClick={() => onClickDay(day.d)}
                    className={`relative px-1 py-0.5 text-center font-mono transition-colors hover:bg-emerald-100 ${cls}`}
                    title={tooltip}
                  >
                    {new Date(day.d + 'T00:00:00').getDate()}
                    {flags && (flags.assignment || flags.task || flags.reunion || flags.absence) && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {flags.reunion && <span className="w-1 h-1 rounded-full bg-violet-600" />}
                        {flags.task && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                        {flags.assignment && <span className="w-1 h-1 rounded-full bg-emerald-600" />}
                        {flags.absence && <span className="w-1 h-1 rounded-full bg-pink-500" />}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ───────── Drawer lateral ───────── */

function DrawerDay({
  fecha, events, employees, socios, projects, onClose,
}: {
  fecha: string
  events: CalendarEvent[]
  employees: Employee[]
  socios: Socio[]
  projects: Project[]
  onClose: () => void
}) {
  // ─── Multi-row state ───
  type AsigRow = { id: string; employee_id: string; project_id: string; observaciones: string }
  type TareaRow = {
    id: string
    project_id: string
    texto: string
    prioridad: string
    subtipo: 'tarea' | 'reunion'
    hora_inicio: string
    hora_fin: string
    socio_user_ids: string[]
    employee_ids: string[]
  }
  type AusenciaRow = { id: string; employee_id: string; tipo: string; fecha_fin: string; motivo_detalle: string }
  type FestivoRow = { id: string; nombre: string }

  const [asigRows, setAsigRows] = useState<AsigRow[]>([])
  const [tareaRows, setTareaRows] = useState<TareaRow[]>([])
  const [ausenciaRows, setAusenciaRows] = useState<AusenciaRow[]>([])
  const [festivoRows, setFestivoRows] = useState<FestivoRow[]>([])
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<'asig' | 'tarea' | 'ausencia' | 'festivo' | null>(null)
  const router = useRouter()

  const newId = () => Math.random().toString(36).slice(2)
  const addAsig = () => setAsigRows((p) => [...p, { id: newId(), employee_id: '', project_id: '', observaciones: '' }])
  const addTarea = () => setTareaRows((p) => [...p, { id: newId(), project_id: '', texto: '', prioridad: 'media', subtipo: 'tarea', hora_inicio: '', hora_fin: '', socio_user_ids: [], employee_ids: [] }])
  const addAusencia = () => setAusenciaRows((p) => [...p, { id: newId(), employee_id: '', tipo: 'vacaciones', fecha_fin: fecha, motivo_detalle: '' }])
  const addFestivo = () => setFestivoRows((p) => [...p, { id: newId(), nombre: '' }])

  // Toggle attendee (socio o trabajador) en una fila de tarea
  const toggleArr = (arr: string[], id: string): string[] =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]

  async function saveAll() {
    const payload = {
      fecha,
      asignaciones: asigRows.filter((r) => r.employee_id),
      tareas: tareaRows.filter((r) => r.texto.trim()).map((r) => ({
        project_id: r.project_id || null,
        texto: r.texto,
        prioridad: r.prioridad,
        subtipo: r.subtipo,
        hora_inicio: r.hora_inicio || null,
        hora_fin: r.hora_fin || null,
        socio_user_ids: r.socio_user_ids,
        employee_ids: r.employee_ids,
      })),
      ausencias: ausenciaRows.filter((r) => r.employee_id && r.tipo),
      festivos: festivoRows.filter((r) => r.nombre.trim()),
    }
    const total = payload.asignaciones.length + payload.tareas.length + payload.ausencias.length + payload.festivos.length
    if (total === 0) {
      setSaveMessage('No hay nada que crear. Añade al menos un ítem.')
      return
    }
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/admin/calendario/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        const errs = Object.entries(json.results ?? {}).flatMap(([k, v]) => (v as { errors: string[] }).errors.map((e) => `${k}: ${e}`)).join(' · ')
        setSaveMessage(`Error: ${errs || json.error || 'desconocido'}`)
        setSaving(false)
        return
      }
      setSaveMessage(`✓ ${json.total_created} ítems creados`)
      setAsigRows([]); setTareaRows([]); setAusenciaRows([]); setFestivoRows([])
      setOpenSection(null)
      router.refresh()
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Network error'
      setSaveMessage(`Error: ${m}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('¿Borrar esta tarea/reunión?')) return
    try {
      const res = await fetch(`/api/admin/calendario/task/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        setSaveMessage(`Error borrando: ${json.error ?? res.status}`)
        return
      }
      router.refresh()
    } catch {
      setSaveMessage('Error de red al borrar')
    }
  }

  // Agrupar por proyecto, ausencias y festivos aparte
  const groups = useMemo(() => {
    const byProject: Record<string, CalendarEvent[]> = {}
    const ausencias: CalendarEvent[] = []
    const festivos: CalendarEvent[] = []
    const tareasSinProyecto: CalendarEvent[] = []
    for (const e of events) {
      if (e.event_type === 'absence') ausencias.push(e)
      else if (e.event_type === 'holiday') festivos.push(e)
      else if (e.project_id) (byProject[e.project_id] ??= []).push(e)
      else if (e.event_type === 'task') tareasSinProyecto.push(e)
    }
    return { byProject, ausencias, festivos, tareasSinProyecto }
  }, [events])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-stone-400">Día</div>
            <h2 className="text-base font-medium">{fmtDateLong(fecha)}</h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* ─── CREACIÓN BATCH (feedback David sesión 21/05 noche) ─── */}
          <div className="border border-stone-200 rounded">
            <div className="bg-stone-50 px-3 py-2 border-b border-stone-200 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-700">
                ➕ Añadir al día
              </p>
              <button
                onClick={saveAll}
                disabled={saving || (asigRows.length + tareaRows.length + ausenciaRows.length + festivoRows.length === 0)}
                className="text-[10px] uppercase tracking-widest px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando…' : 'Guardar todo'}
              </button>
            </div>

            {saveMessage && (
              <div className={`px-3 py-2 text-[11px] ${saveMessage.startsWith('✓') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                {saveMessage}
              </div>
            )}

            {/* Asignaciones */}
            <div className="border-b border-stone-100">
              <button
                onClick={() => setOpenSection(openSection === 'asig' ? null : 'asig')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-stone-50 flex items-center justify-between"
              >
                <span>👷 Asignaciones {asigRows.length > 0 && <span className="text-emerald-600 font-semibold">({asigRows.length})</span>}</span>
                <span className="text-stone-400">{openSection === 'asig' ? '−' : '+'}</span>
              </button>
              {openSection === 'asig' && (
                <div className="px-3 pb-3 space-y-2">
                  {asigRows.map((r, idx) => (
                    <div key={r.id} className="grid grid-cols-12 gap-1 items-center">
                      <select value={r.employee_id} onChange={(e) => setAsigRows((p) => p.map((x, i) => i === idx ? { ...x, employee_id: e.target.value } : x))} className="col-span-5 text-xs border border-stone-300 rounded px-1 py-1">
                        <option value="">— Trabajador —</option>
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                      </select>
                      <select value={r.project_id} onChange={(e) => setAsigRows((p) => p.map((x, i) => i === idx ? { ...x, project_id: e.target.value } : x))} className="col-span-5 text-xs border border-stone-300 rounded px-1 py-1">
                        <option value="">— Proyecto —</option>
                        {projects.map((pj) => <option key={pj.id} value={pj.id}>{pj.address || pj.name || pj.code}</option>)}
                      </select>
                      <button onClick={() => setAsigRows((p) => p.filter((_, i) => i !== idx))} className="col-span-2 text-xs text-red-500 hover:text-red-700">×</button>
                    </div>
                  ))}
                  <button onClick={addAsig} className="text-[10px] uppercase tracking-widest text-emerald-700 hover:text-emerald-900">
                    + Añadir asignación
                  </button>
                </div>
              )}
            </div>

            {/* Tareas / Reuniones */}
            <div className="border-b border-stone-100">
              <button
                onClick={() => setOpenSection(openSection === 'tarea' ? null : 'tarea')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-stone-50 flex items-center justify-between"
              >
                <span>📋 Tareas / Reuniones {tareaRows.length > 0 && <span className="text-emerald-600 font-semibold">({tareaRows.length})</span>}</span>
                <span className="text-stone-400">{openSection === 'tarea' ? '−' : '+'}</span>
              </button>
              {openSection === 'tarea' && (
                <div className="px-3 pb-3 space-y-3">
                  {tareaRows.map((r, idx) => {
                    const upd = (patch: Partial<TareaRow>) =>
                      setTareaRows((p) => p.map((x, i) => i === idx ? { ...x, ...patch } : x))
                    return (
                      <div key={r.id} className="border border-stone-200 rounded p-2 space-y-2">
                        {/* Tipo + borrar */}
                        <div className="flex items-center justify-between">
                          <div className="inline-flex rounded border border-stone-300 overflow-hidden text-[10px]">
                            <button
                              onClick={() => upd({ subtipo: 'tarea' })}
                              className={`px-2 py-1 ${r.subtipo === 'tarea' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600'}`}
                            >📋 Tarea</button>
                            <button
                              onClick={() => upd({ subtipo: 'reunion' })}
                              className={`px-2 py-1 border-l border-stone-300 ${r.subtipo === 'reunion' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600'}`}
                            >🤝 Reunión</button>
                          </div>
                          <button onClick={() => setTareaRows((p) => p.filter((_, i) => i !== idx))} className="text-sm text-red-500 hover:text-red-700">×</button>
                        </div>

                        {/* Texto */}
                        <input
                          type="text"
                          placeholder={r.subtipo === 'reunion' ? 'Asunto reunión (ej. firma notario)' : 'Texto tarea'}
                          value={r.texto}
                          onChange={(e) => upd({ texto: e.target.value })}
                          className="w-full text-xs border border-stone-300 rounded px-2 py-1"
                        />

                        {/* Hora inicio / fin + proyecto + prioridad */}
                        <div className="grid grid-cols-2 gap-1">
                          <label className="text-[10px] text-stone-500">Hora inicio
                            <input type="time" value={r.hora_inicio} onChange={(e) => upd({ hora_inicio: e.target.value })} className="w-full text-xs border border-stone-300 rounded px-1 py-1" />
                          </label>
                          <label className="text-[10px] text-stone-500">Hora fin
                            <input type="time" value={r.hora_fin} onChange={(e) => upd({ hora_fin: e.target.value })} className="w-full text-xs border border-stone-300 rounded px-1 py-1" />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <select value={r.project_id} onChange={(e) => upd({ project_id: e.target.value })} className="text-xs border border-stone-300 rounded px-1 py-1">
                            <option value="">— Sin proyecto —</option>
                            {projects.map((pj) => <option key={pj.id} value={pj.id}>{pj.address || pj.name || pj.code}</option>)}
                          </select>
                          <select value={r.prioridad} onChange={(e) => upd({ prioridad: e.target.value })} className="text-xs border border-stone-300 rounded px-1 py-1">
                            <option value="baja">Baja</option>
                            <option value="media">Media</option>
                            <option value="alta">Alta</option>
                            <option value="critica">Crítica</option>
                          </select>
                        </div>

                        {/* Socios (multi) */}
                        {socios.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Socios</p>
                            <div className="flex flex-wrap gap-1">
                              {socios.map((s) => {
                                const on = r.socio_user_ids.includes(s.user_id)
                                return (
                                  <button
                                    key={s.user_id}
                                    onClick={() => upd({ socio_user_ids: toggleArr(r.socio_user_ids, s.user_id) })}
                                    className={`text-[10px] px-2 py-1 rounded border ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-stone-600 border-stone-300'}`}
                                  >{on ? '✓ ' : ''}{s.nombre}</button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Trabajadores (multi) */}
                        {employees.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Trabajadores</p>
                            <div className="flex flex-wrap gap-1">
                              {employees.map((emp) => {
                                const on = r.employee_ids.includes(emp.id)
                                return (
                                  <button
                                    key={emp.id}
                                    onClick={() => upd({ employee_ids: toggleArr(r.employee_ids, emp.id) })}
                                    className={`text-[10px] px-2 py-1 rounded border ${on ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-stone-600 border-stone-300'}`}
                                  >{on ? '✓ ' : ''}{emp.nombre}</button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <button onClick={addTarea} className="text-[10px] uppercase tracking-widest text-emerald-700 hover:text-emerald-900">
                    + Añadir tarea / reunión
                  </button>
                </div>
              )}
            </div>

            {/* Ausencias */}
            <div className="border-b border-stone-100">
              <button
                onClick={() => setOpenSection(openSection === 'ausencia' ? null : 'ausencia')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-stone-50 flex items-center justify-between"
              >
                <span>🏖️ Ausencias {ausenciaRows.length > 0 && <span className="text-emerald-600 font-semibold">({ausenciaRows.length})</span>}</span>
                <span className="text-stone-400">{openSection === 'ausencia' ? '−' : '+'}</span>
              </button>
              {openSection === 'ausencia' && (
                <div className="px-3 pb-3 space-y-2">
                  {ausenciaRows.map((r, idx) => (
                    <div key={r.id} className="grid grid-cols-12 gap-1 items-center">
                      <select value={r.employee_id} onChange={(e) => setAusenciaRows((p) => p.map((x, i) => i === idx ? { ...x, employee_id: e.target.value } : x))} className="col-span-4 text-xs border border-stone-300 rounded px-1 py-1">
                        <option value="">— Trab —</option>
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                      </select>
                      <select value={r.tipo} onChange={(e) => setAusenciaRows((p) => p.map((x, i) => i === idx ? { ...x, tipo: e.target.value } : x))} className="col-span-4 text-xs border border-stone-300 rounded px-1 py-1">
                        <option value="vacaciones">Vacaciones</option>
                        <option value="baja_medica">Baja médica</option>
                        <option value="permiso_retribuido">Permiso retribuido</option>
                        <option value="asuntos_propios">Asuntos propios</option>
                        <option value="ausencia_no_justificada">No justificada</option>
                        <option value="banco_horas">Banco horas</option>
                      </select>
                      <input type="date" value={r.fecha_fin} onChange={(e) => setAusenciaRows((p) => p.map((x, i) => i === idx ? { ...x, fecha_fin: e.target.value } : x))} className="col-span-3 text-xs border border-stone-300 rounded px-1 py-1" />
                      <button onClick={() => setAusenciaRows((p) => p.filter((_, i) => i !== idx))} className="col-span-1 text-xs text-red-500 hover:text-red-700">×</button>
                    </div>
                  ))}
                  <button onClick={addAusencia} className="text-[10px] uppercase tracking-widest text-emerald-700 hover:text-emerald-900">
                    + Añadir ausencia
                  </button>
                </div>
              )}
            </div>

            {/* Festivos */}
            <div>
              <button
                onClick={() => setOpenSection(openSection === 'festivo' ? null : 'festivo')}
                className="w-full px-3 py-2 text-left text-xs hover:bg-stone-50 flex items-center justify-between"
              >
                <span>🇪🇸 Festivos custom {festivoRows.length > 0 && <span className="text-emerald-600 font-semibold">({festivoRows.length})</span>}</span>
                <span className="text-stone-400">{openSection === 'festivo' ? '−' : '+'}</span>
              </button>
              {openSection === 'festivo' && (
                <div className="px-3 pb-3 space-y-2">
                  {festivoRows.map((r, idx) => (
                    <div key={r.id} className="grid grid-cols-12 gap-1 items-center">
                      <input type="text" placeholder="Nombre festivo" value={r.nombre} onChange={(e) => setFestivoRows((p) => p.map((x, i) => i === idx ? { ...x, nombre: e.target.value } : x))} className="col-span-11 text-xs border border-stone-300 rounded px-1 py-1" />
                      <button onClick={() => setFestivoRows((p) => p.filter((_, i) => i !== idx))} className="col-span-1 text-xs text-red-500 hover:text-red-700">×</button>
                    </div>
                  ))}
                  <button onClick={addFestivo} className="text-[10px] uppercase tracking-widest text-emerald-700 hover:text-emerald-900">
                    + Añadir festivo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ─── LISTA EXISTENTE EVENTOS ─── */}
          {events.length === 0 && (
            <p className="text-sm text-stone-500">Nada programado este día.</p>
          )}

          {groups.festivos.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">🇪🇸 Festivos</h3>
              <ul className="space-y-1 text-sm">
                {groups.festivos.map((h) => (
                  <li key={h.ref_id} className="text-red-700">
                    {String(h.payload?.nombre ?? 'Festivo')}{' '}
                    <span className="text-[10px] text-stone-400">({String(h.payload?.ambito ?? '')})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.ausencias.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">🏖️ Ausencias</h3>
              <ul className="space-y-1 text-sm">
                {groups.ausencias.map((a) => (
                  <li key={a.ref_id} className="text-amber-700">
                    {a.employee_nombre} — {String(a.payload?.tipo ?? '')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.tareasSinProyecto.length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">📋 Tareas y reuniones</h3>
              <ul className="space-y-1 text-sm">
                {groups.tareasSinProyecto.map((e, i) => (
                  <li key={`${e.ref_id}-${i}`}>
                    <EventRow event={e} compact onDelete={deleteTask} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Object.entries(groups.byProject).map(([projId, evs]) => {
            const ref = evs.find((e) => e.project_code)
            const projObj = projects.find((p) => p.id === projId)
            const projTitle = projObj?.address || ref?.project_name || ref?.project_code || ''
            return (
              <section key={projId}>
                <h3 className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">
                  👷 {projTitle}
                </h3>
                <ul className="space-y-1 text-sm">
                  {evs.map((e, i) => (
                    <li key={`${e.event_type}-${e.ref_id}-${i}`}>
                      <EventRow event={e} compact onDelete={e.event_type === 'task' ? deleteTask : undefined} />
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/admin/proyectos/${ref?.project_code ?? ''}`}
                  className="mt-1 inline-block text-[10px] text-blue-600 hover:underline"
                >
                  Abrir proyecto →
                </Link>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ───────── Event row genérico ───────── */

function EventRow({ event, compact = false, onDelete }: { event: CalendarEvent; compact?: boolean; onDelete?: (id: string) => void }) {
  const icon = EVENT_ICONS[event.event_type]
  if (event.event_type === 'assignment') {
    return (
      <div className={compact ? 'text-xs' : 'px-4 py-2 text-sm'}>
        {icon} {event.employee_nombre}
        {event.payload?.jornada_horas
          ? <span className="text-stone-500"> · {String(event.payload.jornada_horas)}h</span>
          : null}
      </div>
    )
  }
  if (event.event_type === 'time_record') {
    return (
      <div className={compact ? 'text-xs text-stone-700' : 'px-4 py-2 text-sm'}>
        {icon} {event.employee_nombre} ·{' '}
        <span className="font-mono text-xs">
          {String(event.payload?.hora_entrada ?? '—').slice(0, 5)}
          {' → '}
          {String(event.payload?.hora_salida ?? '—').slice(0, 5)}
        </span>
        {' '}({String(event.payload?.horas_ordinarias ?? 0)}h)
      </div>
    )
  }
  if (event.event_type === 'task') {
    const estado = String(event.payload?.estado ?? 'pendiente')
    const subtipo = String(event.payload?.subtipo ?? 'tarea')
    const esSocio = String(event.payload?.tipo ?? '') === 'interna_socio'
    const taskIcon = subtipo === 'reunion' ? '🤝' : '📋'
    const hIni = event.payload?.hora_inicio ? String(event.payload.hora_inicio).slice(0, 5) : null
    const hFin = event.payload?.hora_fin ? String(event.payload.hora_fin).slice(0, 5) : null
    const attendees = Array.isArray(event.payload?.attendees)
      ? (event.payload!.attendees as Array<{ tipo: string; nombre: string; estado: string }>)
      : []
    // Tareas/reuniones internas de socios → fondo morado (feedback David)
    const wrapCls = compact
      ? `text-xs ${esSocio ? 'bg-violet-50 border border-violet-200 rounded px-1.5 py-1' : ''}`
      : `px-4 py-2 text-sm ${esSocio ? 'bg-violet-50' : ''}`
    return (
      <div className={wrapCls}>
        <div className="flex items-start justify-between gap-2">
          <div>
            {taskIcon}{' '}
            {hIni && <span className="font-mono text-xs text-stone-600">{hIni}{hFin ? `–${hFin}` : ''} </span>}
            <span className={estado === 'hecha' ? 'line-through text-stone-400' : ''}>
              {String(event.payload?.texto ?? '')}
            </span>
          </div>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(event.ref_id) }}
              className="flex-none text-sm text-stone-400 hover:text-red-600 leading-none"
              title="Borrar"
            >×</button>
          )}
        </div>
        {attendees.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {attendees.map((a, i) => (
              <span
                key={i}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  a.estado === 'hecho'
                    ? 'bg-emerald-100 text-emerald-800 line-through'
                    : a.tipo === 'socio'
                    ? 'bg-violet-100 text-violet-800'
                    : 'bg-sky-100 text-sky-800'
                }`}
              >
                {a.estado === 'hecho' ? '✓ ' : ''}{a.nombre}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className={compact ? 'text-xs' : 'px-4 py-2 text-sm'}>
      {icon} {event.employee_nombre ?? ''} · {event.event_type}
    </div>
  )
}
