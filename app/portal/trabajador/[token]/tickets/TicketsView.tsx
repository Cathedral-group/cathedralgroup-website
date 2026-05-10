'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'

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
  doc_type: string
  status: string
  worker_notas: string | null
  created_at: string
  preview_url: string | null
  project?: { code: string; name: string | null } | { code: string; name: string | null }[] | null
}

interface Props {
  token: string
  employee: { nombre: string }
  projects: Project[]
  initialAttachments: Attachment[]
}

const DOC_TYPE_LABELS: Record<string, string> = {
  ticket: '🧾 Ticket',
  albaran: '📋 Albarán',
  factura: '🧮 Factura',
  foto_obra: '🏗️ Foto obra',
  otro: '📎 Otro',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  uploaded: { label: 'Subido — pendiente revisar', cls: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Procesando…', cls: 'bg-blue-100 text-blue-800' },
  extracted: { label: 'Datos extraídos', cls: 'bg-blue-100 text-blue-800' },
  confirmed: { label: '✓ Anotado', cls: 'bg-emerald-100 text-emerald-800' },
  ignored: { label: 'Descartado', cls: 'bg-stone-100 text-stone-600' },
  error: { label: '⚠ Error', cls: 'bg-red-100 text-red-800' },
}

function singleProj<T>(p: T | T[] | null | undefined): T | null {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function TicketsView({
  token,
  employee,
  projects,
  initialAttachments,
}: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [docType, setDocType] = useState<string>('ticket')
  const [projectId, setProjectId] = useState<string>('')
  const [notas, setNotas] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setSuccess(null)

    // PDFs no se comprimen
    if (f.type === 'application/pdf') {
      setFile(f)
      setPreviewUrl(null)
      return
    }

    // Comprimir imagen client-side antes de subir
    setCompressing(true)
    try {
      const compressed = await imageCompression(f, {
        maxSizeMB: 1,
        maxWidthOrHeight: 2000,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.85,
      })
      setFile(compressed)
      const url = URL.createObjectURL(compressed)
      setPreviewUrl(url)
    } catch (err) {
      // Fallback: usar archivo original si la compresión falla
      console.error('Image compression failed, using original:', err)
      setFile(f)
      setPreviewUrl(URL.createObjectURL(f))
    } finally {
      setCompressing(false)
    }
  }

  async function subir() {
    if (!file) {
      setError('Selecciona una imagen primero')
      return
    }
    setUploading(true)
    setError(null)
    setSuccess(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('doc_type', docType)
    if (projectId) fd.append('project_id', projectId)
    if (notas.trim()) fd.append('notas', notas.trim())

    // Geo opcional (best-effort, sin bloquear si el usuario rechaza)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => resolve(), 2000)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timer)
              fd.append('geo_lat', String(pos.coords.latitude))
              fd.append('geo_lng', String(pos.coords.longitude))
              fd.append('geo_accuracy', String(Math.round(pos.coords.accuracy)))
              resolve()
            },
            () => {
              clearTimeout(timer)
              resolve()
            },
            { timeout: 1500, maximumAge: 60000 },
          )
        })
      } catch {
        // ignore
      }
    }

    try {
      const res = await fetch(`/api/portal/trabajador/${token}/upload-receipt`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al subir')
      } else {
        setSuccess(json.message ?? 'Subido correctamente')
        // Añadir a la lista en memoria
        const newRow: Attachment = {
          id: json.attachment.id,
          storage_path: json.attachment.storage_path,
          storage_bucket: 'worker-receipts',
          mime_type: file.type,
          doc_type: json.attachment.doc_type,
          status: json.attachment.status,
          worker_notas: notas.trim() || null,
          created_at: json.attachment.created_at,
          preview_url: json.preview_url,
          project: projectId
            ? (() => {
                const p = projects.find((x) => x.id === projectId)
                return p ? { code: p.code, name: p.name } : null
              })()
            : null,
        }
        setAttachments((prev) => [newRow, ...prev])
        // Reset form
        setFile(null)
        setPreviewUrl(null)
        setNotas('')
        setProjectId('')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/portal/trabajador/${token}`}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Volver
        </Link>
        <span className="text-xs text-stone-500">
          {employee.nombre.trim()}
        </span>
      </div>

      <h1 className="text-xl font-medium text-stone-900">Subir tickets, albaranes o facturas</h1>
      <p className="mt-1 text-sm text-stone-600">
        Haz una foto del papel y súbela. La administración la procesará para anotarla en
        contabilidad.
      </p>

      {/* Formulario subida */}
      <div className="mt-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {/* Selector tipo */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              ¿Qué subes?
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(DOC_TYPE_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDocType(k)}
                  className={`rounded-lg border px-2 py-2 text-xs transition ${
                    docType === k
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Captura foto / archivo */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Foto o archivo
            </label>
            <div className="mt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                capture="environment"
                onChange={handleFileChange}
                className="block w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-sm hover:file:bg-stone-300"
              />
              <p className="mt-1 text-xs text-stone-500">
                En el móvil abrirá la cámara. JPG/PNG/PDF, máx 10 MB.
              </p>
            </div>
            {compressing && (
              <p className="mt-2 text-xs text-blue-700">Optimizando imagen…</p>
            )}
            {previewUrl && (
              <div className="mt-3">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-48 w-full rounded border border-stone-200 object-contain"
                />
              </div>
            )}
            {file && !previewUrl && (
              <p className="mt-2 text-xs text-stone-600">📄 {file.name || 'archivo PDF'}</p>
            )}
          </div>

          {/* Proyecto */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Proyecto <span className="text-stone-400">(si lo sabes)</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
            >
              <option value="">— Sin proyecto específico</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name ? `· ${p.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500">
              Notas <span className="text-stone-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="ej: ticket Leroy Merlin"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ {success}
            </div>
          )}

          <button
            type="button"
            onClick={subir}
            disabled={!file || uploading || compressing}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-base font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : compressing ? 'Optimizando…' : 'Subir'}
          </button>
        </div>
      </div>

      {/* Lista subidos */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-stone-700">
          Mis subidas ({attachments.length})
        </h2>
        {attachments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500">
            No has subido nada todavía.
          </div>
        ) : (
          <ul className="space-y-2">
            {attachments.map((a) => {
              const proj = singleProj(a.project)
              const status = STATUS_LABELS[a.status] ?? STATUS_LABELS.uploaded
              const isImage = a.mime_type?.startsWith('image/')
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3"
                >
                  {a.preview_url && isImage ? (
                    <a
                      href={a.preview_url}
                      target="_blank"
                      rel="noopener"
                      className="block shrink-0"
                    >
                      <img
                        src={a.preview_url}
                        alt=""
                        className="h-16 w-16 rounded border border-stone-200 object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-stone-200 bg-stone-50 text-2xl">
                      📄
                    </div>
                  )}
                  <div className="flex-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-stone-500">
                        {DOC_TYPE_LABELS[a.doc_type] ?? a.doc_type}
                      </span>
                      <span className="font-mono text-[10px] text-stone-400">
                        {new Date(a.created_at).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${status.cls}`}>
                        {status.label}
                      </span>
                      {proj && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          {proj.code}
                        </span>
                      )}
                    </div>
                    {a.worker_notas && (
                      <div className="mt-1 text-xs text-stone-600">{a.worker_notas}</div>
                    )}
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
