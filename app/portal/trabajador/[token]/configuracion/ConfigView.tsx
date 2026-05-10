'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Props {
  token: string
  pinSetAt: string | null
  employeeName: string
}

export default function ConfigView({ token, pinSetAt, employeeName }: Props) {
  const [pinActual, setPinActual] = useState('')
  const [pinNuevo, setPinNuevo] = useState('')
  const [pinNuevoConfirm, setPinNuevoConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isDefault = pinSetAt == null

  async function cambiarPin() {
    setError(null)
    setSuccess(null)
    if (!/^[0-9]{4,6}$/.test(pinActual)) {
      setError('PIN actual debe ser 4-6 dígitos')
      return
    }
    if (!/^[0-9]{4,6}$/.test(pinNuevo)) {
      setError('PIN nuevo debe ser 4-6 dígitos')
      return
    }
    if (pinNuevo !== pinNuevoConfirm) {
      setError('Los PIN nuevos no coinciden')
      return
    }
    if (pinNuevo === '0000') {
      setError('No puedes usar 0000 como PIN nuevo')
      return
    }
    if (pinNuevo === pinActual) {
      setError('El PIN nuevo debe ser distinto al actual')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_actual: pinActual, pin_nuevo: pinNuevo }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al cambiar PIN')
      } else {
        setSuccess('PIN cambiado correctamente ✓')
        setPinActual('')
        setPinNuevo('')
        setPinNuevoConfirm('')
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSaving(false)
    }
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
        <span className="text-xs text-stone-500">{employeeName.trim()}</span>
      </div>

      <h1 className="text-xl font-medium text-stone-900">Ajustes</h1>

      {/* Cambiar PIN */}
      <div className="mt-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
          🔒 Cambiar PIN
        </h2>
        {isDefault && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            ⚠️ Tu PIN sigue siendo el de fábrica (<strong>0000</strong>). Cámbialo ahora para
            que solo tú puedas entrar.
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              PIN actual
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={6}
              value={pinActual}
              onChange={(e) => setPinActual(e.target.value.replace(/\D/g, ''))}
              placeholder={isDefault ? '0000' : '••••'}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-xl tracking-[0.4em] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              PIN nuevo (4-6 dígitos)
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={6}
              value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-xl tracking-[0.4em] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Repite el PIN nuevo
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={6}
              value={pinNuevoConfirm}
              onChange={(e) => setPinNuevoConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-xl tracking-[0.4em] tabular-nums"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ {success}
            </div>
          )}

          <button
            type="button"
            onClick={cambiarPin}
            disabled={saving}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Cambiar PIN'}
          </button>
        </div>

        <p className="mt-3 text-xs text-stone-500">
          💡 Recuerda tu nuevo PIN. Si lo olvidas, tendrás que pedir a la administración que
          te lo resetee.
        </p>
      </div>
    </div>
  )
}
