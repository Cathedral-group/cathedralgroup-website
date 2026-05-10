'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  countPending,
  drainQueue,
  enqueueParte,
} from '@/lib/portal-offline-queue'

interface ProjectRef {
  id: string
  code: string
  name?: string | null
  description?: string | null
  status?: string | null
}

interface ParteRow {
  id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  observaciones: string | null
  fuente?: string | null
  worker_signed_at?: string | null
  project?:
    | { code: string; name?: string | null }
    | { code: string; name?: string | null }[]
    | null
}

interface AssignmentHoy {
  id: string
  project_id: string | null
  jornada_esperada_horas: number | null
  notas: string | null
  project?:
    | { id: string; code: string; name?: string | null }
    | { id: string; code: string; name?: string | null }[]
    | null
}

interface Stats {
  today: string
  week_start: string
  month_start: string
  month_end: string
  horas_hoy: number
  horas_semana: number
  horas_mes: number
  dias_apuntados_mes: number
  dias_pendientes_mes: number
}

interface ConsentState {
  accepted_at: string | null
  text_version: string | null
  current_version: string
  needs_acceptance: boolean
}

interface Props {
  token: string
  employee: { nombre: string }
  today: string
  projects: ProjectRef[]
  parteHoy: ParteRow | null
  ultimosDias: ParteRow[]
  assignmentHoy: AssignmentHoy | null
  stats: Stats | null
  consent: ConsentState
}

function totalHoras(r: ParteRow): number {
  return (
    Number(r.horas_ordinarias ?? 0) +
    Number(r.horas_extra ?? 0) +
    Number(r.horas_nocturnas ?? 0)
  )
}

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

const CONSENT_TEXT = `INFORMACIÓN BÁSICA SOBRE PROTECCIÓN DE DATOS

• Responsable: Cathedral Group (la empresa que te tiene contratado).
• Finalidad: gestionar tu registro de jornada laboral conforme al art. 34.9 del Estatuto de los Trabajadores y el Real Decreto-Ley 8/2019.
• Legitimación: cumplimiento de obligación legal e interés legítimo del empresario.
• Datos tratados: tu nombre, NIF, horas trabajadas, proyecto donde trabajas, observaciones que tú escribes, hora de envío del parte y dirección IP.
• Conservación: 4 años (período legal de consulta de Inspección de Trabajo).
• Destinatarios: solo personal autorizado de Cathedral Group y la Inspección de Trabajo si lo requiere.
• Derechos: acceder, rectificar, suprimir, oponerte y portabilidad escribiendo a la dirección que la empresa te facilite.
• Más información: solicítala a la administración de la empresa.

Al aceptar declaras que has leído y entendido esta información.`

