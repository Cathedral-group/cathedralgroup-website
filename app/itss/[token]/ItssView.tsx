'use client'

import { useMemo } from 'react'

interface ItssRecord {
  id: string
  fecha: string
  employee_id: string
  employee_nombre: string | null
  employee_nif: string | null
  horas_ordinarias: number | null
  horas_extra: number | null
  horas_nocturnas: number | null
  horas_total: number | null
  fuente: string | null
  worker_signed_at: string | null
  hash_registro: string | null
  modificado_at: string | null
  modificado_motivo: string | null
  project_code: string | null
}

interface Props {
  token: string
  company: { razon_social: string; cif: string }
  inspector: string
  scope: { desde: string | null; hasta: string | null; employee_id: string | null }
  expiresAt: string
  records: ItssRecord[]
}

interface EmployeeStats {
  nombre: string
  nif: string
  total_horas: number
  dias: number
}

export default function ItssView({
  company,
  inspector,
  scope,
  expiresAt,
  records,
}: Props) {
  const summary = useMemo(() => {
    const map = new Map<string, EmployeeStats>()
    for (const r of records) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          nombre: r.employee_nombre ?? '',
          nif: r.employee_nif ?? '',
          total_horas: 0,
          dias: 0,
        })
      }
      const s = map.get(r.employee_id)!
      s.total_horas += Number(r.horas_total ?? 0)
      s.dias += 1
    }
    return Array.from(map.entries()).map(([id, s]) => ({ employee_id: id, ...s }))
  }, [records])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 print:py-0">
      <style>{`@media print {
        body { background: white !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 1.5cm; }
      }`}</style>

      <div className="mb-4 flex items-center justify-end no-print">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800"
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      {/* Cabecera */}
      <div className="mb-5 rounded-lg border border-stone-200 bg-white p-5 print:border-none">
        <h1 className="text-xl font-medium text-stone-900">
          Registro horario — Acceso Inspección de Trabajo
        </h1>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-stone-500">Empresa:</span>{' '}
            <span className="font-medium">{company.razon_social}</span>
          </div>
          <div>
            <span className="text-stone-500">CIF:</span>{' '}
            <span className="font-mono">{company.cif}</span>
          </div>
          {inspector && (
            <div>
              <span className="text-stone-500">Inspector:</span>{' '}
              <span className="font-medium">{inspector}</span>
            </div>
          )}
          <div>
            <span className="text-stone-500">Token expira:</span>{' '}
            {new Date(expiresAt).toLocaleDateString('es-ES')}
          </div>
          {(scope.desde || scope.hasta) && (
            <div className="sm:col-span-2">
              <span className="text-stone-500">Rango:</span>{' '}
              {scope.desde ?? '—'} a {scope.hasta ?? '—'}
            </div>
          )}
        </div>
      </div>

      {/* Resumen empleados */}
      {summary.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
            Resumen por trabajador ({summary.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Trabajador</th>
                  <th className="px-4 py-2.5">NIF</th>
                  <th className="px-4 py-2.5 text-right">Días</th>
                  <th className="px-4 py-2.5 text-right">Total horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {summary.map((s) => (
                  <tr key={s.employee_id}>
                    <td className="px-4 py-2.5 font-medium">{s.nombre}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{s.nif}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.dias}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {s.total_horas.toFixed(2)} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detalle */}
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Detalle ({records.length} registros)
        </h2>
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            No hay registros en el rango autorizado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 text-left uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Trabajador</th>
                  <th className="px-3 py-2">NIF</th>
                  <th className="px-3 py-2">Proyecto</th>
                  <th className="px-3 py-2 text-right">Ord</th>
                  <th className="px-3 py-2 text-right">Ext</th>
                  <th className="px-3 py-2 text-right">Noc</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Fuente</th>
                  <th className="px-3 py-2">Firma trabajador</th>
                  <th className="px-3 py-2">Hash SHA-256</th>
                  <th className="px-3 py-2">Modificado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono">{r.fecha}</td>
                    <td className="px-3 py-2">{r.employee_nombre}</td>
                    <td className="px-3 py-2 font-mono">{r.employee_nif}</td>
                    <td className="px-3 py-2">{r.project_code ?? '—'}</td>
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
                      {Number(r.horas_total ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{r.fuente ?? '—'}</td>
                    <td className="px-3 py-2">
                      {r.worker_signed_at
                        ? new Date(r.worker_signed_at).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-stone-500">
                      {r.hash_registro ? r.hash_registro.slice(0, 16) + '…' : '—'}
                    </td>
                    <td className="px-3 py-2 text-stone-500">
                      {r.modificado_at ? (
                        <>
                          {new Date(r.modificado_at).toLocaleDateString('es-ES')}
                          {r.modificado_motivo && (
                            <div className="text-[10px]">{r.modificado_motivo}</div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-lg border border-stone-200 bg-white p-4 text-xs text-stone-600 print:border-stone-400">
        <strong>Nota cumplimiento:</strong> Los datos provienen del registro horario del art.
        34.9 ET y RD-Ley 8/2019. Cada parte lleva: (a) hash SHA-256 calculado por trigger BD
        sobre los campos del registro (garantía de inalterabilidad), (b) firma digital del
        trabajador con timestamp (worker_signed_at), (c) audit de modificaciones (modificado_at
        + motivo si se editó posteriormente). Acceso ITSS read-only auditado: cada consulta
        registra IP y timestamp en access_log. Conservación 4 años.
      </div>
    </div>
  )
}
