'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface Project {
  id: string
  code: string
  name: string
  type: string | null
  status: string | null
  drive_folder_id: string | null
  drive_folder_url: string | null
  zona: string | null
  budget_estimated: number | null
  budget_approved: number | null
  start_date: string | null
  end_date_planned: string | null
  end_date_real: string | null
}

interface AiData {
  supplier_name?: string
  supplier_nif?: string
  categoria_gasto?: string
  [key: string]: unknown
}

interface InvoiceRow {
  id: string
  number: string | null
  concept: string | null
  direction: string | null
  doc_type: string | null
  amount_base: number | null
  vat_amount: number | null
  amount_total: number | null
  payment_status: string | null
  issue_date: string | null
  due_date: string | null
  supplier_nif: string | null
  empresa: string | null
  ai_confidence: number | null
  needs_review: boolean
  review_status: string | null
  drive_url: string | null
  original_filename: string | null
  source: string | null
  ai_data: AiData | null
  created_at: string
}

interface QuoteRow {
  id: string
  number: string | null
  concept: string | null
  direction: string | null
  total: number | null
  subtotal: number | null
  vat_total: number | null
  valid_until: string | null
  supplier_nif: string | null
  empresa: string | null
  ai_confidence: number | null
  needs_review: boolean
  review_status: string | null
  drive_url: string | null
  original_filename: string | null
  source: string | null
  status: string | null
  issue_date: string | null
  created_at: string
}

interface DocumentRow {
  id: string
  titulo: string | null
  doc_type: string | null
  doc_category: string | null
  fecha_documento: string | null
  fecha_vencimiento: string | null
  importe: number | null
  ai_confidence: number | null
  needs_review: boolean
  drive_url: string | null
  original_filename: string | null
  source: string | null
  resumen_ia: string | null
  created_at: string
}

interface Subfolder {
  subfolder_name: string
  drive_folder_id: string
}

interface Props {
  project: Project
  invoices: InvoiceRow[]
  quotes: QuoteRow[]
  documents: DocumentRow[]
  subfolders: Subfolder[]
}

