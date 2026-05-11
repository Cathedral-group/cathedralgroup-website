'use client'

/**
 * Gantt multi-proyecto. CSS Grid puro, sin librería.
 *
 * Estructura:
 *   - Header con columna 'Proyecto' + columnas de meses
 *   - Una fila por proyecto activo. Dentro del área de columnas,
 *     barra horizontal absolutely-positioned con start→end del proyecto
 *   - Color según estado (presupuesto=stone, en_curso=emerald)
 *   - Sub-toggle 'Ver carga personal': chip pequeño bajo cada barra
 *     con N trabajadores que tienen asignación en cualquier día del proyecto
 *
 * Zoom: trimestre (3 meses), semestre (6 meses), año (12 meses) con prev/next.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

interface Project {
  id: string
  code: string
  name: string | null
  status: string | null
  start_date: string | null
  end_date_planned: string | null
  end_date_real: string | null
}

interface Assignment {
  fecha: string
  employee_id: string
  project_id: string
}

interface Props {
  desde: string
  hasta: string
  projects: Project[]
  assignments: Assignment[]
}

const STATUS_COLOR: Record<string, string> = {
  presupuesto: 'bg-stone-300',
  en_curso: 'bg-emerald-500',
  completado: 'bg-blue-400',
  finalizado: 'bg-blue-400',
  cancelado: 'bg-red-400',
}

function monthsBetween(desde: string, hasta: string): { year: number; month: number; label: string; firstDay: Date }[] {
  const out: { year: number; month: number; label: string; firstDay: Date }[] = []
  const start = new Date(desde + 'T00:00:00')
  const end = new Date(hasta + 'T00:00:00')
  let d = new Date(start.getFullYear(), start.getMonth(), 1)
  while (d <= end) {
    out.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
      firstDay: new Date(d),
    })
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  }
  return out
}

export default function GanttMultiView({ desde, hasta, projects, assignments }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showLoad, setShowLoad] = useState(true)

  const months = useMemo(() => monthsBetween(desde, hasta), [desde, hasta])
  const totalDays = useMemo(() => {
    const d1 = new Date(desde + 'T00:00:00')
    const d2 = new Date(hasta + 'T00:00:00')
    return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1
  }, [desde, hasta])

  // % de cada mes en la barra horizontal
  const monthSegments = useMemo(() => {
    const start = new Date(desde + 'T00:00:00').getTime()
    return months.map((m) => {
      const nextMonth = new Date(m.year, m.month + 1, 1)
      const segStart = Math.max(m.firstDay.getTime(), start)
      const segEnd = Math.min(nextMonth.getTime() - 86400000, new Date(hasta + 'T00:00:00').getTime())
      const startPct = ((segStart - start) / 86400000 / totalDays) * 100
      const widthPct = ((segEnd - segStart) / 86400000 / totalDays) * 100 + (100 / totalDays)
      return { ...m, startPct, widthPct }
    })
  }, [months, desde, hasta, totalDays])

  // Asignaciones por proyecto (recursos)
  const employeesPerProject = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const a of assignments) {
      ;(map[a.project_id] ??= new Set()).add(a.employee_id)
    }
    return map
  }, [assignments])

  function ganttBarStyle(p: Project) {
    const periodStart = new Date(desde + 'T00:00:00').getTime()
    const periodEnd = new Date(hasta + 'T00:00:00').getTime()

    const startStr = p.start_date ?? desde
    const endStr = p.end_date_real ?? p.end_date_planned ?? hasta
    const projStart = Math.max(new Date(startStr + 'T00:00:00').getTime(), periodStart)
    const projEnd = Math.min(new Date(endStr + 'T00:00:00').getTime(), periodEnd)

    if (projStart > projEnd) return null

    const leftPct = ((projStart - periodStart) / 86400000 / totalDays) * 100
    const widthPct = ((projEnd - projStart) / 86400000 / totalDays) * 100 + (100 / totalDays)
    return { leftPct, widthPct }
  }

  function shiftPeriod(direction: 1 | -1) {
    const d1 = new Date(desde + 'T00:00:00')
    const d2 = new Date(hasta + 'T00:00:00')
    const days = Math.round((d2.getTime() - d1.getTime()) / 86400000)
    const monthsShift = Math.max(1, Math.round(days / 30 / 2)) * direction
    const newDesde = new Date(d1.getFullYear(), d1.getMonth() + monthsShift, d1.getDate())
    const newHasta = new Date(d2.getFullYear(), d2.getMonth() + monthsShift, d2.getDate())
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('desde', newDesde.toISOString().slice(0, 10))
    params.set('hasta', newHasta.toISOString().slice(0, 10))
    router.push(`/admin/calendario/gantt?${params.toString()}`)
  }

  function setZoom(monthsCount: number) {
    const today = new Date()
    const newDesde = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const newHasta = new Date(today.getFullYear(), today.getMonth() - 1 + monthsCount, 0)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('desde', newDesde.toISOString().slice(0, 10))
    params.set('hasta', newHasta.toISOString().slice(0, 10))
    router.push(`/admin/calendario/gantt?${params.toString()}`)
  }

  const todayPct = useMemo(() => {
    const start = new Date(desde + 'T00:00:00').getTime()
    const today = Date.now()
    return ((today - start) / 86400000 / totalDays) * 100
  }, [desde, totalDays])

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/calendario" className="hover:text-stone-900">Calendario</Link>
            <span>›</span>
            <span className="text-stone-900">Gantt multi-proyecto</span>
          </div>
          <h1 className="mt-1 text-2xl font-light tracking-tight text-stone-900">Gantt multi-proyecto</h1>
          <p className="text-xs text-stone-500 mt-0.5">Vista temporal horizontal de todos los proyectos activos</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded border border-stone-300 overflow-hidden">
            {[
              { l: 'Trim.', m: 3 },
              { l: '6 meses', m: 6 },
              { l: 'Año', m: 12 },
            ].map(({ l, m }) => (
              <button
                key={l}
                onClick={() => setZoom(m)}
                className="px-3 py-1.5 text-xs uppercase tracking-widest text-stone-700 hover:bg-stone-50"
              >
                {l}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded border border-stone-300 overflow-hidden">
            <button onClick={() => shiftPeriod(-1)} className="px-2 py-1.5 hover:bg-stone-50">‹</button>
            <button onClick={() => shiftPeriod(1)} className="px-2 py-1.5 hover:bg-stone-50">›</button>
          </div>
          <button
            onClick={() => setShowLoad((v) => !v)}
            className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border ${
              showLoad ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-400 border-stone-300'
            }`}
          >
            👷 Carga personal
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-stone-500 bg-stone-50 border-b border-stone-200 w-56">
                Proyecto
              </th>
              <th className="relative bg-stone-50 border-b border-stone-200">
                <div className="relative h-8">
                  {monthSegments.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-stone-200 text-[10px] uppercase tracking-widest text-stone-500 pl-1"
                      style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {projects.map((p) => {
              const bar = ganttBarStyle(p)
              const emps = employeesPerProject[p.id]
              const empCount = emps?.size ?? 0
              const status = p.status ?? 'presupuesto'
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/admin/proyectos`}
                      className="block text-xs hover:underline"
                      title="Abrir proyecto"
                    >
                      <div className="font-mono text-stone-500">{p.code}</div>
                      <div className="text-sm text-stone-900 truncate max-w-[200px]">{p.name}</div>
                      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-stone-400">{status}</div>
                    </Link>
                  </td>
                  <td className="relative align-middle">
                    <div className="relative h-12">
                      {/* Línea hoy */}
                      {todayPct >= 0 && todayPct <= 100 && (
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-red-400 z-10"
                          style={{ left: `${todayPct}%` }}
                          title="Hoy"
                        />
                      )}
                      {bar && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-4 rounded text-white text-[10px] flex items-center px-1.5 overflow-hidden ${STATUS_COLOR[status] ?? 'bg-stone-300'}`}
                          style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                          title={`${p.start_date ?? '—'} → ${p.end_date_planned ?? '—'}`}
                        >
                          {showLoad && empCount > 0 && (
                            <span className="font-mono">👷 {empCount}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-stone-400">
                  No hay proyectos activos en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-[10px] text-stone-400 flex flex-wrap items-center gap-3">
        <span>Leyenda:</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-stone-300" /> Presupuesto
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-emerald-500" /> En curso
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-blue-400" /> Completado / finalizado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-0.5 h-3 bg-red-400" /> Hoy
        </span>
        {showLoad && <span>· 👷 N = trabajadores con asignación a la obra en el periodo</span>}
      </div>
    </div>
  )
}
