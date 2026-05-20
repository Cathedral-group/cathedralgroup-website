'use client'

/**
 * Tab "Documentos" dentro de la ficha proyecto (drawer inline en ProjectsView.tsx).
 *
 * Versión compacta de `app/admin/proyectos/[code]/documentos/ProjectDocumentsView.tsx`
 * embebida en el drawer. Lazy-loads docs al abrir el tab para no penalizar el render
 * inicial de la lista de proyectos.
 *
 * Sources consultadas (en orden de prioridad cuando exista):
 *  1. `documents_registry` (matview cross-doc-type, schema multi-doc_type 19-20/05/2026)
 *  2. `invoices`, `quotes`, `documents` filtradas por project_id (fallback hoy operativo)
 *  3. `documents` filtradas por property_id (si el proyecto tiene inmueble vinculado)
 *
 * El endpoint `/api/admin/proyectos/[code]/documentos` resuelve la mejor source
 * disponible y normaliza la respuesta a `RegistryItem[]`. Si el matview aún no
 * existe en BD, devuelve la unión de invoices+quotes+documents.
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

/* ───────── Types ───────── */

interface RegistryItem {
  id: string
  source_table: 'invoices' | 'quotes' | 'documents'
  doc_type: string | null
  doc_category: string | null // facturas | presupuestos | escrituras | contratos | seguros | otros
  number: string | null
  titulo: string | null
  empresa: string | null
  supplier_nif: string | null
  concept: string | null
  importe: number | null
  fecha: string | null // issue_date | fecha_documento
  fecha_vencimiento: string | null
  direction: string | null
  payment_status: string | null
  review_status: string | null
  needs_review: boolean | null
  ai_confidence: number | null
  drive_url: string | null
  original_filename: string | null
  origin: 'project' | 'property' // de qué FK proviene
  edit_path: string // ruta de edición: /admin/facturas?id=...
}

type ChipFilter = 'todos' | 'facturas' | 'presupuestos' | 'contratos' | 'seguros' | 'otros'

interface Props {
  projectId: string
  projectCode: string
  /** Por si en un futuro el row de projects expone property_id. Hoy puede llegar null. */
  propertyId?: string | null
  /** Facturas ya cargadas en ProjectsView; las usamos para mostrar el contador del tab sin esperar al fetch. */
  preloadedInvoiceCount?: number
}

/* ───────── Helpers ───────── */

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return Number(val).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dateStr = d.includes('T') ? d : d + 'T00:00:00'
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ConfBadge({ c }: { c: number | null }) {
  if (c === null || c === undefined) return <span className="text-neutral-300 text-xs">—</span>
  const pct = Math.round(c * 100)
  const cls = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{pct}%</span>
}

