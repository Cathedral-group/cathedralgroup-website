'use client'

import React, { useState, useMemo } from 'react'
import type { DocumentRecord, DocumentsViewConfig } from './types'
import {
  ESCRITURAS_CONFIG,
  CONTRATOS_CONFIG,
  LICENCIAS_CONFIG,
  SEGUROS_CONFIG,
  FISCAL_CONFIG,
  LABORAL_CONFIG,
  FLOTA_CONFIG,
  CORPORATIVO_CONFIG,
} from './configs'

// Re-export for backwards compatibility with any external imports
export type { DocumentRecord as Document, DocumentsViewConfig }

const CONFIG_MAP: Record<string, DocumentsViewConfig> = {
  escrituras: ESCRITURAS_CONFIG,
  contratos: CONTRATOS_CONFIG,
  licencias: LICENCIAS_CONFIG,
  seguros: SEGUROS_CONFIG,
  fiscal: FISCAL_CONFIG,
  laboral: LABORAL_CONFIG,
  flota: FLOTA_CONFIG,
  corporativo: CORPORATIVO_CONFIG,
}

// Local alias used throughout this file
type Document = DocumentRecord

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatEur(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const due = new Date(d + 'T00:00:00')
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const map: Record<string, string> = {
    vigente: 'bg-green-100 text-green-700',
    pendiente: 'bg-amber-100 text-amber-700',
    presentado: 'bg-blue-100 text-blue-700',
    vencido: 'bg-red-100 text-red-700',
    cancelado: 'bg-neutral-100 text-neutral-500',
    caducado: 'bg-red-100 text-red-600',
  }
  if (!estado) return null
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${map[estado] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {estado}
    </span>
  )
}

function VencimientoBadge({ fecha }: { fecha: string | null | undefined }) {
  const days = daysUntil(fecha)
  if (days === null) return <span className="text-neutral-300">—</span>
  let cls = 'text-green-600'
  if (days < 0) cls = 'text-red-600 font-semibold'
  else if (days < 15) cls = 'text-red-500'
  else if (days < 30) cls = 'text-amber-500'
  return <span className={cls}>{formatDate(fecha)}</span>
}

interface Props {
  category: string
  initialData: Document[]
  projects: { value: string; label: string }[]
}

