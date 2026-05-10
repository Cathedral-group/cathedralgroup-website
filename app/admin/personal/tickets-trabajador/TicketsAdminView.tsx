'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

interface Project {
  id: string
  code: string
  name: string | null
}

interface Attachment {
  id: string
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  size_bytes: number | null
  doc_type: string
  status: string
  worker_notas: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by_email: string | null
  reviewer_action: string | null
  invoice_id: string | null
  device_geo_lat: number | null
  device_geo_lng: number | null
  preview_url: string | null
  employee: { id: string; nombre: string | null; nif: string | null }
    | { id: string; nombre: string | null; nif: string | null }[]
    | null
  project: { id: string; code: string; name: string | null }
    | { id: string; code: string; name: string | null }[]
    | null
}

interface Props {
  initialAttachments: Attachment[]
  projects: Project[]
}

const DOC_TYPE_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  albaran: 'Albarán',
  factura: 'Factura',
  foto_obra: 'Foto obra',
  otro: 'Otro',
}

const STATUS_BADGE: Record<string, string> = {
  uploaded: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  extracted: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  ignored: 'bg-stone-100 text-stone-600',
  error: 'bg-red-100 text-red-800',
}

function singleRef<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function TicketsAdminView({ initialAttachments, projects }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'confirmed' | 'ignored'>('uploaded')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return attachments
    return attachments.filter((a) => a.status === filter)
  }, [attachments, filter])

  const counts = useMemo(() => {
    return {
      uploaded: attachments.filter((a) => a.status === 'uploaded').length,
      confirmed: attachments.filter((a) => a.status === 'confirmed').length,
      ignored: attachments.filter((a) => a.status === 'ignored').length,
      total: attachments.length,
    }
  }, [attachments])

  async function patchAttachment(
    id: string,
    update: { status?: string; project_id?: string | null; reviewer_action?: string },
  ) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/personal/tickets-trabajador/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al actualizar')
      } else {
        setAttachments((prev) =>
          prev.map((a) => {
            if (a.id !== id) return a
            const updated = { ...a, ...update }
            if (update.status) updated.status = update.status
            if (update.reviewer_action) updated.reviewer_action = update.reviewer_action
            updated.reviewed_at = new Date().toISOString()
            return updated
          }),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteAttachment(id: string) {
    if (!confirm('¿Borrar este archivo? El trabajador no lo verá más.')) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/personal/tickets-trabajador/${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al borrar')
      } else {
        setAttachments((prev) => prev.filter((a) => a.id !== id))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <Link href="/admin/personal" className="hover:text-stone-900">
              Personal
            </Link>
            <span>›</span>
            <span className="text-stone-900">Tickets de trabajadores</span>
          </div>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-stone-900">
            Tickets, albaranes y facturas subidas por trabajadores
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Lo que los trabajadores hayan fotografiado desde su portal. Revisa, asigna a un
            proyecto si falta y márcalo como anotado cuando ya lo hayas registrado en
            contabilidad (o ignóralo si era prueba).
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(['uploaded', 'confirmed', 'ignored', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                filter === f
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {f === 'uploaded' && `Pendientes (${counts.uploaded})`}
              {f === 'confirmed' && `Anotados (${counts.confirmed})`}
              {f === 'ignored' && `Ignorados (${counts.ignored})`}
              {f === 'all' && `Todos (${counts.total})`}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
            {filter === 'uploaded'
              ? 'No hay tickets pendientes de procesar.'
              : 'No hay tickets en este filtro.'}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((a) => {
              const emp = singleRef(a.employee)
              const proj = singleRef(a.project)
              const isImage = a.mime_type?.startsWith('image/')
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    {/* Preview */}
                    {a.preview_url && isImage ? (
                      <a
                        href={a.preview_url}
                        target="_blank"
                        rel="noopener"
                        className="block shrink-0"
                        title="Abrir imagen completa"
                      >
                        <img
                          src={a.preview_url}
                          alt=""
                          className="h-32 w-32 rounded border border-stone-200 object-cover hover:opacity-90"
                        />
                      </a>
                    ) : (
                      <a
                        href={a.preview_url ?? '#'}
                        target="_blank"
                        rel="noopener"
                        className="flex h-32 w-32 shrink-0 items-center justify-center rounded border border-stone-200 bg-stone-50 text-3xl hover:bg-stone-100"
                      >
                        📄
                      </a>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            STATUS_BADGE[a.status] ?? STATUS_BADGE.uploaded
                          }`}
                        >
                          {a.status}
                        </span>
                        <span className="text-xs uppercase tracking-wider text-stone-500">
                          {DOC_TYPE_LABELS[a.doc_type] ?? a.doc_type}
                        </span>
                        {proj && (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            {proj.code}
                          </span>
                        )}
                        <span className="text-xs text-stone-400">
                          {new Date(a.created_at).toLocaleString('es-ES')}
                        </span>
                      </div>

                      <div className="mt-2 text-sm">
                        <span className="text-stone-500">Trabajador:</span>{' '}
                        <span className="font-medium">
                          {emp?.nombre?.trim() || '—'}
                        </span>
                        {emp?.nif && (
                          <span className="ml-2 font-mono text-xs text-stone-500">
                            {emp.nif}
                          </span>
                        )}
                      </div>

                      {a.worker_notas && (
                        <div className="mt-1 text-sm text-stone-600">
                          <span className="text-stone-400">Nota:</span> {a.worker_notas}
                        </div>
                      )}

                      {a.device_geo_lat && a.device_geo_lng && (
                        <div className="mt-1 text-xs text-stone-400">
                          📍{' '}
                          <a
                            href={`https://www.google.com/maps?q=${a.device_geo_lat},${a.device_geo_lng}`}
                            target="_blank"
                            rel="noopener"
                            className="hover:text-stone-700"
                          >
                            {a.device_geo_lat.toFixed(5)}, {a.device_geo_lng.toFixed(5)}
                          </a>
                        </div>
                      )}

                      {a.reviewed_at && (
                        <div className="mt-1 text-xs text-stone-500">
                          Revisado por {a.reviewed_by_email} el{' '}
                          {new Date(a.reviewed_at).toLocaleString('es-ES')}
                        </div>
                      )}

                      {/* Asignar proyecto si falta */}
                      {!proj && a.status === 'uploaded' && (
                        <div className="mt-3">
                          <label className="block text-xs uppercase tracking-wider text-stone-500">
                            Asignar a proyecto
                          </label>
                          <select
                            disabled={busyId === a.id}
                            onChange={(e) => {
                              if (e.target.value) {
                                patchAttachment(a.id, { project_id: e.target.value })
                              }
                            }}
                            defaultValue=""
                            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm sm:max-w-md"
                          >
                            <option value="">— Sin proyecto —</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code} {p.name ? `· ${p.name}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Acciones */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.status === 'uploaded' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() =>
                                patchAttachment(a.id, {
                                  status: 'confirmed',
                                  reviewer_action: 'confirmed',
                                })
                              }
                              className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              ✓ Marcar anotado
                            </button>
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() =>
                                patchAttachment(a.id, {
                                  status: 'ignored',
                                  reviewer_action: 'ignored',
                                })
                              }
                              className="rounded border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-100 disabled:opacity-50"
                            >
                              Ignorar
                            </button>
                          </>
                        )}
                        {a.status === 'confirmed' && (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() =>
                              patchAttachment(a.id, {
                                status: 'uploaded',
                                reviewer_action: 'reopened',
                              })
                            }
                            className="rounded border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-100 disabled:opacity-50"
                          >
                            ↺ Reabrir
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === a.id}
                          onClick={() => deleteAttachment(a.id)}
                          className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          🗑 Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