function ReviewBadge({ status, needs_review }: { status: string | null; needs_review: boolean | null }) {
  if (needs_review) return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">Revisar</span>
  if (!status) return null
  const map: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-700',
    revisado: 'bg-blue-100 text-blue-700',
    confirmado: 'bg-green-100 text-green-700',
    rechazado: 'bg-red-100 text-red-700',
    error: 'bg-red-100 text-red-700',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${map[status] ?? 'bg-neutral-100 text-neutral-500'}`}>{status}</span>
}

/** Clasifica un row en chip group amigable para el usuario. */
function chipOf(it: RegistryItem): ChipFilter {
  if (it.source_table === 'invoices') return 'facturas'
  if (it.source_table === 'quotes') return 'presupuestos'
  const cat = (it.doc_category ?? '').toLowerCase()
  const type = (it.doc_type ?? '').toLowerCase()
  if (cat === 'contratos' || type.includes('contrato')) return 'contratos'
  if (cat === 'seguros' || type.includes('seguro') || type.includes('poliza')) return 'seguros'
  return 'otros'
}

/* ───────── Component ───────── */

export default function ProjectDocumentsTab({ projectId, projectCode, propertyId = null, preloadedInvoiceCount }: Props) {
  const [items, setItems] = useState<RegistryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<ChipFilter>('todos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetch(`/api/admin/proyectos/${encodeURIComponent(projectCode)}/documentos`, {
      // siempre fresh: el usuario espera ver el último doc clasificado
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json: { items: RegistryItem[] }) => {
        if (!alive) return
        setItems(json.items || [])
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Error cargando documentos')
        setItems([])
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [projectCode, projectId])

  /* ───────── Derived ───────── */

  const projectItems = useMemo(() => (items ?? []).filter((i) => i.origin === 'project'), [items])
  const propertyItems = useMemo(() => (items ?? []).filter((i) => i.origin === 'property'), [items])

  const counts = useMemo(() => {
    const all = projectItems
    const facturas = all.filter((i) => chipOf(i) === 'facturas')
    const presupuestos = all.filter((i) => chipOf(i) === 'presupuestos')
    const contratos = all.filter((i) => chipOf(i) === 'contratos')
    const seguros = all.filter((i) => chipOf(i) === 'seguros')
    const otros = all.filter((i) => chipOf(i) === 'otros')
    const totalFacturas = facturas.reduce((acc, i) => acc + (i.importe ?? 0), 0)
    const pendientes = all.filter((i) => i.needs_review || ['pendiente', 'revisado', 'error'].includes(i.review_status ?? '')).length
    return {
      total: all.length,
      facturas: facturas.length,
      totalFacturas,
      presupuestos: presupuestos.length,
      contratos: contratos.length,
      seguros: seguros.length,
      otros: otros.length,
      pendientes,
    }
  }, [projectItems])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projectItems.filter((i) => {
      if (chip !== 'todos' && chipOf(i) !== chip) return false
      if (!q) return true
      const hay = [i.titulo, i.concept, i.empresa, i.supplier_nif, i.number, i.original_filename]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [projectItems, chip, search])

  /* ───────── Render ───────── */

  // Fallback de contador para el tab antes de que llegue el fetch
  // (se usa también desde ProjectsView para "Documentos · N")
  const totalForTab = items === null ? (preloadedInvoiceCount ?? null) : counts.total

  if (loading && items === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-400">Cargando documentos…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        Error cargando documentos: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiMini label="Total" value={String(counts.total)} />
        <KpiMini label="Facturas" value={String(counts.facturas)} hint={formatEur(counts.totalFacturas)} />
        <KpiMini label="Presupuestos" value={String(counts.presupuestos)} />
        <KpiMini label="Contratos" value={String(counts.contratos)} />
        <KpiMini label="Pendientes revisión" value={String(counts.pendientes)} accent={counts.pendientes > 0 ? 'amber' : undefined} />
      </div>

      {/* Sub-filtros chip por tipo */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['todos', `Todos (${counts.total})`],
          ['facturas', `Facturas (${counts.facturas})`],
          ['presupuestos', `Presupuestos (${counts.presupuestos})`],
          ['contratos', `Contratos (${counts.contratos})`],
          ['seguros', `Seguros (${counts.seguros})`],
          ['otros', `Otros (${counts.otros})`],
        ] as [ChipFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setChip(key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
              chip === key ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar archivo, concepto, NIF, número…"
          className="ml-auto flex-1 min-w-[180px] bg-neutral-50 border border-neutral-200 focus:ring-1 focus:ring-primary focus:outline-none px-3 py-1.5 text-xs rounded"
        />
      </div>

      {/* Link a la vista dedicada (más espacio + acciones avanzadas) */}
      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <Link href={`/admin/proyectos/${projectCode}/documentos`} className="text-primary hover:underline font-medium">
          Abrir vista completa →
        </Link>
        {totalForTab !== null && <span>· {totalForTab} documento{totalForTab === 1 ? '' : 's'} del proyecto</span>}
      </div>

      {/* Lista mixta del proyecto (ordenada por fecha desc) */}
      {visible.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center text-neutral-400 text-sm">
          {search ? 'No hay coincidencias' : 'No hay documentos en esta categoría'}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Título / Nº</th>
                  <th className="text-left p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Empresa / NIF</th>
                  <th className="text-right p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Importe</th>
                  <th className="text-center p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Estado</th>
                  <th className="text-center p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">IA</th>
                  <th className="text-left p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Fecha</th>
                  <th className="text-right p-3 font-medium text-neutral-600 text-xs uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <tr key={`${it.source_table}-${it.id}`} className="border-b hover:bg-neutral-50">
                    <td className="p-3">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100">
                        {it.doc_type ?? chipOf(it)}
                      </span>
                      {it.direction === 'emitida' && (
                        <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-50 text-blue-500">EMI</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      <div className="font-medium max-w-[260px] truncate">{it.titulo || it.concept || it.original_filename || '(sin título)'}</div>
                      {it.number && <div className="text-neutral-400 mt-0.5 font-mono text-[10px]">{it.number}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{it.empresa || '—'}</div>
                      {it.supplier_nif && <div className="text-neutral-400 font-mono text-[10px]">{it.supplier_nif}</div>}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{formatEur(it.importe)}</td>
                    <td className="p-3 text-center">
                      <ReviewBadge status={it.review_status} needs_review={it.needs_review} />
                    </td>
                    <td className="p-3 text-center">
                      <ConfBadge c={it.ai_confidence} />
                    </td>
                    <td className="p-3 text-xs text-neutral-500">{formatDate(it.fecha)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {it.drive_url && (
                        <a
                          href={it.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mr-2"
                        >
                          Drive ↗
                        </a>
                      )}
                      <Link href={it.edit_path} className="text-xs bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded">
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Documentos del inmueble (escrituras / notas simples) — solo si project.property_id */}
      {propertyId && propertyItems.length > 0 && (
        <section className="pt-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
            Documentos del inmueble · {propertyItems.length}
          </h3>
          <div className="bg-violet-50/40 rounded-lg border border-violet-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-violet-50 border-b border-violet-100">
                    <th className="text-left p-2.5 font-medium text-violet-700 text-xs uppercase tracking-wider">Tipo</th>
                    <th className="text-left p-2.5 font-medium text-violet-700 text-xs uppercase tracking-wider">Título</th>
                    <th className="text-right p-2.5 font-medium text-violet-700 text-xs uppercase tracking-wider">Importe</th>
                    <th className="text-left p-2.5 font-medium text-violet-700 text-xs uppercase tracking-wider">Fecha</th>
                    <th className="text-right p-2.5 font-medium text-violet-700 text-xs uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {propertyItems.map((it) => (
                    <tr key={`prop-${it.source_table}-${it.id}`} className="border-b border-violet-50 hover:bg-violet-50/60">
                      <td className="p-2.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-700">
                          {it.doc_type ?? 'documento'}
                        </span>
                      </td>
                      <td className="p-2.5 text-xs">{it.titulo || it.original_filename || '(sin título)'}</td>
                      <td className="p-2.5 text-right font-mono text-xs">{formatEur(it.importe)}</td>
                      <td className="p-2.5 text-xs text-neutral-500">{formatDate(it.fecha)}</td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {it.drive_url && (
                          <a href={it.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mr-2">
                            Drive ↗
                          </a>
                        )}
                        <Link href={it.edit_path} className="text-xs bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function KpiMini({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: 'amber' }) {
  const accentCls = accent === 'amber' ? 'text-amber-600' : 'text-neutral-900'
  return (
    <div className="bg-white border border-neutral-100 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
      <p className={`text-lg font-medium mt-0.5 ${accentCls}`}>{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  )
}
