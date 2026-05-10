'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  token: string
  employeeName: string
  pinIsDefault: boolean
}

export default function PinGate({ token, employeeName, pinIsDefault }: Props) {
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit() {
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError('PIN debe ser 4-6 dígitos')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/login-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        // Recargar página para que el server detecte la cookie y renderice el portal
        window.location.reload()
      } else if (res.status === 429) {
        setError(json.error ?? 'Bloqueado por intentos fallidos')
        setPin('')
      } else {
        setError(json.error ?? 'PIN incorrecto')
        if (typeof json.attempts_left === 'number') setAttemptsLeft(json.attempts_left)
        setPin('')
        inputRef.current?.focus()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-2xl text-white">
            🔒
          </div>
          <h1 className="mt-3 text-lg font-medium text-stone-900">Tu acceso protegido</h1>
          {employeeName && (
            <p className="mt-1 text-sm text-stone-600">
              Hola <strong>{employeeName.trim()}</strong>
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Introduce tu PIN para acceder. Por defecto es <strong>0000</strong> y puedes
            cambiarlo dentro.
          </p>
        </div>

        <div className="mt-5">
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={handleKeyDown}
            placeholder="••••"
            className="w-full rounded-lg border-2 border-stone-300 px-3 py-3 text-center text-2xl tracking-[0.5em] tabular-nums focus:border-stone-900 focus:outline-none"
          />

          {pinIsDefault && !error && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-800">
              💡 Es la primera vez. Tu PIN es <strong>0000</strong>. Cámbialo después dentro.
            </p>
          )}

          {error && (
            <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              ⚠️ {error}
              {attemptsLeft !== null && attemptsLeft > 0 && (
                <span className="ml-1">({attemptsLeft} intentos restantes)</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || pin.length < 4}
            className="mt-3 w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {submitting ? 'Verificando…' : 'Entrar'}
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-stone-400">
        Si has olvidado tu PIN, pide a la administración que te lo resetee.
      </p>
    </div>
  )
}
