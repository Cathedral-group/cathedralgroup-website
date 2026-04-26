'use client'

/**
 * Badge visual del verificador algorítmico.
 *
 * Muestra ✅ verde / ⚠️ ámbar / ❌ rojo + tooltip con razones al hover.
 * Uso típico: al lado de cada nómina/factura en los listados de /admin.
 *
 * Diseño: sigue la paleta cromática Cathedral (sin colorinas, monocromo
 * más acentos suaves).
 */

import { useState } from 'react'
import type { VerificationSummary } from '@/lib/verifier/batch'

interface Props {
  summary: VerificationSummary | undefined
  /** Si true, muestra "OK" / "Revisar" en texto. Si false, solo el icono. */
  showLabel?: boolean
  /** Tamaño */
  size?: 'sm' | 'md'
}

export default function VerificationBadge({
  summary,
  showLabel = false,
  size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false)

  if (!summary) {
    return (
      <span
        className="inline-flex items-center gap-1 text-neutral-300"
        title="Verificación no ejecutada"
      >
        <svg className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
        </svg>
        {showLabel && <span className="text-xs">—</span>}
      </span>
    )
  }

  const isOk = summary.status === 'ok'
  const isWarn = summary.status === 'warning'
  const isError = summary.status === 'error'

  const colorClass = isOk
    ? 'text-emerald-600'
    : isWarn
    ? 'text-amber-600'
    : 'text-red-600'

  const bgClass = isOk
    ? 'bg-emerald-50 border-emerald-200'
    : isWarn
    ? 'bg-amber-50 border-amber-200'
    : 'bg-red-50 border-red-200'

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  // Iconos monocromos (Heroicons outline)
  const Icon = () => {
    if (isOk) {
      return (
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    if (isWarn) {
      return (
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      )
    }
    // error
    return (
      <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    )
  }

  const label = isOk ? 'OK' : isWarn ? 'Revisar' : 'Error'

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`inline-flex items-center gap-1 ${colorClass} hover:opacity-70 transition-opacity cursor-pointer`}
        aria-label={`Verificación: ${label}`}
      >
        <Icon />
        {showLabel && <span className="text-xs font-medium">{label}</span>}
      </button>

      {open && !isOk && summary.reasons.length > 0 && (
        <div
          className={`absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-72 px-3 py-2 rounded-md border ${bgClass} shadow-lg pointer-events-none`}
        >
          <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${colorClass}`}>
            {isError ? `${summary.error_count} error${summary.error_count === 1 ? '' : 'es'}` : `${summary.warning_count} aviso${summary.warning_count === 1 ? '' : 's'}`}
          </div>
          <ul className="text-[11px] text-neutral-700 space-y-0.5">
            {summary.reasons.map((r, i) => (
              <li key={i} className="leading-tight">
                • {r}
              </li>
            ))}
          </ul>
          {Object.keys(summary.suggestions).length > 0 && (
            <div className="mt-2 pt-2 border-t border-current/10">
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${colorClass}`}>
                Sugerencias OCR
              </div>
              <ul className="text-[11px] text-neutral-700 space-y-0.5">
                {Object.entries(summary.suggestions).map(([field, value]) => (
                  <li key={field}>
                    <code className="bg-white/60 px-1 py-0.5 rounded text-[10px]">{field}</code> → <strong>{value}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