function formatEur(val: number | null | undefined): string {
  if (val === null || val === undefined) return '--'
  return Number(val).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '--'
  const dateStr = d.includes('T') ? d : d + 'T00:00:00'
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ConfBadge({ c }: { c: number | null }) {
  if (c === null) return <span className="text-neutral-400 text-xs">--</span>
  const pct = Math.round(c * 100)
  const cls = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${cls}`}>{pct}%</span>
}

function ReviewBadge({ status, needs_review }: { status: string | null, needs_review?: boolean }) {
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

type Tab = 'todos' | 'facturas' | 'presupuestos' | 'documentos'

export default function ProjectDocumentsView({ project, invoices, quotes, documents, subfolders }: Props) {
  const [tab, setTab] = useState<Tab>('todos')
  const [search, setSearch] = useState('')

  // Stats agregadas
  const stats = useMemo(() => {
    const recibidas = invoices.filter(i => i.direction === 'recibida')
    const emitidas = invoices.filter(i => i.direction === 'emitida')
    const totalRec = recibidas.reduce((acc, i) => acc + (i.amount_total ?? 0), 0)
    const totalEmi = emitidas.reduce((acc, i) => acc + (i.amount_total ?? 0), 0)
    const totalPresup = quotes.reduce((acc, q) => acc + (q.total ?? 0), 0)
    const pendientes =
      invoices.filter(i => i.needs_review || ['pendiente', 'revisado', 'error'].includes(i.review_status ?? '')).length +
      quotes.filter(q => q.needs_review || ['pendiente', 'revisado', 'error'].includes(q.review_status ?? '')).length +
      documents.filter(d => d.needs_review).length
    return { recibidas: recibidas.length, emitidas: emitidas.length, totalRec, totalEmi, totalPresup, pendientes }
  }, [invoices, quotes, documents])

  // Filtrar por search
  const q = search.trim().toLowerCase()
  const matchInvoice = (i: InvoiceRow) =>
    !q ||
    (i.original_filename ?? '').toLowerCase().includes(q) ||
    (i.concept ?? '').toLowerCase().includes(q) ||
    (i.empresa ?? '').toLowerCase().includes(q) ||
    (i.supplier_nif ?? '').toLowerCase().includes(q) ||
    (i.number ?? '').toLowerCase().includes(q)

  const matchQuote = (qt: QuoteRow) =>
    !q ||
    (qt.original_filename ?? '').toLowerCase().includes(q) ||
    (qt.concept ?? '').toLowerCase().includes(q) ||
    (qt.empresa ?? '').toLowerCase().includes(q) ||
    (qt.supplier_nif ?? '').toLowerCase().includes(q) ||
    (qt.number ?? '').toLowerCase().includes(q)

  const matchDoc = (d: DocumentRow) =>
    !q ||
    (d.titulo ?? '').toLowerCase().includes(q) ||
    (d.original_filename ?? '').toLowerCase().includes(q) ||
    (d.doc_type ?? '').toLowerCase().includes(q)

  const filteredInvoices = invoices.filter(matchInvoice)
  const filteredQuotes = quotes.filter(matchQuote)
  const filteredDocs = documents.filter(matchDoc)

  const showInvoices = tab === 'todos' || tab === 'facturas'
  const showQuotes = tab === 'todos' || tab === 'presupuestos'
  const showDocs = tab === 'todos' || tab === 'documentos'

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* Breadcrumb */}
      <div className="text-xs text-neutral-500 mb-2">
        <Link href="/admin/proyectos" className="hover:underline">Proyectos</Link>
        <span className="mx-1">›</span>
        <Link href={`/admin/proyectos?proyecto=${project.code}`} className="hover:underline">{project.code}</Link>
        <span className="mx-1">›</span>
        <span>Documentos</span>
      </div>

      {/* Header proyecto */}
      <div className="mb-5 pb-4 border-b border-neutral-200">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">{project.code} <span className="text-neutral-400 font-light">·</span> {project.name}</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {project.type && <span className="inline-block bg-neutral-100 rounded px-2 py-0.5 mr-2 text-[10px] uppercase font-bold">{project.type}</span>}
              {project.status && <span className="inline-block bg-blue-50 text-blue-700 rounded px-2 py-0.5 mr-2 text-[10px] uppercase font-bold">{project.status}</span>}
              {project.zona && <span className="mr-2">{project.zona}</span>}
            </p>
          </div>
          {project.drive_folder_url && (
            <a href={project.drive_folder_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline">📁 Carpeta Drive del proyecto →</a>
          )}
        </div>
      </div>

      {/* Stats KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-white border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Facturas recibidas</p>
          <p className="text-2xl font-bold text-neutral-800 mt-1">{stats.recibidas}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{formatEur(stats.totalRec)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Facturas emitidas</p>
          <p className="text-2xl font-bold text-neutral-800 mt-1">{stats.emitidas}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{formatEur(stats.totalEmi)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Presupuestos</p>
          <p className="text-2xl font-bold text-neutral-800 mt-1">{quotes.length}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{formatEur(stats.totalPresup)}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Documentos</p>
          <p className="text-2xl font-bold text-neutral-800 mt-1">{documents.length}</p>
          <p className="text-xs text-neutral-500 mt-0.5">contratos, escrituras...</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Pendientes revisión</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{stats.pendientes}</p>
          {stats.pendientes > 0 && (
            <Link href="/admin/revision" className="text-xs text-amber-700 hover:underline mt-0.5 inline-block">→ ir a Revisión</Link>
          )}
        </div>
      </div>

      {/* Subcarpetas Drive del proyecto */}
      {subfolders.length > 0 && (
        <details className="mb-5 bg-neutral-50 rounded-lg border border-neutral-200">
          <summary className="px-4 py-3 cursor-pointer text-xs font-bold uppercase tracking-widest text-neutral-500 hover:bg-neutral-100">
            📂 {subfolders.length} subcarpetas Drive del proyecto
          </summary>
          <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {subfolders.map(sf => (
              <a key={sf.subfolder_name}
                href={`https://drive.google.com/drive/folders/${sf.drive_folder_id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate">
                {sf.subfolder_name}
              </a>
            ))}
          </div>
        </details>
      )}

      {/* Tabs + buscador */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex gap-1 bg-neutral-50 p-1 rounded-lg">
          {(['todos', 'facturas', 'presupuestos', 'documentos'] as Tab[]).map(t => {
            const counts: Record<Tab, number> = {
              todos: invoices.length + quotes.length + documents.length,
              facturas: invoices.length,
              presupuestos: quotes.length,
              documentos: documents.length,
            }
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  tab === t ? 'bg-white shadow text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'
                }`}>
                {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
              </button>
            )
          })}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por archivo, concepto, proveedor, NIF, número..."
          className="flex-1 bg-neutral-50 border border-neutral-200 focus:ring-1 focus:ring-primary focus:outline-none px-4 py-2 text-sm rounded"
        />
      </div>

      {/* Tabla facturas */}
      {showInvoices && filteredInvoices.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden mb-4">
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs font-bold uppercase tracking-widest text-blue-700">
            Facturas ({filteredInvoices.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Tipo / Número</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Proveedor</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Concepto</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Importe</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Estado</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Pago</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Fecha</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(i => (
                  <tr key={i.id} className="border-b hover:bg-neutral-50">
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100">{i.doc_type ?? 'factura'}</span>
                        {i.direction === 'emitida' && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-50 text-blue-500">EMI</span>}
                      </div>
                      {i.number && <div className="text-xs text-neutral-500 mt-0.5 font-mono">{i.number}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{i.ai_data?.supplier_name || i.empresa || '--'}</div>
                      {i.supplier_nif && <div className="text-neutral-400 font-mono text-[10px]">{i.supplier_nif}</div>}
                    </td>
                    <td className="p-3 text-xs"><div className="max-w-[280px] truncate">{i.concept || '--'}</div></td>
                    <td className="p-3 text-right font-mono text-xs">{formatEur(i.amount_total)}</td>
                    <td className="p-3 text-center"><ReviewBadge status={i.review_status} needs_review={i.needs_review} /></td>
                    <td className="p-3 text-center text-xs">
                      {i.payment_status && <span className="text-neutral-600">{i.payment_status}</span>}
                    </td>
                    <td className="p-3 text-xs text-neutral-500">{formatDate(i.issue_date)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {i.drive_url && <a href={i.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mr-2">Drive ↗</a>}
                      <Link href={`/admin/facturas?id=${i.id}`} className="text-xs bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded">Editar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla presupuestos */}
      {showQuotes && filteredQuotes.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden mb-4">
          <div className="px-4 py-2 bg-cyan-50 border-b border-cyan-100 text-xs font-bold uppercase tracking-widest text-cyan-700">
            Presupuestos ({filteredQuotes.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Número / Origen</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Empresa</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Concepto</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Total</th>
                  <th className="text-center p-3 font-medium text-neutral-600">Estado</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Validez</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map(qt => (
                  <tr key={qt.id} className="border-b hover:bg-neutral-50">
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${qt.direction === 'recibida' ? 'bg-cyan-50 text-cyan-700' : 'bg-blue-50 text-blue-500'}`}>{qt.direction || '--'}</span>
                      </div>
                      {qt.number && <div className="text-xs text-neutral-500 mt-0.5 font-mono">{qt.number}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{qt.empresa || '--'}</div>
                      {qt.supplier_nif && <div className="text-neutral-400 font-mono text-[10px]">{qt.supplier_nif}</div>}
                    </td>
                    <td className="p-3 text-xs"><div className="max-w-[280px] truncate">{qt.concept || '--'}</div></td>
                    <td className="p-3 text-right font-mono text-xs">{formatEur(qt.total)}</td>
                    <td className="p-3 text-center"><ReviewBadge status={qt.review_status} needs_review={qt.needs_review} /></td>
                    <td className="p-3 text-xs text-neutral-500">{formatDate(qt.valid_until)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {qt.drive_url && <a href={qt.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mr-2">Drive ↗</a>}
                      <Link href={`/admin/presupuestos?id=${qt.id}`} className="text-xs bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded">Editar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla documentos */}
      {showDocs && filteredDocs.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden mb-4">
          <div className="px-4 py-2 bg-violet-50 border-b border-violet-100 text-xs font-bold uppercase tracking-widest text-violet-700">
            Documentos ({filteredDocs.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b">
                  <th className="text-left p-3 font-medium text-neutral-600">Título / Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Categoría</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Importe</th>
                  <th className="text-center p-3 font-medium text-neutral-600">IA</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Fecha</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(d => (
                  <tr key={d.id} className="border-b hover:bg-neutral-50">
                    <td className="p-3">
                      <div className="text-sm font-medium">{d.titulo || '(sin título)'}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] uppercase font-bold">{d.doc_type ?? '--'}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {d.doc_category ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold uppercase">{d.doc_category}</span>
                      ) : <span className="text-neutral-400">--</span>}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{formatEur(d.importe)}</td>
                    <td className="p-3 text-center"><ConfBadge c={d.ai_confidence} /></td>
                    <td className="p-3 text-xs text-neutral-500">{formatDate(d.fecha_documento)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {d.drive_url && <a href={d.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mr-2">Drive ↗</a>}
                      <Link href={`/admin/revision?cat=documentos_pendientes&id=${d.id}`} className="text-xs bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded">Revisar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vacío */}
      {((tab === 'todos' && invoices.length + quotes.length + documents.length === 0) ||
        (tab === 'facturas' && filteredInvoices.length === 0) ||
        (tab === 'presupuestos' && filteredQuotes.length === 0) ||
        (tab === 'documentos' && filteredDocs.length === 0)) && (
        <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center text-neutral-400 text-sm">
          {q ? 'No hay coincidencias con la búsqueda' : 'No hay documentos en esta categoría'}
        </div>
      )}
    </div>
  )
}
