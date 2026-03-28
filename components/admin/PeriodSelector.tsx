'use client'

interface PeriodSelectorProps {
  value: string
  onChange: (period: string) => void
}

const PERIODS = [
  { value: 'month', label: 'Este mes' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year', label: 'Este año' },
  { value: 'all', label: 'Todo' },
]

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex justify-end">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  )
}
