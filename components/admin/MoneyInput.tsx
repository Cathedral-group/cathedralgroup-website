'use client'

import { useState } from 'react'

interface MoneyInputProps {
  value: number | null
  onChange: (value: number) => void
  label?: string
  disabled?: boolean
}

function formatEur(val: number | null): string {
  if (val === null || isNaN(val)) return ''
  return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MoneyInput({ value, onChange, label, disabled = false }: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const [rawValue, setRawValue] = useState('')

  const handleFocus = () => {
    setFocused(true)
    setRawValue(value !== null && !isNaN(value) ? String(value) : '')
  }

  const handleBlur = () => {
    setFocused(false)
    const parsed = parseFloat(rawValue)
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setRawValue(raw)
    // Also propagate valid numbers immediately so parent state is up-to-date before blur
    const parsed = parseFloat(raw)
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
  }

  return (
    <div>
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          type={focused ? 'number' : 'text'}
          value={focused ? rawValue : formatEur(value)}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          step="0.01"
          className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm disabled:opacity-50"
        />
        <span className="text-sm text-neutral-400 font-medium">&euro;</span>
      </div>
    </div>
  )
}