export default function PortalTrabajadorView({
  token,
  employee,
  today,
  projects,
  parteHoy,
  ultimosDias,
  assignmentHoy,
  stats,
  consent,
}: Props) {
  // Cláusula RGPD: si necesita aceptación, modal bloqueante
  const [showConsent, setShowConsent] = useState<boolean>(consent.needs_acceptance)
  const [acceptingConsent, setAcceptingConsent] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  // Pre-rellenar con asignación cuadrante si existe y parteHoy aún no
  const assignProj = singleProj(assignmentHoy?.project)
  const defaultProjectId =
    parteHoy?.project_id ??
    assignmentHoy?.project_id ??
    ''

  const defaultJornada =
    Number(parteHoy?.horas_ordinarias ?? assignmentHoy?.jornada_esperada_horas ?? 8)

  const [fecha, setFecha] = useState<string>(today)
  const [projectId, setProjectId] = useState<string>(defaultProjectId)
  const [horasOrd, setHorasOrd] = useState<number>(defaultJornada)
  const [horasExt, setHorasExt] = useState<number>(Number(parteHoy?.horas_extra ?? 0))
  const [horasNoc, setHorasNoc] = useState<number>(Number(parteHoy?.horas_nocturnas ?? 0))
  const [observaciones, setObservaciones] = useState<string>(parteHoy?.observaciones ?? '')
  const [confirmaVeracidad, setConfirmaVeracidad] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Cola offline
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [draining, setDraining] = useState(false)

  const refreshPending = useCallback(async () => {
    try {
      const c = await countPending(token)
      setPendingCount(c)
    } catch {
      // ignore (IDB no disponible)
    }
  }, [token])

  const tryDrain = useCallback(async () => {
    if (!navigator.onLine) return
    setDraining(true)
    try {
      const result = await drainQueue(token)
      if (result.succeeded > 0) {
        setSuccess(`${result.succeeded} parte${result.succeeded > 1 ? 's' : ''} pendiente${result.succeeded > 1 ? 's' : ''} sincronizado${result.succeeded > 1 ? 's' : ''} ✓`)
      }
      await refreshPending()
      // Si hay éxitos, recargar para reflejar estado servidor
      if (result.succeeded > 0) {
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      // ignore
    } finally {
      setDraining(false)
    }
  }, [token, refreshPending])

  useEffect(() => {
    if (showConsent) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [showConsent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOnline(navigator.onLine)
    refreshPending()

    const handleOnline = () => {
      setIsOnline(true)
      tryDrain()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Drain inicial al cargar (por si hay pendientes de sesión anterior)
    if (navigator.onLine) tryDrain()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshPending, tryDrain])

  async function aceptarConsent() {
    setAcceptingConsent(true)
    setConsentError(null)
    try {
      const res = await fetch(`/api/portal/trabajador/${token}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: consent.current_version }),
      })
      const json = await res.json()
      if (!res.ok) {
        setConsentError(json.error ?? 'No se pudo registrar la aceptación')
      } else {
        setShowConsent(false)
      }
    } catch (e) {
      setConsentError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setAcceptingConsent(false)
    }
  }

  async function guardar() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const payload = {
      fecha,
      project_id: projectId || null,
      horas_ordinarias: horasOrd,
      horas_extra: horasExt,
      horas_nocturnas: horasNoc,
      observaciones: observaciones.trim() || undefined,
    }

    // Si offline, encolar directamente
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        await enqueueParte({ token, payload })
        await refreshPending()
        setSuccess(
          'Sin conexión: parte guardado en este móvil. Se enviará automáticamente cuando vuelva la red.',
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar localmente')
      } finally {
        setSaving(false)
      }
      return
    }

    try {
      const res = await fetch(`/api/portal/trabajador/${token}/parte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'No se pudo guardar')
      } else {
        setSuccess(
          json.action === 'created'
            ? 'Parte registrado y firmado correctamente'
            : 'Parte actualizado y firmado',
        )
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch (e) {
      // Error de red — encolar para reintento automático
      try {
        await enqueueParte({ token, payload })
        await refreshPending()
        setSuccess(
          'Conexión perdida: parte guardado en este móvil. Se enviará automáticamente cuando vuelva la red.',
        )
      } catch {
        setError(e instanceof Error ? e.message : 'Error de red')
      }
    } finally {
      setSaving(false)
    }
  }

  const total = horasOrd + horasExt + horasNoc

  // Modal cláusula RGPD bloqueante (primer acceso)
  if (showConsent) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/70 p-4">
        <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
          <h2 className="text-lg font-medium text-stone-900">Antes de empezar</h2>
          <p className="mt-1 text-sm text-stone-600">
            Lee esta información sobre el tratamiento de tus datos. Solo tienes que aceptarla la
            primera vez.
          </p>
          <div className="mt-3 max-h-64 overflow-y-auto rounded border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700 whitespace-pre-line">
            {CONSENT_TEXT}
          </div>
          {consentError && (
            <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              ⚠️ {consentError}
            </div>
          )}
          <button
            type="button"
            onClick={aceptarConsent}
            disabled={acceptingConsent}
            className="mt-4 w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {acceptingConsent ? 'Guardando…' : 'He leído y acepto'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      {/* Saludo */}
      <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
        <div className="text-xs uppercase tracking-wider text-stone-500">Bienvenido</div>
        <div className="mt-1 text-lg font-medium text-stone-900">{employee.nombre.trim()}</div>
      </div>

      {/* Banner offline / pendientes de sincronizar */}
      {(!isOnline || pendingCount > 0) && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${
          !isOnline
            ? 'border-amber-300 bg-amber-50 text-amber-900'
            : 'border-blue-300 bg-blue-50 text-blue-900'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              {!isOnline && <div>📵 Sin conexión. Lo que guardes se enviará al volver.</div>}
              {pendingCount > 0 && (
                <div>
                  ⏳ {pendingCount} parte{pendingCount > 1 ? 's' : ''} esperando enviar.
                </div>
              )}
            </div>
            {isOnline && pendingCount > 0 && (
              <button
                type="button"
                onClick={tryDrain}
                disabled={draining}
                className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {draining ? 'Enviando…' : 'Reintentar'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Acumulados */}
      {stats && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-stone-200 bg-white p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Hoy</div>
            <div className="mt-1 text-xl font-light tabular-nums">
              {Number(stats.horas_hoy).toFixed(1)}<span className="text-sm text-stone-400">h</span>
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Semana</div>
            <div className="mt-1 text-xl font-light tabular-nums">
              {Number(stats.horas_semana).toFixed(1)}<span className="text-sm text-stone-400">h</span>
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Mes</div>
            <div className="mt-1 text-xl font-light tabular-nums">
              {Number(stats.horas_mes).toFixed(0)}<span className="text-sm text-stone-400">h</span>
            </div>
            {stats.dias_pendientes_mes > 0 && (
              <div className="mt-1 text-[10px] text-amber-700">
                {stats.dias_pendientes_mes} día{stats.dias_pendientes_mes > 1 ? 's' : ''} sin parte
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asignación del cuadrante */}
      {assignmentHoy && assignProj && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-emerald-900">
            Asignación de hoy
          </div>
          <div className="mt-1 font-medium text-emerald-900">
            {assignProj.code}
            {assignProj.name ? ` · ${assignProj.name}` : ''}
          </div>
          {assignmentHoy.jornada_esperada_horas && (
            <div className="text-xs text-emerald-800">
              Jornada esperada: {Number(assignmentHoy.jornada_esperada_horas)} h
            </div>
          )}
          {assignmentHoy.notas && (
            <div className="mt-1 text-xs text-emerald-800">{assignmentHoy.notas}</div>
          )}
        </div>
      )}

      {/* Estado parte hoy: si ya hay y está firmado */}
      {parteHoy?.worker_signed_at && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ Parte de hoy firmado a las{' '}
          {new Date(parteHoy.worker_signed_at).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          . Puedes editarlo si te has equivocado.
        </div>
      )}

      {/* Form parte */}
      <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
          {parteHoy ? 'Editar parte' : 'Registrar parte'}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">Día</label>
            <div className="mt-1 inline-flex rounded-lg border border-stone-300 p-0.5">
              <button
                type="button"
                onClick={() => setFecha(today)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  fecha === today ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setFecha(yesterdayStr)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  fecha === yesterdayStr ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                Ayer
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Proyecto donde has trabajado
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
            >
              <option value="">— Sin proyecto específico</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name ? `· ${p.name}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              {assignmentHoy
                ? 'Te he pre-rellenado el proyecto de tu cuadrante. Cámbialo si has trabajado en otro.'
                : 'Si no estás seguro o has trabajado en oficina/almacén, déjalo vacío.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Ordinarias
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={horasOrd}
                onChange={(e) => setHorasOrd(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Extra</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={horasExt}
                onChange={(e) => setHorasExt(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">
                Nocturnas
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={horasNoc}
                onChange={(e) => setHorasNoc(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-center text-lg tabular-nums"
              />
            </div>
          </div>

          <div className="rounded bg-stone-100 p-2 text-center text-sm text-stone-600">
            Total: <span className="font-medium tabular-nums">{total.toFixed(2)} h</span>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Observaciones <span className="text-stone-400">(opcional)</span>
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="¿Qué has hecho hoy? ej: solado planta 2…"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Firma digital — checkbox legal */}
          <label className="flex items-start gap-2 rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={confirmaVeracidad}
              onChange={(e) => setConfirmaVeracidad(e.target.checked)}
              className="mt-0.5 h-5 w-5 cursor-pointer"
            />
            <span className="text-stone-700">
              <strong>Confirmo</strong> que las horas y proyecto son correctos. Al guardar quedará
              registrado con mi nombre, fecha y hora.
            </span>
          </label>

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
            onClick={guardar}
            disabled={saving || total === 0 || !confirmaVeracidad}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {saving
              ? 'Guardando…'
              : !confirmaVeracidad
                ? 'Marca la casilla para firmar y guardar'
                : parteHoy
                  ? 'Actualizar y firmar parte'
                  : 'Firmar y guardar parte'}
          </button>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Link
          href={`/portal/trabajador/${token}/tickets`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          📷 Tickets
        </Link>
        <Link
          href={`/portal/trabajador/${token}/gastos`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          💼 Gastos día
        </Link>
        <Link
          href={`/portal/trabajador/${token}/historial`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          📅 Mis horas
        </Link>
      </div>

      {/* Últimos 7 días */}
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Últimos 7 días
        </h2>
        {ultimosDias.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500">
            No has registrado partes recientes.
          </div>
        ) : (
          <ul className="space-y-2">
            {ultimosDias.map((r) => {
              const proj = singleProj(r.project)
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-stone-500">{r.fecha}</span>
                    <span className="tabular-nums font-medium">{totalHoras(r).toFixed(2)} h</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-stone-700">
                    {proj ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {proj.code}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">— sin proyecto —</span>
                    )}
                    {r.worker_signed_at && (
                      <span className="text-xs text-emerald-700" title="Parte firmado">
                        ✓ firmado
                      </span>
                    )}
                  </div>
                  {r.observaciones && (
                    <div className="mt-1 text-xs text-stone-500">{r.observaciones}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
