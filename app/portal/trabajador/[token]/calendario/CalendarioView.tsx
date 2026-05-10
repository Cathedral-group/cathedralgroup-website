'use client'

import Link from 'next/link'
import { useMemo } from 'react'

interface Holiday {
  fecha: string
  nombre: string
  ambito: string
}

interface Assignment {
  id: string
  fecha: string
  project_id: string | null
  jornada_esperada_horas: number | null
  notas: string | null
  project?: { code: string; name?: string | null } | { code: string; name?: string | null }[] | null
}

interface Absence {
  id: string
  tipo: string
  motivo_detalle: string | null
  fecha_inicio: string
  fecha_fin: string
  status: string
}

interface Parte {
  id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  observaciones: string | null
  worker_signed_at: string | null
  project?: { code: string; name?: string | null } | { code: string; name?: string | null }[] | null
}

interface JornadaDia {
  fecha: string
  horas: number
}

interface Props {
  token: string
  anio: number
  mes: number
  lastDay: number
  holidays: Holiday[]
  assignments: Assignment[]
  absences: Absence[]
  partes: Parte[]
  jornadas: JornadaDia[]
}

const MES_LABEL = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const DOW_LABEL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const TIPO_AUSENCIA: Record<string, { label: string; cls: string }> = {
  vacaciones: { label: '🏖️ Vac.', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  baja_medica: { label: '🏥 Baja', cls: 'bg-red-100 text-red-800 border-red-200' },
  permiso_retribuido: { label: '📋 Permiso', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  asuntos_propios: { label: '📅 AP', cls: 'bg-stone-100 text-stone-700 border-stone-200' },
  banco_horas: { label: '🪙 Banco', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
}

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function totalHoras(p: Parte): number {
  return (
    Number(p.horas_ordinarias ?? 0) +
    Number(p.horas_extra ?? 0) +
    Number(p.horas_nocturnas ?? 0)
  )
}

export default function CalendarioView({
  token,
  anio,
  mes,
  lastDay,
  holidays,
  assignments,
  absences,
  partes,
  jornadas,
}: Props) {
  const today = new Date().toISOString().slice(0, 10)

  const data = useMemo(() => {
    const map = new Map<
      string,
      {
        fecha: string
        holiday: Holiday | null
        assignment: Assignment | null
        absence: Absence | null
        parte: Parte | null
        jornada_esperada: number
      }
    >()
    for (const j of jornadas) {
      map.set(j.fecha, {
        fecha: j.fecha,
        holiday: null,
        assignment: null,
        absence: null,
        parte: null,
        jornada_esperada: j.horas,
      })
    }
    for (const h of holidays) {
      const cell = map.get(h.fecha)
      if (cell) cell.holiday = h
    }
    for (const a of assignments) {
      const cell = map.get(a.fecha)
      if (cell) cell.assignment = a
    }
    for (const ab of absences) {
      // Marcar todos los días dentro del rango
      const start = new Date(ab.fecha_inicio + 'T00:00:00')
      const end = new Date(ab.fecha_fin + 'T00:00:00')
      const cur = new Date(start)
      while (cur <= end) {
        const k = cur.toISOString().slice(0, 10)
        const cell = map.get(k)
        if (cell) cell.absence = ab
        cur.setDate(cur.getDate() + 1)
      }
    }
    for (const p of partes) {
      const cell = map.get(p.fecha)
      if (cell) cell.parte = p
    }
    return map
  }, [holidays, assignments, absences, partes, jornadas])

  // Construir grid mensual: empezar lunes de la primera semana
  const firstDay = new Date(anio, mes - 1, 1)
  const fdow = firstDay.getDay()
  const offsetStart = fdow === 0 ? -6 : 1 - fdow
  const gridStart = new Date(firstDay)
  gridStart.setDate(gridStart.getDate() + offsetStart)

  const days: { iso: string; inMonth: boolean }[] = []
  const cur = new Date(gridStart)
  for (let i = 0; i < 42; i++) {
    const iso = cur.toISOString().slice(0, 10)
    days.push({ iso, inMonth: cur.getMonth() + 1 === mes })
    cur.setDate(cur.getDate() + 1)
    if (i >= 27 && cur.getMonth() + 1 !== mes && cur.getDay() === 1) break
  }

  // Resumen mes
  const totalHorasApuntadas = partes.reduce((acc, p) => acc + totalHoras(p), 0)
  const totalHorasEsperadas = jornadas.reduce((acc, j) => acc + j.horas, 0)
  const diasConParte = partes.length
  const diasAusencia = absences.reduce((acc, a) => {
    const start = new Date(Math.max(new Date(a.fecha_inicio).getTime(), firstDay.getTime()))
    const end = new Date(
      Math.min(new Date(a.fecha_fin).getTime(), new Date(anio, mes, 0).getTime()),
    )
    return acc + Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
  }, 0)

  function navMonth(delta: number): string {
    let m = mes + delta
    let a = anio
    if (m > 12) {
      m = 1
      a++
    } else if (m < 1) {
      m = 12
      a--
    }
    return `/portal/trabajador/${token}/calendario?anio=${a}&mes=${m}`
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/portal/trabajador/${token}`}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="text-xl font-medium text-stone-900">Mi calendario</h1>

      {/* Navegación */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-2">
        <Link href={navMonth(-1)} className="rounded px-3 py-1.5 text-sm hover:bg-stone-100">
          ←
        </Link>
        <span className="text-sm font-medium">
          {MES_LABEL[mes]} {anio}
        </span>
        <Link href={navMonth(1)} className="rounded px-3 py-1.5 text-sm hover:bg-stone-100">
          →
        </Link>
      </div>

      {/* Resumen */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-stone-200 bg-white p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Horas mes</div>
          <div className="mt-1 text-base font-medium tabular-nums">
            {totalHorasApuntadas.toFixed(1)}
            <span className="text-xs text-stone-400">/{totalHorasEsperadas.toFixed(0)}</span>
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Días apuntados</div>
          <div className="mt-1 text-base font-medium tabular-nums">{diasConParte}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Días ausencia</div>
          <div className="mt-1 text-base font-medium tabular-nums">{diasAusencia}</div>
        </div>
      </div>

      {/* Grid mensual */}
      <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
          {DOW_LABEL.map((d) => (
            <div
              key={d}
              className="px-1 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-stone-500"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const cell = data.get(d.iso)
            const isToday = d.iso === today
            const isWeekend = (() => {
              const dt = new Date(d.iso + 'T00:00:00').getDay()
              return dt === 0 || dt === 6
            })()
            const dayNum = parseInt(d.iso.slice(8, 10), 10)

            const ausenciaInfo = cell?.absence ? TIPO_AUSENCIA[cell.absence.tipo] ?? null : null
            const proj = singleProj(cell?.assignment?.project) ?? singleProj(cell?.parte?.project)
            const tieneParte = !!cell?.parte
            const horasParte = cell?.parte ? totalHoras(cell.parte) : 0

            return (
              <div
                key={d.iso}
                className={`border-b border-r border-stone-100 p-1 min-h-[64px] text-[10px] ${
                  !d.inMonth ? 'bg-stone-50/50 text-stone-300' : ''
                } ${isWeekend && d.inMonth ? 'bg-stone-50' : ''} ${
                  cell?.holiday ? 'bg-rose-50' : ''
                } ${ausenciaInfo ? ausenciaInfo.cls : ''} ${
                  isToday ? 'ring-2 ring-stone-900 ring-inset' : ''
                }`}
                title={cell?.holiday?.nombre ?? ''}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`font-medium ${isToday ? 'text-stone-900' : ''}`}>
                    {dayNum}
                  </span>
                  {tieneParte && (
                    <span className="text-[9px] tabular-nums text-stone-600">
                      {horasParte.toFixed(0)}h
                    </span>
                  )}
                </div>
                {cell?.holiday && (
                  <div className="mt-0.5 truncate text-[9px] text-rose-700">
                    {cell.holiday.nombre.length > 10
                      ? cell.holiday.nombre.slice(0, 10) + '…'
                      : cell.holiday.nombre}
                  </div>
                )}
                {ausenciaInfo && !cell?.holiday && (
                  <div className="mt-0.5 truncate text-[9px]">{ausenciaInfo.label}</div>
                )}
                {proj && !cell?.holiday && !ausenciaInfo && (
                  <div className="mt-0.5 truncate text-[9px] text-emerald-700">{proj.code}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-3">
        <div className="text-[10px] uppercase tracking-wider text-stone-500">Leyenda</div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-rose-50 border border-rose-200" />
            Festivo
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-stone-50 border border-stone-200" />
            Fin de semana
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-blue-100 border border-blue-200" />
            Vacaciones
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-red-100 border border-red-200" />
            Baja médica
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-violet-100 border border-violet-200" />
            Permiso
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-700 font-medium">XXX-2025</span>
            Proyecto asignado
          </div>
        </div>
      </div>
    </div>
  )
}
