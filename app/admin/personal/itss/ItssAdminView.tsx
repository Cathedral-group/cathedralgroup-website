'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Employee {
  id: string
  nombre: string | null
  nif: string | null
}

interface ItssToken {
  id: string
  inspector_nombre: string | null
  inspector_dni: string | null
  inspeccion_referencia: string | null
  scope_employee_id: string | null
  scope_desde: string | null
  scope_hasta: string | null
  expires_at: string
  revoked_at: string | null
  revoked_reason: string | null
  created_at: string
  created_by_email: string | null
  last_used_at: string | null
  last_used_ip: string | null
  uses_count: number
}

interface Props {
  initialTokens: ItssToken[]
  employees: Employee[]
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

export default function ItssAdminView({ initialTokens, employees }: Props) {
  const [tokens, setTokens] = useState<ItssToken[]>(initialTokens)
  const [showForm, setShowForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<{ token: string; itss_url: string; expires_at: string } | null>(null)
  const [copyOk, setCopyOk] = useState(false)

  // Form
  const [inspectorNombre, setInspectorNombre] = useState('')
  const [inspectorDni, setInspectorDni] = useState('')
  const [inspeccionRef, setInspeccionRef] = useState('')
  const [scopeEmployee, setScopeEmployee] = useState<string>('')
  const [scopeDesde, setScopeDesde] = useState('')
  const [scopeHasta, setScopeHasta] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)

  async function generar() {
    if (!inspectorNombre.trim()) {
      setError('Nombre del inspector requerido')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/personal/itss-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspector_nombre: inspectorNombre.trim(),
          inspector_dni: inspectorDni.trim() || undefined,
          inspeccion_referencia: inspeccionRef.trim() || undefined,
          scope_employee_id: scopeEmployee || null,
          scope_desde: scopeDesde || null,
          scope_hasta: scopeHasta || null,
          expires_in_days: expiresInDays,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al generar')
      } else {
        setGenerated({
          token: json.token,
          itss_url: json.itss_url,
          expires_at: json.expires_at,
        })
        // Recargar lista
        const listRes = await fetch('/api/admin/personal/itss-tokens')
        const listJson = await listRes.json()
        setTokens(listJson.rows ?? [])
        // Reset form
        setInspectorNombre('')
        setInspectorDni('')
        setInspeccionRef('')
        setScopeEmployee('')
        setScopeDesde('')
        setScopeHasta('')
        setShowForm(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setGenerating(false)
    }
  }

  async function revocar(id: string) {
    const reason = prompt('Motivo (opcional):')
    if (reason === null) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/personal/itss-tokens/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Revocación manual' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al revocar')
      } else {
        setTokens((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, revoked_at: new Date().toISOString(), revoked_reason: reason || 'Revocación manual' }
              : t,
          ),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 1500)
    } catch {}
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <span className="text-stone-900">Acceso Inspección de Trabajo</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Tokens ITSS — acceso Inspección de Trabajo
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Cuando la Inspección de Trabajo te requiera el registro horario, genera aquí un token
            que el inspector puede usar para consultar los datos directamente, sin necesidad de
            que estés tú presente. Cumple con el nuevo RD de registro horario digital.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Aviso seguridad */}
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <strong>Cómo funciona:</strong> el inspector recibe un link único{' '}
          <code className="rounded bg-white px-1">/itss/[token]</code> que le permite ver el
          registro horario en modo solo lectura. Cada acceso queda auditado (IP + timestamp).
          Puedes limitarlo a un trabajador concreto y/o rango de fechas, y revocarlo cuando
          quieras.
        </div>

        {/* Token recién generado */}
        {generated && (
          <div className="mb-5 rounded-lg border-2 border-emerald-400 bg-emerald-50 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-900">
              ✓ Token generado
            </h2>
            <p className="mt-1 text-xs text-emerald-800">
              Cópialo y entrégaselo al inspector. <strong>Solo se muestra una vez.</strong>{' '}
              Expira el {fmtDate(generated.expires_at)}.
            </p>
            <div className="mt-3">
              <label className="block text-xs uppercase tracking-wider text-emerald-900">URL</label>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={generated.itss_url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 rounded border border-emerald-300 bg-white px-2 py-1.5 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => copyText(generated.itss_url)}
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800"
                >
                  {copyOk ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGenerated(null)}
              className="mt-3 w-full rounded border border-emerald-300 bg-white px-4 py-2 text-sm text-emerald-900 hover:bg-emerald-100"
            >
              He copiado el link, cerrar
            </button>
          </div>
        )}

        {/* Botón generar / formulario */}
        {!showForm && !generated && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mb-5 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800"
          >
            + Generar nuevo token ITSS
          </button>
        )}

        {showForm && (
          <div className="mb-5 rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
              Nuevo token ITSS
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Nombre inspector *
                </label>
                <input
                  type="text"
                  value={inspectorNombre}
                  onChange={(e) => setInspectorNombre(e.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  DNI inspector
                </label>
                <input
                  type="text"
                  value={inspectorDni}
                  onChange={(e) => setInspectorDni(e.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Referencia/expediente ITSS
                </label>
                <input
                  type="text"
                  value={inspeccionRef}
                  onChange={(e) => setInspeccionRef(e.target.value)}
                  placeholder="ej: ITSS-2026-12345"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Expira en (días)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10) || 30)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Limitar a un trabajador
                </label>
                <select
                  value={scopeEmployee}
                  onChange={(e) => setScopeEmployee(e.target.value)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— Todos —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {(e.nombre ?? '').trim()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={scopeDesde}
                    onChange={(e) => setScopeDesde(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-500">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={scopeHasta}
                    onChange={(e) => setScopeHasta(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
            {error && (
              <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={generar}
                disabled={generating}
                className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {generating ? 'Generando…' : 'Generar token'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista tokens */}
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Tokens existentes ({tokens.length})
        </h2>
        {tokens.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No has generado ningún token ITSS todavía.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Inspector</th>
                  <th className="px-3 py-2.5">Referencia</th>
                  <th className="px-3 py-2.5">Generado</th>
                  <th className="px-3 py-2.5">Expira</th>
                  <th className="px-3 py-2.5">Último uso</th>
                  <th className="px-3 py-2.5 text-right">Usos</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {tokens.map((t) => {
                  const expired = isExpired(t.expires_at)
                  const active = !t.revoked_at && !expired
                  return (
                    <tr key={t.id}>
                      <td className="px-3 py-2.5">
                        {active ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Activo
                          </span>
                        ) : t.revoked_at ? (
                          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                            Revocado
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            Expirado
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{t.inspector_nombre}</div>
                        {t.inspector_dni && (
                          <div className="font-mono text-[10px] text-stone-500">
                            {t.inspector_dni}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{t.inspeccion_referencia ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{fmtDate(t.created_at)}</td>
                      <td className="px-3 py-2.5 text-xs">{fmtDate(t.expires_at)}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {t.last_used_at ? fmtDate(t.last_used_at) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.uses_count}</td>
                      <td className="px-3 py-2.5">
                        {active && (
                          <button
                            type="button"
                            onClick={() => revocar(t.id)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Revocar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
