'use client'

interface LinkedSelectProps {
  options: { value: string; label: string }[]
  value: string | null
  onChange: (value: string) => void
  label?: string
  placeholder?: string
}

export default function LinkedSelect({ options, value, onChange, label, placeholder = 'Seleccionar...' }: LinkedSelectProps) {
  return (
    <div>
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">
          {label}
        </label>
      )}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
