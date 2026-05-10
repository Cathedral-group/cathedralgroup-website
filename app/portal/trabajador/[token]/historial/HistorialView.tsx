'use client'

import Link from 'next/link'
import { useMemo } from 'react'

interface ParteRow {
  id: string
  fecha: string
  project_id: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  observaciones: string | null
  fuente: string | null
  hash_registro: string | null
  worker_signed_at: string | null
  modificado_at: string | null
  modificado_motivo: string | null
  project?: { code: string; name?: string | null } | { code: string; name?: string | null }[] | null
}

interface Props {
  token: string
  employee: { nombre: string; nif: string }
  anio: number
  mes: number
  desde: string
  hasta: string
  rows: ParteRow[]
}

const MES_LABEL = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function totalHoras(r: ParteRow): number {
  return (
    Number(r.horas_ordinarias ?? 0) +
    Number(r.horas_extra ?? 0) +
    Number(r.horas_nocturnas ?? 0)
  )
}

export default function HistorialView({
  token,
  employee,
  anio,
  mes,
  desde,
  hasta,
  rows,
}: Props) {
  const total = useMemo(() => rows.reduce((acc, r) => acc + totalHoras(r), 0), [rows])
  const ordTotal = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.horas_ordinarias ?? 0), 0),
    [rows],
  )
  const extTotal = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.horas_extra ?? 0), 0),
    [rows],
  )
  const nocTotal = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.horas_nocturnas ?? 0), 0),
    [rows],
  )

  function navMonth(delta: number) {
    let newMes = mes + delta
    let newAnio = anio
    if (newMes > 12) {
      newMes = 1
      newAnio++
    } else if (newMes < 1) {
      newMes = 12
      newAnio--
    }
    return `/portal/trabajador/${token}/historial?anio=${newAnio}&mes=${newMes}`
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 print:py-0 print:px-0">
      <style>{`@media print {
        body { background: white !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 1.5cm; }
      }`}</style>

      <div className="mb-4 flex items-center justify-between no-print">
        <Link
          href={`/portal/trabajador/${token}`}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Volver
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800"
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      {/* Cabecera (visible en impresión también) */}
      <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4 print:border-none print:p-0">
        <h1 className="text-xl font-medium text-stone-900">Registro horario</h1>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-stone-500">Trabajador:</span>{' '}
            <span className="font-medium">{employee.nombre}</span>
          </div>
          <div>
            <span className="text-stone-500">NIF:</span>{' '}
            <span className="font-mono">{employee.nif}</span>
          </div>
          <div>
            <span className="text-stone-500">Periodo:</span>{' '}
            <span className="font-medium">
              {MES_LABEL[mes]} {anio}
            </span>
          </div>
          <div>
            <span className="text-stone-500">Del:</span> {desde}{' '}
            <span className="text-stone-500">al</span> {hasta}
          </div>
        </div>
      </div>

      {/* Navegación meses */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-2 no-print">
        <Link href={navMonth(-1)} className="rounded px-3 py-1.5 text-sm hover:bg-stone-100">
          ← Mes anterior
        </Link>
        <span className="text-sm font-medium">
          {MES_LABEL[mes]} {anio}
        </span>
        <Link href={navMonth(1)} className="rounded px-3 py-1.5 text-sm hover:bg-stone-100">
          Mes siguiente →
        </Link>
      </div>

      {/* Resumen */}
      <div className="mb-4 grid grid-cols-4 gap-2 print:gap-3">
        <div className="rounded-lg border border-stone-200 bg-white p-3 text-center print:p-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Ordinarias</div>
          <div className="mt-1 text-lg font-light tabular-nums">{ordTotal.toFixed(2)} h</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-3 text-center print:p-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Extra</div>
          <div className="mt-1 text-lg font-light tabular-nums">{extTotal.toFixed(2)} h</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-3 text-center print:p-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Nocturnas</div>
          <div className="mt-1 text-lg font-light tabular-nums">{nocTotal.toFixed(2)} h</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-900 p-3 text-center text-white print:p-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-300">Total mes</div>
          <div className="mt-1 text-lg font-medium tabular-nums">{total.toFixed(2)} h</div>
          <div className="text-[10px] text-stone-400">{rows.length} días</div>
        </div>
      </div>

      {/* Tabla detalle */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500">
          No hay partes en este mes.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white print:border-stone-400">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Proyecto</th>
                <th className="px-3 py-2 text-right">Ord</th>
                <th className="px-3 py-2 text-right">Ext</th>
                <th className="px-3 py-2 text-right">Noc</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Firmado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => {
                const proj = singleProj(r.project)
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono text-xs">{r.fecha}</td>
                    <td className="px-3 py-2 text-xs">
                      {proj ? `${proj.code}${proj.name ? ` · ${proj.name}` : ''}` : '—'}
                      {r.observaciones && (
                        <div className="text-[11px] text-stone-500">{r.observaciones}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(r.horas_ordinarias ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(r.horas_extra ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(r.horas_nocturnas ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {totalHoras(r).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.worker_signed_at
                        ? new Date(r.worker_signed_at).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-center text-[11px] text-stone-400 print:mt-12">
        Documento generado el {new Date().toLocaleString('es-ES')} desde portal trabajador Cathedral
        Group. Cada parte lleva firma digital con timestamp y hash de integridad para cumplimiento
        art. 34.9 ET.
      </div>
    </div>
  )
}
