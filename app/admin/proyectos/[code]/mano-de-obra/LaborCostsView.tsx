'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface ProjectLocation {
  id: string
  lat: number
  lng: number
  radio_m: number
  direccion: string | null
  updated_at: string | null
}

interface Project {
  id: string
  code: string
  name?: string | null
  description?: string | null
  status: string | null
}

interface EmployeeRef {
  id: string
  nombre: string | null
  nif?: string | null
}

interface LaborCostRow {
  id: string
  anio: number
  mes: number
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  horas_total: number | null
  coste_hora_empresa: number | null
  coste_imputado_total: number | null
  source: string
  payroll_id: string | null
  calculado_at: string
  employee: EmployeeRef | EmployeeRef[] | null
}

interface TimeRecordRow {
  id: string
  fecha: string
  employee_id: string
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  observaciones: string | null
  fuente: string | null
  employee: EmployeeRef | EmployeeRef[] | null
}

interface Props {
  project: Project
  laborCosts: LaborCostRow[]
  timeRecords: TimeRecordRow[]
  location: ProjectLocation | null
}

const MES_LABEL = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n))
}

function employeeName(e: EmployeeRef | EmployeeRef[] | null): string {
  if (!e) return '—'
  const r = Array.isArray(e) ? e[0] : e
  if (!r) return '—'
  return (r.nombre ?? '').trim() || '—'
}

