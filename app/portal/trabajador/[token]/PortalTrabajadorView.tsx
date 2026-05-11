'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import MisTareasBlock from './MisTareasBlock'
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
  horas_extra_modo?: 'compensar' | 'pagar' | null
  observaciones: string | null
  fuente?: string | null
  worker_signed_at?: string | null
  hora_entrada?: string | null
  hora_salida?: string | null
  project?:
    | { code: string; name?: string | null }
    | { code: string; name?: string | null }[]
    | null
}

interface AssignmentHoy {
  id: string
  fecha?: string
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
  horas_esperadas_semana?: number
  horas_esperadas_mes?: number
  jornada_esperada_hoy?: number
  dias_apuntados_mes: number
  dias_pendientes_mes: number
}

interface OvertimeBalance {
  employee_id: string
  extras_acumuladas: number
  descontadas: number
  saldo_horas: number
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
  assignments: AssignmentHoy[]
  stats: Stats | null
  overtimeBalance: OvertimeBalance | null
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
  assignments,
  stats,
  overtimeBalance,
  consent,
}: Props) {
  // Cláusula RGPD: si necesita aceptación, modal bloqueante
  const [showConsent, setShowConsent] = useState<boolean>(consent.needs_acceptance)
  const [acceptingConsent, setAcceptingConsent] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)

  // Asignación de hoy (para banner verde) y proyecto pre-asignado para fichaje rápido
  const assignmentHoy = assignments.find((a) => a.fecha === today) ?? null
  const assignProj = singleProj(assignmentHoy?.project)
  const projectIdHoy = parteHoy?.project_id ?? assignmentHoy?.project_id ?? ''

  // Jornada esperada hoy
  const jornadaEsperadaHoy = Number(
    stats?.jornada_esperada_hoy ?? assignmentHoy?.jornada_esperada_horas ?? 9,
  )

  // Fichaje entrada/salida
  const [fichando, setFichando] = useState(false)
  const [fichajeMsg, setFichajeMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const horaEntrada = parteHoy?.hora_entrada
  const horaSalida = parteHoy?.hora_salida

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

  async function fichar(tipo: 'entrada' | 'salida') {
    setFichando(true)
    setFichajeMsg(null)
    setError(null)

    // Geo best-effort
    let geoData: { geo_lat?: number; geo_lng?: number; geo_accuracy?: number } = {}
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => resolve(), 2500)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timer)
              geoData = {
                geo_lat: pos.coords.latitude,
                geo_lng: pos.coords.longitude,
                geo_accuracy: Math.round(pos.coords.accuracy),
              }
              resolve()
            },
            () => {
              clearTimeout(timer)
              resolve()
            },
            { timeout: 2000, maximumAge: 30000 },
          )
        })
      } catch {
        // ignore
      }
    }

    try {
      const res = await fetch(`/api/portal/trabajador/${token}/fichaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          project_id: tipo === 'entrada' ? projectIdHoy || null : undefined,
          ...geoData,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al fichar')
        return
      }
      if (tipo === 'entrada') {
        setFichajeMsg(`✓ Entrada fichada a las ${json.hora.slice(0, 5)}`)
      } else {
        const extras = Number(json.horas_extra ?? 0)
        let msg = `✓ Salida fichada a las ${json.hora.slice(0, 5)}. Trabajadas ${json.horas_calculadas}h`
        if (extras > 0) {
          const saldo = Number(json.balance?.saldo_horas ?? 0)
          msg += `. ${extras}h extra al banco (saldo: ${saldo > 0 ? '+' : ''}${saldo.toFixed(1)}h)`
        }
        setFichajeMsg(msg)
      }
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setFichando(false)
    }
  }


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
            {jornadaEsperadaHoy > 0 && (
              <div className="mt-0.5 text-[10px] text-stone-500">
                de {jornadaEsperadaHoy}h esperadas
              </div>
            )}
            {jornadaEsperadaHoy === 0 && (
              <div className="mt-0.5 text-[10px] text-emerald-700">No laborable</div>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Semana</div>
            <div className="mt-1 text-xl font-light tabular-nums">
              {Number(stats.horas_semana).toFixed(1)}<span className="text-sm text-stone-400">h</span>
            </div>
            {stats.horas_esperadas_semana !== undefined && (
              <div className="mt-0.5 text-[10px] text-stone-500">
                de {Number(stats.horas_esperadas_semana).toFixed(0)}h
              </div>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Mes</div>
            <div className="mt-1 text-xl font-light tabular-nums">
              {Number(stats.horas_mes).toFixed(0)}<span className="text-sm text-stone-400">h</span>
            </div>
            {stats.horas_esperadas_mes !== undefined && (
              <div className="mt-0.5 text-[10px] text-stone-500">
                de {Number(stats.horas_esperadas_mes).toFixed(0)}h
              </div>
            )}
            {stats.dias_pendientes_mes > 0 && (
              <div className="mt-1 text-[10px] text-amber-700">
                {stats.dias_pendientes_mes} día{stats.dias_pendientes_mes > 1 ? 's' : ''} sin parte
              </div>
            )}
          </div>
        </div>
      )}

      {/* Banco horas extras */}
      {overtimeBalance && Number(overtimeBalance.saldo_horas) !== 0 && (
        <Link
          href={`/portal/trabajador/${token}/canjes`}
          className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3 hover:bg-stone-50 transition-colors"
        >
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500">
              🪙 Banco horas extras
            </div>
            <div className="mt-1 text-sm text-stone-600">
              Saldo de horas acumuladas. Toca para canjearlas →
            </div>
          </div>
          <div className={`text-2xl font-light tabular-nums ${
            Number(overtimeBalance.saldo_horas) > 0 ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {Number(overtimeBalance.saldo_horas) > 0 ? '+' : ''}
            {Number(overtimeBalance.saldo_horas).toFixed(1)}h
          </div>
        </Link>
      )}

      {/* Mis tareas (bloque encima de la asignación, no emborrona si no hay nada) */}
      <MisTareasBlock token={token} />

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

      {/* Fichaje rápido entrada/salida */}
      <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
          ⏱️ Fichaje rápido
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Pulsa al llegar a la obra y al irte. El sistema calcula tus horas automáticamente.
        </p>
        {(horaEntrada || horaSalida) && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-stone-100 p-2">
              <div className="text-stone-500">Entrada</div>
              <div className="text-base font-medium tabular-nums">
                {horaEntrada ? horaEntrada.slice(0, 5) : '—'}
              </div>
            </div>
            <div className="rounded bg-stone-100 p-2">
              <div className="text-stone-500">Salida</div>
              <div className="text-base font-medium tabular-nums">
                {horaSalida ? horaSalida.slice(0, 5) : '—'}
              </div>
            </div>
          </div>
        )}
        {fichajeMsg && (
          <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
            {fichajeMsg}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fichar('entrada')}
            disabled={fichando || !!horaEntrada}
            className="rounded-lg bg-emerald-700 px-3 py-3 text-base font-medium text-white transition hover:bg-emerald-800 disabled:bg-stone-300 disabled:text-stone-600"
          >
            {horaEntrada ? '✓ Entrada' : '▶️ Entrar ahora'}
          </button>
          <button
            type="button"
            onClick={() => fichar('salida')}
            disabled={fichando || !horaEntrada || !!horaSalida}
            className="rounded-lg bg-rose-700 px-3 py-3 text-base font-medium text-white transition hover:bg-rose-800 disabled:bg-stone-300 disabled:text-stone-600"
          >
            {horaSalida ? '✓ Salida' : '⏹️ Salir ahora'}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-stone-500">
          También puedes meter las horas a mano abajo, sin fichar.
        </p>
      </div>


      {/* Botón ancho prominente: Fichaje detallado */}
      <Link
        href={`/portal/trabajador/${token}/fichaje`}
        className="mb-3 block rounded-lg border-2 border-stone-900 bg-white p-4 text-center font-medium text-stone-900 hover:bg-stone-50"
      >
        ⏱️ Fichaje del día · editar partes
      </Link>

      {/* Menú: 6 botones */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Link
          href={`/portal/trabajador/${token}/calendario`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          📆 Calendario
        </Link>
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
          💼 Gastos
        </Link>
        <Link
          href={`/portal/trabajador/${token}/historial`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          📅 Mis horas
        </Link>
        <Link
          href={`/portal/trabajador/${token}/ausencias`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          🏖️ Ausencias
        </Link>
        <Link
          href={`/portal/trabajador/${token}/configuracion`}
          className="rounded-lg border border-stone-200 bg-white p-3 text-center text-xs text-stone-700 hover:bg-stone-50"
        >
          🔧 Ajustes
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
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-stone-700">
                    {proj ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {proj.code}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">— sin proyecto —</span>
                    )}
                    {Number(r.horas_extra ?? 0) > 0 && r.horas_extra_modo && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          r.horas_extra_modo === 'compensar'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-stone-200 text-stone-700'
                        }`}
                        title={
                          r.horas_extra_modo === 'compensar'
                            ? 'Horas extra al banco para descansar'
                            : 'Horas extra a pagar en nómina'
                        }
                      >
                        {r.horas_extra_modo === 'compensar' ? '🪙' : '💰'} +{Number(r.horas_extra).toFixed(1)}h
                      </span>
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
