'use client'

/**
 * <ProjectMarginTab> — Tab "Margen" ficha proyecto Cathedral admin.
 *
 * Muestra rentabilidad real obra filtrando invoices por cost_scope:
 *   - Ingresos                (direction='emitida')
 *   - Gastos directos         (cost_scope='proyecto_directo')
 *   - Gastos indirectos       (cost_scope='proyecto_indirecto')
 *   - Retención 5% LOE pendiente (certificaciones_obra)
 *   - Desviación presupuesto  (certificado vs presupuesto_inicial)
 *
 * Definición contable: PGC RICAC 14/04/2015.
 *
 * Lazy load: el fetch sólo se dispara al primer mount del tab.
 * Recibe { projectId, projectCode } del padre <ProjectsView>.
 */

import { useEffect, useState } from 'react'

interface MargenData {
  project_id: string
  company_id: string
  total_ingresos: number
  total_facturas_emitidas: number
  total_gastos_directos: number
  total_facturas_directas: number
  total_gastos_indirectos: number
  total_facturas_indirectas: number
  retencion_acumulada: number
  retencion_liberada: number
  retencion_pendiente: number
  presupuesto_inicial: number | null
  budget_estimated: number | null
  presupuesto_referencia: number | null
  presupuesto_certificado: number
  margen_bruto: number
  margen_neto: number
  margen_bruto_pct: number
  margen_neto_pct: number
  desviacion_presupuesto: number
  desviacion_presupuesto_pct: number
  fecha_calculo: string
}

interface MargenResponse {
  project: {
    id: string
    code: string
    name: string | null
    presupuesto_inicial: number | null
    budget_estimated: number | null
  }
  margen: MargenData
  computed_at: string
}

interface Props {
  projectId: string
  projectCode: string
}

function currency(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `${Number(v).toFixed(1)}%`
}

function marginColor(p: number): string {
  if (p >= 20) return 'text-green-600'
  if (p >= 10) return 'text-amber-600'
  return 'text-red-600'
}

function marginBgColor(p: number): string {
  if (p >= 20) return 'bg-green-50 border-green-200'
  if (p >= 10) return 'bg-amber-50 border-amber-200'
  return 'bg-red-50 border-red-200'
}