export default function LaborCostsView({ project, laborCosts, timeRecords, location: initialLocation }: Props) {
  const [location, setLocation] = useState<ProjectLocation | null>(initialLocation)
  const [editLocation, setEditLocation] = useState(false)
  const [locLat, setLocLat] = useState<string>(initialLocation ? String(initialLocation.lat) : '')
  const [locLng, setLocLng] = useState<string>(initialLocation ? String(initialLocation.lng) : '')
  const [locRadio, setLocRadio] = useState<number>(initialLocation?.radio_m ?? 300)
  const [locDireccion, setLocDireccion] = useState(initialLocation?.direccion ?? '')
  const [savingLoc, setSavingLoc] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const today = new Date()
  const [recalcAnio, setRecalcAnio] = useState(today.getFullYear())
  const [recalcMes, setRecalcMes] = useState(today.getMonth() + 1)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)
  const [recalcError, setRecalcError] = useState<string | null>(null)

  const totalImputado = useMemo(
    () => laborCosts.reduce((acc, r) => acc + Number(r.coste_imputado_total ?? 0), 0),
    [laborCosts],
  )
  const totalHoras = useMemo(
    () => laborCosts.reduce((acc, r) => acc + Number(r.horas_total ?? 0), 0),
    [laborCosts],
  )
  const empleadosUnicos = useMemo(() => {
    const ids = new Set<string>()
    for (const r of laborCosts) {
      const e = Array.isArray(r.employee) ? r.employee[0] : r.employee
      if (e?.id) ids.add(e.id)
    }
    return ids.size
  }, [laborCosts])

  async function saveLocation() {
    setSavingLoc(true)
    setLocError(null)
    const lat = parseFloat(locLat)
    const lng = parseFloat(locLng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocError('Coordenadas inválidas')
      setSavingLoc(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/proyectos/${project.code}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          radio_m: locRadio,
          direccion: locDireccion.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setLocError(json.error ?? 'Error al guardar')
      } else {
        setLocation(json.location)
        setEditLocation(false)
      }
    } catch (e) {
      setLocError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSavingLoc(false)
    }
  }

  async function recalcular() {
    setRecalculating(true)
    setRecalcError(null)
    setRecalcResult(null)
    try {
      const res = await fetch(`/api/admin/proyectos/${project.code}/labor-costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio: recalcAnio, mes: recalcMes }),
      })
      const json = await res.json()
      if (!res.ok) {
        setRecalcError(json.error ?? 'Error desconocido')
      } else {
        const r = json.result
        setRecalcResult(
          `Recalculado ${r.periodo.mes}/${r.periodo.anio}. ${r.rows_processed} filas. Total imputado: ${eur(r.total_coste_imputado)}.`,
        )
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e) {
      setRecalcError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setRecalculating(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/proyectos" className="hover:text-stone-900">
              Proyectos
            </Link>
            <span>›</span>
            <Link href={`/admin/proyectos/${project.code}/documentos`} className="hover:text-stone-900">
              {project.code}
            </Link>
            <span>›</span>
            <span className="text-stone-900">Mano de obra</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Mano de obra interna — {project.code}
          </h1>
          {(project.name || project.description) && (
            <p className="mt-1 text-sm text-stone-600">{project.name ?? project.description}</p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* KPIs */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-stone-500">Coste total imputado</div>
            <div className="mt-2 text-2xl font-light text-stone-900">{eur(totalImputado)}</div>
            <div className="mt-1 text-xs text-stone-500">Suma agregado mensual</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-stone-500">Horas totales</div>
            <div className="mt-2 text-2xl font-light text-stone-900">{totalHoras.toFixed(2)} h</div>
            <div className="mt-1 text-xs text-stone-500">Ordinarias + extra + nocturnas</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-stone-500">Empleados imputados</div>
            <div className="mt-2 text-2xl font-light text-stone-900">{empleadosUnicos}</div>
            <div className="mt-1 text-xs text-stone-500">Distintos en el proyecto</div>
          </div>
        </div>

        {/* Geofencing del proyecto */}
        <div className="mb-6 rounded-lg border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
                📍 Geofencing del proyecto
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Coordenadas GPS para validar dónde estaban los trabajadores al fichar.
                Aviso informativo, no bloqueante.
              </p>
            </div>
            {!editLocation && (
              <button
                type="button"
                onClick={() => setEditLocation(true)}
                className="rounded border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50"
              >
                {location ? 'Editar' : '+ Configurar'}
              </button>
            )}
          </div>

          {!editLocation && location && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <span className="text-stone-500">Latitud:</span>{' '}
                <span className="font-mono text-xs">{Number(location.lat).toFixed(5)}</span>
              </div>
              <div>
                <span className="text-stone-500">Longitud:</span>{' '}
                <span className="font-mono text-xs">{Number(location.lng).toFixed(5)}</span>
              </div>
              <div>
                <span className="text-stone-500">Radio:</span>{' '}
                <span className="font-medium tabular-nums">{location.radio_m} m</span>
              </div>
              <div>
                <a
                  href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver en Google Maps →
                </a>
              </div>
              {location.direccion && (
                <div className="col-span-full text-xs text-stone-600">
                  📍 {location.direccion}
                </div>
              )}
            </div>
          )}

          {!editLocation && !location && (
            <p className="mt-3 text-xs text-amber-700">
              ⚠ Sin geofence. Los partes no podrán validar ubicación al fichar.
            </p>
          )}

          {editLocation && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Latitud *
                </label>
                <input
                  type="number"
                  step="0.0000001"
                  value={locLat}
                  onChange={(e) => setLocLat(e.target.value)}
                  placeholder="40.4168"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Longitud *
                </label>
                <input
                  type="number"
                  step="0.0000001"
                  value={locLng}
                  onChange={(e) => setLocLng(e.target.value)}
                  placeholder="-3.7038"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Radio (metros)
                </label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  step="50"
                  value={locRadio}
                  onChange={(e) => setLocRadio(parseInt(e.target.value, 10) || 300)}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
                />
                <p className="mt-1 text-[10px] text-stone-500">
                  Default 300m — Madrid centro tiene mucha imprecisión GPS por edificios
                </p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-stone-500">
                  Dirección (opcional)
                </label>
                <input
                  type="text"
                  value={locDireccion}
                  onChange={(e) => setLocDireccion(e.target.value)}
                  placeholder="C/ Ejemplo 12, Madrid"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              {locError && (
                <div className="sm:col-span-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                  ⚠️ {locError}
                </div>
              )}
              <div className="sm:col-span-2 flex gap-2">
                <button
                  type="button"
                  onClick={saveLocation}
                  disabled={savingLoc}
                  className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {savingLoc ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditLocation(false)
                    setLocError(null)
                  }}
                  className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
                >
                  Cancelar
                </button>
              </div>
              <p className="sm:col-span-2 text-[11px] text-stone-500">
                Tip: copia la URL de Google Maps del proyecto, las coordenadas aparecen en el formato @40.4168,-3.7038
              </p>
            </div>
          )}
        </div>

        {/* Recalcular */}
        <div className="mb-8 rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-medium uppercase tracking-wider text-stone-700">
            Recalcular imputación
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Recalcula el agregado mensual a partir de los partes de horas + nóminas del periodo.
            Idempotente.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Año</label>
              <input
                type="number"
                min={2020}
                max={2100}
                value={recalcAnio}
                onChange={(e) => setRecalcAnio(parseInt(e.target.value, 10))}
                className="mt-1 w-24 rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-stone-500">Mes</label>
              <select
                value={recalcMes}
                onChange={(e) => setRecalcMes(parseInt(e.target.value, 10))}
                className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {MES_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={recalcular}
              disabled={recalculating}
              className="rounded bg-stone-900 px-4 py-2 text-sm text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {recalculating ? 'Recalculando…' : 'Recalcular mes'}
            </button>
            {recalcResult && <span className="text-sm text-emerald-700">{recalcResult}</span>}
            {recalcError && <span className="text-sm text-red-700">⚠️ {recalcError}</span>}
          </div>
        </div>

        {/* Agregado mensual */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-stone-700">
            Agregado mensual ({laborCosts.length})
          </h2>
          {laborCosts.length === 0 ? (
            <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
              No hay imputaciones calculadas aún. Recalcula un mes con partes de horas asignados a este proyecto.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5">Periodo</th>
                    <th className="px-4 py-2.5">Empleado</th>
                    <th className="px-4 py-2.5 text-right">H. Ord</th>
                    <th className="px-4 py-2.5 text-right">H. Ext</th>
                    <th className="px-4 py-2.5 text-right">H. Noc</th>
                    <th className="px-4 py-2.5 text-right">Total h</th>
                    <th className="px-4 py-2.5 text-right">€/h</th>
                    <th className="px-4 py-2.5 text-right">Imputado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {laborCosts.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {MES_LABEL[r.mes]} {r.anio}
                      </td>
                      <td className="px-4 py-2.5">{employeeName(r.employee)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_ordinarias ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_extra ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_nocturnas ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {Number(r.horas_total ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {eur(r.coste_hora_empresa)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {eur(r.coste_imputado_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Partes de horas crudos */}
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-stone-700">
            Partes de horas asignados ({timeRecords.length})
          </h2>
          {timeRecords.length === 0 ? (
            <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
              No hay partes de horas asignados a este proyecto.{' '}
              <Link href="/admin/personal/dietario" className="underline hover:text-stone-700">
                Ir al dietario
              </Link>{' '}
              para crear o reasignar partes.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Empleado</th>
                    <th className="px-4 py-2.5 text-right">H. Ord</th>
                    <th className="px-4 py-2.5 text-right">H. Ext</th>
                    <th className="px-4 py-2.5 text-right">H. Noc</th>
                    <th className="px-4 py-2.5">Fuente</th>
                    <th className="px-4 py-2.5">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {timeRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.fecha}</td>
                      <td className="px-4 py-2.5">{employeeName(r.employee)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_ordinarias ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_extra ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(r.horas_nocturnas ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-stone-500">{r.fuente ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-stone-500">
                        {r.observaciones ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
