'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const QUARTERS = ['Q1 · Ene–Mar', 'Q2 · Abr–Jun', 'Q3 · Jul–Sep', 'Q4 · Oct–Dic']

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

interface Props {
  year: number
  quarter: number | null
  month: number | null
}

export default function PeriodSelector({ year, quarter, month }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const go = useCallback((params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(params)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    router.push(`?${next.toString()}`)
  }, [router, searchParams])

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: currentYear - 2023 }, (_, i) => 2024 + i)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Year */}
      <select
        value={year}
        onChange={e => go({ year: e.target.value, quarter: null, month: null })}
        className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700 font-medium hover:border-neutral-400 transition-colors"
      >
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      {/* Año / Q1–Q4 buttons */}
      <div className="flex items-center gap-0.5 bg-neutral-100 rounded p-0.5">
        <button
          onClick={() => go({ quarter: null, month: null })}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${!quarter && !month ? 'bg-white shadow-sm text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          Año
        </button>
        {[1,2,3,4].map(q => (
          <button
            key={q}
            onClick={() => go({ quarter: String(q), month: null })}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${quarter === q ? 'bg-white shadow-sm text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            Q{q}
          </button>
        ))}
      </div>

      {/* Month */}
      <select
        value={month ?? ''}
        onChange={e => go({ month: e.target.value || null, quarter: null })}
        className="text-xs border border-neutral-200 rounded px-2 py-1.5 bg-white text-neutral-700 hover:border-neutral-400 transition-colors"
      >
        <option value="">— Mes —</option>
        {MONTHS.map((m, i) => (
          <option key={i + 1} value={i + 1}>{m}</option>
        ))}
      </select>

      {/* Active period label */}
      <span className="text-[10px] text-neutral-400 uppercase tracking-widest">
        {month
          ? `${MONTHS[month - 1]} ${year}`
          : quarter
          ? `${QUARTERS[quarter - 1]} · ${year}`
          : `Año natural ${year}`}
      </span>
    </div>
  )
}