export default function ProjectMarginTab({ projectId, projectCode }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MargenResponse | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    fetch(`/api/admin/proyectos/${encodeURIComponent(projectCode)}/margen`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<MargenResponse>
      })
      .then((json) => {
        if (!alive) return
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [projectId, projectCode])

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-neutral-400">
        Calculando margen…
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 px-4 bg-red-50 border border-red-200 text-sm text-red-700">
        Error: {error}
      </div>
    )
  }

  if (!data || !data.margen) {
    return (
      <div className="py-8 text-center text-sm text-neutral-400">
        Sin datos de margen.
      </div>
    )
  }

  const m = data.margen
  const ingresos = Number(m.total_ingresos) || 0
  const directos = Number(m.total_gastos_directos) || 0
  const indirectos = Number(m.total_gastos_indirectos) || 0
  const margenBruto = Number(m.margen_bruto) || 0
  const margenBrutoPct = Number(m.margen_bruto_pct) || 0
  const margenNeto = Number(m.margen_neto) || 0
  const margenNetoPct = Number(m.margen_neto_pct) || 0
  const retencionPendiente = Number(m.retencion_pendiente) || 0
  const presupuestoRef = m.presupuesto_referencia != null ? Number(m.presupuesto_referencia) : null
  const presupuestoCertificado = Number(m.presupuesto_certificado) || 0
  const desviacion = Number(m.desviacion_presupuesto) || 0
  const desviacionPct = Number(m.desviacion_presupuesto_pct) || 0

  // Porcentajes sobre ingresos para la tabla desglose
  const pctDirectos = ingresos > 0 ? (directos / ingresos) * 100 : 0
  const pctIndirectos = ingresos > 0 ? (indirectos / ingresos) * 100 : 0

  return (
    <div className="space-y-6">
      {/* ─── KPI cards arriba (4) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Ingresos */}
        <div className={`border p-4 ${ingresos > 0 ? 'bg-green-50 border-green-200' : 'bg-neutral-50 border-neutral-200'}`}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
            Ingresos
          </div>
          <div className={`text-xl font-semibold ${ingresos > 0 ? 'text-green-700' : 'text-neutral-400'}`}>
            {currency(ingresos)}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            {m.total_facturas_emitidas} factura{m.total_facturas_emitidas === 1 ? '' : 's'} emitida{m.total_facturas_emitidas === 1 ? '' : 's'}
          </div>
        </div>

        {/* 2. Gastos directos */}
        <div className="border p-4 bg-red-50 border-red-200">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
            Gastos directos
          </div>
          <div className="text-xl font-semibold text-red-700">
            {currency(directos)}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            {m.total_facturas_directas} factura{m.total_facturas_directas === 1 ? '' : 's'} · imputable obra
          </div>
        </div>

        {/* 3. Margen bruto + % */}
        <div className={`border p-4 ${marginBgColor(margenBrutoPct)}`}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
            Margen bruto
          </div>
          <div className={`text-xl font-semibold ${marginColor(margenBrutoPct)}`}>
            {currency(margenBruto)}
          </div>
          <div className={`text-[10px] mt-1 font-medium ${marginColor(margenBrutoPct)}`}>
            {pct(margenBrutoPct)} sobre ingresos
          </div>
        </div>

        {/* 4. Retención 5% LOE pendiente */}
        <div className="border p-4 bg-violet-50 border-violet-200">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
            Retención 5% LOE
          </div>
          <div className="text-xl font-semibold text-violet-700">
            {currency(retencionPendiente)}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">
            pendiente liberar
          </div>
        </div>
      </div>

      {/* ─── Desglose ─── */}
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
          Desglose
        </h3>
        <div className="overflow-x-auto border border-neutral-100">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  Categoría
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  Importe
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  % sobre ingresos
                </th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  N facturas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              <tr>
                <td className="px-3 py-2 font-medium">Ingresos</td>
                <td className="px-3 py-2 text-right text-green-600 font-medium">
                  {currency(ingresos)}
                </td>
                <td className="px-3 py-2 text-right text-neutral-500">100%</td>
                <td className="px-3 py-2 text-right">{m.total_facturas_emitidas}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 pl-6 text-neutral-700">− Gastos directos</td>
                <td className="px-3 py-2 text-right text-red-600">
                  −{currency(directos)}
                </td>
                <td className="px-3 py-2 text-right text-neutral-500">
                  {pct(pctDirectos)}
                </td>
                <td className="px-3 py-2 text-right">{m.total_facturas_directas}</td>
              </tr>
              <tr className="bg-neutral-50">
                <td className="px-3 py-2 font-medium">= Margen bruto</td>
                <td className={`px-3 py-2 text-right font-medium ${marginColor(margenBrutoPct)}`}>
                  {currency(margenBruto)}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${marginColor(margenBrutoPct)}`}>
                  {pct(margenBrutoPct)}
                </td>
                <td className="px-3 py-2 text-right text-neutral-400">—</td>
              </tr>
              <tr>
                <td className="px-3 py-2 pl-6 text-neutral-700">− Gastos indirectos</td>
                <td className="px-3 py-2 text-right text-red-600">
                  −{currency(indirectos)}
                </td>
                <td className="px-3 py-2 text-right text-neutral-500">
                  {pct(pctIndirectos)}
                </td>
                <td className="px-3 py-2 text-right">{m.total_facturas_indirectas}</td>
              </tr>
              <tr className="bg-neutral-50 border-t-2 border-neutral-200">
                <td className="px-3 py-3 font-bold">= Margen neto obra</td>
                <td className={`px-3 py-3 text-right font-bold ${marginColor(margenNetoPct)}`}>
                  {currency(margenNeto)}
                </td>
                <td className={`px-3 py-3 text-right font-bold ${marginColor(margenNetoPct)}`}>
                  {pct(margenNetoPct)}
                </td>
                <td className="px-3 py-3 text-right text-neutral-400">—</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-violet-700">Retención 5% LOE pendiente</td>
                <td className="px-3 py-2 text-right text-violet-700 font-medium">
                  {currency(retencionPendiente)}
                </td>
                <td className="px-3 py-2 text-right text-neutral-400">—</td>
                <td className="px-3 py-2 text-right text-neutral-400">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-neutral-400 mt-2">
          Definición PGC RICAC 14/04/2015. Filtra invoices por <code>cost_scope</code> y <code>direction</code>.
        </p>
      </div>

      {/* ─── Presupuesto vs Real (sólo si hay presupuesto inicial o estimado) ─── */}
      {presupuestoRef != null && presupuestoRef > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
            Presupuesto vs Real
          </h3>
          <div className="overflow-x-auto border border-neutral-100">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Concepto
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Presupuestado
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Certificado
                  </th>
                  <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Desviación
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 font-medium">Total obra</td>
                  <td className="px-3 py-2 text-right">{currency(presupuestoRef)}</td>
                  <td className="px-3 py-2 text-right">{currency(presupuestoCertificado)}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${desviacion < 0 ? 'text-amber-600' : desviacion > 0 ? 'text-red-600' : 'text-neutral-500'}`}
                  >
                    {desviacion >= 0 ? '+' : ''}
                    {currency(desviacion)} ({desviacion >= 0 ? '+' : ''}
                    {pct(desviacionPct)})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-neutral-400 mt-2">
            Referencia:{' '}
            {m.presupuesto_inicial != null
              ? 'presupuesto_inicial (firmado con cliente)'
              : 'budget_estimated (estimación interna — sin presupuesto_inicial)'}
            . Certificado: suma <code>certificaciones_obra.importe_actual</code>.
          </p>
        </div>
      )}

      {/* ─── Botón: ver gastos directos detalle ─── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-neutral-100">
        <a
          href={`/admin/documentos?project_id=${encodeURIComponent(projectId)}&cost_scope=proyecto_directo`}
          className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80"
        >
          Ver gastos directos detalle →
        </a>
        <a
          href={`/admin/documentos?project_id=${encodeURIComponent(projectId)}&cost_scope=proyecto_indirecto`}
          className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80"
        >
          Ver gastos indirectos detalle →
        </a>
        <a
          href={`/admin/facturas?proyecto_code=${encodeURIComponent(projectCode)}`}
          className="inline-block text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-700"
        >
          Todas las facturas →
        </a>
      </div>

      <p className="text-[10px] text-neutral-400 text-right">
        Calculado: {new Date(data.computed_at).toLocaleString('es-ES')}
      </p>
    </div>
  )
}