export default function DocumentsView({ category, initialData, projects }: Props) {
  const config = CONFIG_MAP[category] ?? ESCRITURAS_CONFIG
  const [data, setData] = useState<Document[]>(initialData)
  const [selected, setSelected] = useState<Document | null>(null)
  const [form, setForm] = useState<Document | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('todos')
  const [estadoFilter, setEstadoFilter] = useState<string>('todos')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  const filtered = useMemo(() => {
    return data.filter(d => {
      if (typeFilter !== 'todos' && d.doc_type !== typeFilter) return false
      if (estadoFilter !== 'todos' && d.estado !== estadoFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = [d.titulo, d.partes, d.proyecto_code, d.original_filename, d.resumen_ia,
          JSON.stringify(d.datos_extraidos ?? {})].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, typeFilter, estadoFilter, search])

  const openNew = () => {
    setSelected(null)
    setForm({ doc_category: config.category, doc_type: config.docTypes[0]?.value ?? '', estado: 'vigente', datos_extraidos: {} })
  }
  const openEdit = (d: Document) => { setSelected(d); setForm({ ...d, datos_extraidos: { ...(d.datos_extraidos ?? {}) } }) }
  const close = () => { setForm(null); setSelected(null) }

  const setF = (k: keyof Document, v: unknown) => setForm(f => f ? { ...f, [k]: v } : f)
  const setExt = (k: string, v: unknown) => setForm(f => f ? { ...f, datos_extraidos: { ...(f.datos_extraidos ?? {}), [k]: v } } : f)

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    try {
      const method = selected?.id ? 'PATCH' : 'POST'
      const body = selected?.id ? { id: selected.id, ...form } : form
      const res = await fetch('/api/db/documents', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `Error ${res.status}`)
      }
      const { data: saved } = await res.json()
      if (selected?.id) {
        setData(p => p.map(r => r.id === selected.id ? (saved ?? { ...selected, ...form }) as Document : r))
      } else {
        if (saved) setData(p => [saved as Document, ...p])
      }
      close()
    } catch (err) {
      alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected?.id || !confirm('¿Mover a la papelera?')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/db/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setData(p => p.filter(r => r.id !== selected.id))
      close()
    } catch (err) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setDeleting(false)
    }
  }

  const filterBtn = (active: boolean) =>
    `px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors rounded ${
      active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-600'
    }`

  const vencimientosProximos = data.filter(d => {
    if (!d.fecha_vencimiento || d.estado === 'cancelado') return false
    const days = daysUntil(d.fecha_vencimiento)
    return days !== null && days >= 0 && days <= 30
  })

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide">{config.title}</h1>
        <button onClick={openNew} className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors">
          + Nuevo
        </button>
      </div>

      {/* Alerta vencimientos próximos */}
      {vencimientosProximos.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
          <span className="text-amber-600 text-lg">⚠</span>
          <span className="text-sm text-amber-700">
            <strong>{vencimientosProximos.length} documento{vencimientosProximos.length > 1 ? 's' : ''}</strong> vence{vencimientosProximos.length > 1 ? 'n' : ''} en los próximos 30 días:&nbsp;
            {vencimientosProximos.map(d => d.titulo || d.doc_type).join(', ')}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Type filter */}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setTypeFilter('todos')} className={filterBtn(typeFilter === 'todos')}>Todos</button>
          {config.docTypes.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)} className={filterBtn(typeFilter === t.value)}>{t.label}</button>
          ))}
        </div>
        <div className="w-px h-6 bg-neutral-200 hidden sm:block" />
        {/* Estado filter */}
        <div className="flex gap-1">
          {['todos', 'vigente', 'pendiente', 'presentado', 'vencido', 'cancelado'].map(e => (
            <button key={e} onClick={() => setEstadoFilter(e)} className={filterBtn(estadoFilter === e)}>
              {e === 'todos' ? 'Todos' : e}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-neutral-200 hidden sm:block" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar..." className="bg-neutral-50 border-0 focus:ring-1 focus:ring-primary px-4 py-2 text-sm w-52"
        />
        <span className="text-xs text-neutral-400 ml-auto">{filtered.length} de {data.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-100 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Título / Tipo</th>
              {config.tableColumns.map(col => (
                <th key={col.key} className="hidden sm:table-cell text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">{col.label}</th>
              ))}
              <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Vencimiento</th>
              <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</th>
              <th className="px-4 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={4 + config.tableColumns.length} className="px-6 py-8 text-center text-sm text-neutral-400">Sin documentos</td></tr>
            ) : filtered.map(doc => (
              <React.Fragment key={doc.id}>
                <tr
                  onClick={() => openEdit(doc)}
                  className="cursor-pointer hover:bg-neutral-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{doc.titulo || '—'}</p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wider mt-0.5">
                      {config.docTypes.find(t => t.value === doc.doc_type)?.label ?? doc.doc_type}
                      {doc.proyecto_code && <span className="ml-2 text-violet-500">{doc.proyecto_code}</span>}
                    </p>
                    {doc.needs_review && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wider rounded">Revisar</span>
                    )}
                  </td>
                  {config.tableColumns.map(col => (
                    <td key={col.key} className="hidden sm:table-cell px-4 py-3 text-sm text-neutral-600">
                      {col.render ? col.render(doc) : String((doc.datos_extraidos?.[col.key] ?? doc[col.key as keyof Document]) ?? '—')}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-sm">
                    <VencimientoBadge fecha={doc.fecha_vencimiento} />
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={doc.estado} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {doc.drive_url && (
                        <a
                          href={doc.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700"
                          title="Ver en Drive"
                        >
                          ↗
                        </a>
                      )}
                      {doc.resumen_ia && (
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedId(expandedId === doc.id ? null : (doc.id ?? null)) }}
                          className="text-[10px] font-bold uppercase tracking-widest text-violet-400 hover:text-violet-700"
                          title="Ver resumen IA"
                        >
                          IA
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {/* Resumen IA expandible */}
                {expandedId === doc.id && doc.resumen_ia && (
                  <tr className="bg-violet-50">
                    <td colSpan={4 + config.tableColumns.length} className="px-6 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-1">Resumen IA</p>
                      <p className="text-sm text-neutral-700 leading-relaxed">{doc.resumen_ia}</p>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-out form panel */}
      {form && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={close} />
          <div className="relative w-full sm:max-w-lg bg-white h-full overflow-y-auto shadow-xl pb-[env(safe-area-inset-bottom)]">
            <div className="sticky top-0 bg-white border-b border-neutral-100 p-6 flex justify-between items-center z-10">
              <h2 className="text-sm font-bold uppercase tracking-widest">{selected ? 'Editar' : 'Nuevo'} documento</h2>
              <button onClick={close} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Tipo */}
              <div>
                <label className={lbl}>Tipo de documento</label>
                <select value={form.doc_type} onChange={e => setF('doc_type', e.target.value)} className={inp}>
                  {config.docTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Título */}
              <div>
                <label className={lbl}>Título / Descripción</label>
                <input type="text" value={form.titulo ?? ''} onChange={e => setF('titulo', e.target.value)} className={inp} placeholder="Ej: Escritura piso Serrano 41" />
              </div>

              {/* Campos comunes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Fecha documento</label>
                  <input type="date" value={form.fecha_documento ?? ''} onChange={e => setF('fecha_documento', e.target.value || null)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Fecha vencimiento</label>
                  <input type="date" value={form.fecha_vencimiento ?? ''} onChange={e => setF('fecha_vencimiento', e.target.value || null)} className={inp} />
                </div>
              </div>

              <div>
                <label className={lbl}>Partes</label>
                <input type="text" value={form.partes ?? ''} onChange={e => setF('partes', e.target.value || null)} className={inp} placeholder="Ej: Vendedor: X / Comprador: Y" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Importe</label>
                  <input type="number" step="0.01" value={form.importe ?? ''} onChange={e => setF('importe', e.target.value ? parseFloat(e.target.value) : null)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Estado</label>
                  <select value={form.estado ?? 'vigente'} onChange={e => setF('estado', e.target.value)} className={inp}>
                    {['vigente', 'pendiente', 'presentado', 'vencido', 'cancelado', 'caducado'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Proyecto vinculado */}
              <div>
                <label className={lbl}>Proyecto vinculado</label>
                <select value={form.project_id ?? ''} onChange={e => {
                  const v = e.target.value
                  const proj = projects.find(p => p.value === v)
                  const code = proj?.label.includes(' - ') ? proj.label.split(' - ')[0] : proj?.label
                  setForm(f => f ? { ...f, project_id: v || null, proyecto_code: code ?? null } : f)
                }} className={inp}>
                  <option value="">Sin proyecto</option>
                  {projects.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {/* Campos específicos del tipo (datos_extraidos) */}
              {config.fields.length > 0 && (
                <div className="pt-2 border-t border-neutral-100">
                  <p className={lbl + ' mb-3'}>Datos específicos</p>
                  <div className="space-y-3">
                    {config.fields.map(field => (
                      <div key={field.key}>
                        <label className={lbl}>{field.label}</label>
                        {field.type === 'textarea' ? (
                          <textarea
                            value={String(form.datos_extraidos?.[field.key] ?? '')}
                            onChange={e => setExt(field.key, e.target.value || null)}
                            rows={3} className={inp}
                          />
                        ) : field.type === 'select' && field.options ? (
                          <select value={String(form.datos_extraidos?.[field.key] ?? '')} onChange={e => setExt(field.key, e.target.value || null)} className={inp}>
                            <option value="">—</option>
                            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type={field.type ?? 'text'}
                            value={String(form.datos_extraidos?.[field.key] ?? '')}
                            onChange={e => setExt(field.key, e.target.value || null)}
                            className={inp}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumen IA (solo lectura si viene de IA, editable si es manual) */}
              {(form.resumen_ia || form.source !== 'email_automatico') && (
                <div>
                  <label className={lbl}>Resumen IA</label>
                  <textarea
                    value={form.resumen_ia ?? ''}
                    onChange={e => setF('resumen_ia', e.target.value || null)}
                    rows={4} className={inp + ' text-neutral-600'}
                    placeholder="Resumen del documento..."
                  />
                </div>
              )}

              {/* Drive link */}
              {form.drive_url && (
                <div>
                  <label className={lbl}>Documento en Drive</label>
                  <a href={form.drive_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline truncate">
                    <span>↗</span>
                    <span className="truncate">{form.original_filename || form.drive_url}</span>
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3 pt-4 border-t border-neutral-100">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-neutral-900 text-white py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-50"
                >
                  {saving ? '...' : selected ? 'Guardar' : 'Crear'}
                </button>
                {selected && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full border border-red-200 text-red-500 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
