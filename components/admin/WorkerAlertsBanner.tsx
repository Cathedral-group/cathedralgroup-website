'use client'

/**
 * Widget de alertas para /admin/personal — server-side fetch a /api/admin/personal/alerts.
 *
 * Muestra: trabajadores sin parte ayer, ausencias pendientes, tickets pendientes,
 * gastos por reembolsar. Cada banner enlaza a la sección admin correspondiente.
 *
 * Auto-refresh cada 5min.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface AlertsData {
  ayer_laborable: boolean
  sin_parte_ayer: { id: string; nombre: string | null; nif: string | null }[]
  ausencias_pendientes: {
    count: number
    sample: { id: string; tipo: string; fecha_inicio: string; employee: { nombre?: string } | { nombre?: string }[] | null }[]
  }
  tickets_pendientes: {
    count: number
    sample: { id: string; doc_type: string }[]
  }
  gastos_por_reembolsar: {
    count: number
    sample: { id: string; fecha: string; tipo: string }[]
  }
}

export default function WorkerAlertsBanner() {
  const [data, setData] = useState<AlertsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/personal/alerts', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as AlertsData
      setData(json)
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  if (loading || !data) return null

  const total =
    data.sin_parte_ayer.length +
    data.ausencias_pendientes.count +
    data.tickets_pendientes.count +
    data.gastos_por_reembolsar.count

  if (total === 0) return null

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-amber-900">
        ⚠️ Acciones pendientes ({total})
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {data.sin_parte_ayer.length > 0 && (
          <Link
            href="/admin/personal/dietario"
            className="rounded border border-amber-300 bg-white p-2 hover:bg-amber-100"
          >
            <div className="text-xs uppercase tracking-wider text-stone-500">
              Sin parte ayer
            </div>
            <div className="mt-1 text-lg font-medium tabular-nums text-amber-900">
              {data.sin_parte_ayer.length}
            </div>
            <div className="text-[10px] text-stone-600 truncate">
              {data.sin_parte_ayer.map((e) => (e.nombre ?? '').trim().split(' ')[0]).join(', ')}
            </div>
          </Link>
        )}
        {data.ausencias_pendientes.count > 0 && (
          <Link
            href="/admin/personal/ausencias"
            className="rounded border border-amber-300 bg-white p-2 hover:bg-amber-100"
          >
            <div className="text-xs uppercase tracking-wider text-stone-500">
              Ausencias por aprobar
            </div>
            <div className="mt-1 text-lg font-medium tabular-nums text-amber-900">
              {data.ausencias_pendientes.count}
            </div>
            <div className="text-[10px] text-stone-600 truncate">
              {data.ausencias_pendientes.sample
                .slice(0, 3)
                .map((a) => a.tipo.replace('_', ' '))
                .join(', ')}
            </div>
          </Link>
        )}
        {data.tickets_pendientes.count > 0 && (
          <Link
            href="/admin/personal/tickets-trabajador"
            className="rounded border border-amber-300 bg-white p-2 hover:bg-amber-100"
          >
            <div className="text-xs uppercase tracking-wider text-stone-500">
              Tickets por revisar
            </div>
            <div className="mt-1 text-lg font-medium tabular-nums text-amber-900">
              {data.tickets_pendientes.count}
            </div>
            <div className="text-[10px] text-stone-600">
              Subidos por trabajadores
            </div>
          </Link>
        )}
        {data.gastos_por_reembolsar.count > 0 && (
          <Link
            href="/admin/personal/gastos-trabajador"
            className="rounded border border-amber-300 bg-white p-2 hover:bg-amber-100"
          >
            <div className="text-xs uppercase tracking-wider text-stone-500">
              Por reembolsar
            </div>
            <div className="mt-1 text-lg font-medium tabular-nums text-amber-900">
              {data.gastos_por_reembolsar.count}
            </div>
            <div className="text-[10px] text-stone-600">
              Bolsillo trabajador
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
