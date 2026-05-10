'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Deadline {
  modelo: string
  nombre: string
  descripcion: string | null
  ejercicio: number
  periodo: string
  fecha_limite: string
  days_until_deadline: number
  estado: string
  importe_a_ingresar: number | null
  filing_id: string | null
  is_overdue: boolean
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function FiscalCalendarCompact() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/fiscal/upcoming?days_ahead=90&days_overdue=30')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setDeadlines(json.deadlines ?? [])
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || deadlines.length === 0) return null

  // Top 5: vencidos primero (ya vienen ordenados), luego próximos
  const top = deadlines.slice(0, 5)
  const overdueCount = deadlines.filter((d) => d.is_overdue).length
  const within7d = deadlines.filter((d) => !d.is_overdue && d.days_until_deadline <= 7).length

  const headerColor = overdueCount > 0
    ? 'bg-red-50 border-red-200'
    : within7d > 0
    ? 'bg-amber-50 border-amber-200'
    : 'bg-neutral-50 border-neutral-200'

  return (
    <div className={`${headerColor} border rounded-lg p-4 mb-4`}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            🗓️ Calendario fiscal AEAT
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5 leading-tight max-w-2xl">
            Modelos a presentar en Hacienda. Cada trimestre/año hay declaraciones obligatorias para Cathedral SL.
            Los vencidos aparecen primero en rojo.
          </p>
        </div>
        {(overdueCount > 0 || within7d > 0) && (
          <div className="text-right text-xs flex items-center gap-3">
            {overdueCount > 0 && (
              <span className="text-red-700 font-bold">⚠ {overdueCount} vencido{overdueCount !== 1 ? 's' : ''}</span>
            )}
            {within7d > 0 && (
              <span className="text-amber-700 font-bold">⏰ {within7d} en 7d</span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1.5 mt-3">
        {top.map((d) => {
          const color = d.is_overdue
            ? 'bg-red-100 border-red-300 text-red-900'
            : d.days_until_deadline <= 7
            ? 'bg-amber-100 border-amber-300 text-amber-900'
            : 'bg-white border-neutral-200 text-neutral-700'
          const daysLabel = d.is_overdue
            ? `Vencido hace ${Math.abs(d.days_until_deadline)}d`
            : d.days_until_deadline === 0
            ? 'Hoy'
            : d.days_until_deadline === 1
            ? 'Mañana'
            : `En ${d.days_until_deadline}d`
          return (
            <div
              key={`${d.modelo}-${d.ejercicio}-${d.periodo}`}
              className={`${color} border rounded px-3 py-2 flex items-center gap-3 text-sm`}
            >
              <span className="font-bold text-xs px-2 py-0.5 bg-white rounded border border-current">
                {d.modelo}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {d.nombre} · {d.periodo} {d.ejercicio}
                </div>
                <div className="text-[10px] opacity-70">{fmtDate(d.fecha_limite)}</div>
              </div>
              <span className="text-xs font-bold whitespace-nowrap">{daysLabel}</span>
              {d.estado !== 'pendiente' && (
                <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-green-200 text-green-800">
                  {d.estado}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {deadlines.length > 5 && (
        <Link
          href="/admin/documentos/fiscal"
          className="mt-3 block text-center text-[11px] uppercase tracking-widest text-neutral-500 hover:text-neutral-900"
        >
          Ver todos ({deadlines.length}) →
        </Link>
      )}
    </div>
  )
}
