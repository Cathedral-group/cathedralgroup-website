'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface Employee {
  id: string
  nombre: string | null
  nif: string | null
  email: string | null
}

interface TokenRow {
  id: string
  expires_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  created_at: string
  created_by_email: string | null
  last_used_at: string | null
  last_used_ip: string | null
  uses_count: number
  notes: string | null
}

interface Props {
  employee: Employee
  tokens: TokenRow[]
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WorkerPortalManagerView({ employee, tokens: initialTokens }: Props) {
  const [tokens, setTokens] = useState<TokenRow[]>(initialTokens)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<{ token: string; portalUrl: string } | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [resettingPin, setResettingPin] = useState(false)
  const [pinResetMsg, setPinResetMsg] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [copyOk, setCopyOk] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')

  const activeToken = useMemo(() => tokens.find((t) => !t.revoked_at) ?? null, [tokens])
  const employeeName = (employee.nombre ?? '').trim() || 'Trabajador'

  async function generar() {
    setGenerating(true)
    setError(null)
    setGenerated(null)
    try {
      const res = await fetch(`/api/admin/personal/trabajadores/${employee.id}/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_at: expiresAt || null,
          notes: notes.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al generar')
        return
      }
      setGenerated({ token: json.token, portalUrl: json.portal_url })
      // Refrescar tokens
      const refreshed = await fetch(`/api/admin/personal/trabajadores/${employee.id}/portal`)
      const refreshedJson = await refreshed.json()
      setTokens(refreshedJson.history ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setGenerating(false)
    }
  }

  async function revocar() {
    setRevoking(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/personal/trabajadores/${employee.id}/portal`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason || 'Revocación manual' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al revocar')
        return
      }
      setConfirmRevoke(false)
      setRevokeReason('')
      const refreshed = await fetch(`/api/admin/personal/trabajadores/${employee.id}/portal`)
      const refreshedJson = await refreshed.json()
      setTokens(refreshedJson.history ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setRevoking(false)
    }
  }

  async function resetPin() {
    if (!confirm('¿Resetear PIN del trabajador a 0000? El trabajador deberá entrar con 0000 y elegir uno nuevo.')) return
    setResettingPin(true)
    setError(null)
    setPinResetMsg(null)
    try {
      const res = await fetch(`/api/admin/personal/trabajadores/${employee.id}/reset-pin`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error reseteando PIN')
      } else {
        setPinResetMsg('PIN reseteado a 0000. El trabajador deberá cambiarlo al entrar.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setResettingPin(false)
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 1500)
    } catch {
      // ignore
    }
  }

  const mensajeWhatsapp = generated
    ? `Hola, este es tu acceso al dietario para apuntar las horas trabajadas. Guárdalo, es solo tuyo:\n\n${generated.portalUrl}`
    : ''

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <Link href="/admin/personal/dietario" className="hover:text-stone-900">
              Dietario
            </Link>
            <span>›</span>
            <span className="text-stone-900">Acceso portal</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Acceso al portal — {employeeName}
          </h1>
          {employee.nif && (
            <p className="mt-1 font-mono text-xs text-stone-500">NIF: {employee.nif}</p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Aviso seguridad */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <strong>Cómo funciona:</strong> el portal del trabajador NO da acceso al panel
          administrativo. Es un sistema independiente con un link único por trabajador. Si
          sospechas que el link se ha filtrado, revócalo y genera uno nuevo.
        </div>

        {/* Estado actual */}
        <div className="mb-6 rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
            Estado actual
          </h2>
          {activeToken ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  ● Acceso activo
                </span>
                <span className="text-xs text-stone-500">
                  Generado el {fmtDate(activeToken.created_at)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-stone-600">
                <div>
                  <span className="text-stone-400">Último uso:</span>{' '}
                  {fmtDate(activeToken.last_used_at)}
                </div>
                <div>
                  <span className="text-stone-400">Usos totales:</span> {activeToken.uses_count}
                </div>
                <div>
                  <span className="text-stone-400">Expira:</span>{' '}
                  {activeToken.expires_at ? fmtDate(activeToken.expires_at) : 'No expira'}
                </div>
                <div>
                  <span className="text-stone-400">Última IP:</span>{' '}
                  {activeToken.last_used_ip ?? '—'}
                </div>
              </div>
              {activeToken.notes && (
                <div className="text-xs text-stone-500">Notas: {activeToken.notes}</div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">
              No hay acceso activo. Genera uno para que el trabajador pueda apuntar partes de horas.
            </div>
          )}
        </div>

        {/* Generar nuevo */}
        {!generated && (
          <div className="mb-6 rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
              {activeToken ? 'Regenerar token' : 'Generar acceso'}
            </h2>
            {activeToken && (
              <p className="mt-1 text-xs text-amber-700">
                ⚠️ El token actual será revocado al generar uno nuevo. El trabajador necesitará el
                nuevo link.
              </p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Expira (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
                <p className="mt-1 text-xs text-stone-500">Vacío = no expira</p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Notas internas (opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ej: enviado por whatsapp 15/05"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={generar}
              disabled={generating}
              className="mt-4 w-full rounded bg-stone-900 px-4 py-2 text-sm text-white transition hover:bg-stone-800 disabled:opacity-50 sm:w-auto"
            >
              {generating ? 'Generando…' : activeToken ? 'Regenerar' : 'Generar acceso'}
            </button>
          </div>
        )}

        {/* Token recién generado */}
        {generated && (
          <div className="mb-6 rounded-lg border-2 border-emerald-400 bg-emerald-50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-900">
              ✓ Acceso generado
            </h2>
            <p className="mt-1 text-xs text-emerald-800">
              Cópialo y envíaselo al trabajador. <strong>Este link solo se muestra una vez.</strong>{' '}
              Si lo pierdes, debes regenerar uno nuevo.
            </p>

            <div className="mt-4">
              <label className="block text-xs uppercase tracking-wider text-emerald-900">
                URL del portal
              </label>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={generated.portalUrl}
                  className="flex-1 rounded border border-emerald-300 bg-white px-2 py-1.5 font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => copyText(generated.portalUrl)}
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800"
                >
                  {copyOk ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs uppercase tracking-wider text-emerald-900">
                Mensaje listo para enviar (whatsapp/email)
              </label>
              <textarea
                readOnly
                value={mensajeWhatsapp}
                rows={4}
                className="mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1.5 text-xs"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => copyText(mensajeWhatsapp)}
                className="mt-2 rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800"
              >
                Copiar mensaje
              </button>
            </div>

            <button
              type="button"
              onClick={() => setGenerated(null)}
              className="mt-4 w-full rounded border border-emerald-300 bg-white px-4 py-2 text-sm text-emerald-900 hover:bg-emerald-100"
            >
              He copiado el link, cerrar
            </button>
          </div>
        )}

        {/* Resetear PIN */}
        {activeToken && !generated && (
          <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
              🔒 Resetear PIN
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Si el trabajador olvida su PIN, vuélvelo a poner a <strong>0000</strong>. El
              token sigue siendo el mismo, no necesitas regenerar el link.
            </p>
            {pinResetMsg && (
              <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-800">
                ✓ {pinResetMsg}
              </p>
            )}
            <button
              type="button"
              onClick={resetPin}
              disabled={resettingPin}
              className="mt-2 rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
            >
              {resettingPin ? 'Reseteando…' : 'Resetear PIN a 0000'}
            </button>
          </div>
        )}

        {/* Revocar */}
        {activeToken && !generated && (
          <div className="mb-6 rounded-lg border border-red-200 bg-white p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-red-700">
              Revocar acceso
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Útil si el trabajador deja la empresa o si sospechas filtración del link.
            </p>
            {!confirmRevoke ? (
              <button
                type="button"
                onClick={() => setConfirmRevoke(true)}
                className="mt-3 rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Revocar acceso
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="Motivo (opcional, queda en el log)"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={revocar}
                    disabled={revoking}
                    className="rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {revoking ? 'Revocando…' : 'Confirmar revocación'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmRevoke(false)
                      setRevokeReason('')
                    }}
                    className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Histórico */}
        {tokens.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
              Histórico de tokens ({tokens.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Creado</th>
                    <th className="px-3 py-2">Expira</th>
                    <th className="px-3 py-2">Último uso</th>
                    <th className="px-3 py-2 text-right">Usos</th>
                    <th className="px-3 py-2">Revocado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {tokens.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">
                        {t.revoked_at ? (
                          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                            Revocado
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtDate(t.created_at)}</td>
                      <td className="px-3 py-2 text-xs">
                        {t.expires_at ? fmtDate(t.expires_at) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtDate(t.last_used_at)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.uses_count}</td>
                      <td className="px-3 py-2 text-xs text-stone-500">
                        {t.revoked_at
                          ? `${fmtDate(t.revoked_at)} · ${t.revoked_reason ?? '—'}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
