'use client'

import { useCallback, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'

interface Project {
  id: string
  code: string
  name: string | null
}

interface Props {
  // Mantenido por compatibilidad con caller (page.tsx pasa projects).
  // No se usa en UI: workflow IA detecta doc_type + proyecto automático.
  projects?: Project[]
}

interface UploadResult {
  id: string
  storage_path?: string
  signed_url?: string | null
  doc_type?: string
  status?: string
  empresa?: string
  amount?: number
}

type QueueStatus = 'pending' | 'processing' | 'success' | 'error'

interface QueueItem {
  id: string
  file: File
  status: QueueStatus
  message?: string
  result?: { invoiceId?: string; empresa?: string; amount?: number }
  previewUrl?: string
  sizeKB: number
  isImage: boolean
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'
const THROTTLE_MS = 800
const MAX_QUEUE_ITEMS = 100

function isCompressibleImage(f: File): boolean {
  return f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/webp'
}

function isAcceptedType(f: File): boolean {
  return (
    f.type === 'image/jpeg' ||
    f.type === 'image/png' ||
    f.type === 'image/webp' ||
    f.type === 'image/heic' ||
    f.type === 'image/heif' ||
    f.type === 'application/pdf'
  )
}

async function compressIfNeeded(file: File): Promise<File> {
  if (!isCompressibleImage(file)) return file
  if (file.size <= 2 * 1024 * 1024) return file
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.85,
    })
    return compressed
  } catch (err) {
    console.error('Image compression failed, using original:', err)
    return file
  }
}

export default function UploadView(_props: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [currentItemId, setCurrentItemId] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const queueRef = useRef<QueueItem[]>([])
  queueRef.current = queue

  const buildItem = useCallback((f: File): QueueItem => {
    if (!isAcceptedType(f)) {
      return {
        id: crypto.randomUUID(),
        file: f,
        status: 'error',
        message: `Tipo no soportado: ${f.type || 'desconocido'}`,
        sizeKB: Math.round(f.size / 1024),
        isImage: false,
      }
    }
    if (f.size > MAX_FILE_BYTES) {
      return {
        id: crypto.randomUUID(),
        file: f,
        status: 'error',
        message: `Demasiado grande (${(f.size / 1024 / 1024).toFixed(1)} MB · máx 10 MB)`,
        sizeKB: Math.round(f.size / 1024),
        isImage: f.type.startsWith('image/'),
      }
    }
    const isImage = f.type.startsWith('image/') && !f.type.includes('heic') && !f.type.includes('heif')
    let previewUrl: string | undefined
    if (isImage) {
      try {
        previewUrl = URL.createObjectURL(f)
      } catch {
        previewUrl = undefined
      }
    }
    return {
      id: crypto.randomUUID(),
      file: f,
      status: 'pending',
      sizeKB: Math.round(f.size / 1024),
      isImage,
      previewUrl,
    }
  }, [])

  const enqueueFiles = useCallback((fileList: FileList | File[]) => {
    setGlobalError(null)
    const incoming = Array.from(fileList)
    if (incoming.length === 0) return

    setQueue((prev) => {
      const remainingSlots = MAX_QUEUE_ITEMS - prev.length
      if (remainingSlots <= 0) {
        setGlobalError(`Cola llena (máx ${MAX_QUEUE_ITEMS} archivos). Limpia para añadir más.`)
        return prev
      }
      const toAdd = incoming.slice(0, remainingSlots).map(buildItem)
      if (incoming.length > remainingSlots) {
        setGlobalError(`Solo se añadieron ${remainingSlots} de ${incoming.length} archivos (máx ${MAX_QUEUE_ITEMS}).`)
      }
      return [...prev, ...toAdd]
    })
  }, [buildItem])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      enqueueFiles(e.target.files)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      enqueueFiles(e.dataTransfer.files)
    }
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function removeItem(id: string) {
    setQueue((prev) => {
      const it = prev.find((x) => x.id === id)
      if (it?.previewUrl) {
        try { URL.revokeObjectURL(it.previewUrl) } catch {}
      }
      return prev.filter((x) => x.id !== id)
    })
  }

  function clearQueue() {
    if (batchRunning) return
    queue.forEach((it) => {
      if (it.previewUrl) {
        try { URL.revokeObjectURL(it.previewUrl) } catch {}
      }
    })
    setQueue([])
    setGlobalError(null)
    setCurrentItemId(null)
  }

  async function uploadFile(file: File): Promise<UploadResult> {
    const finalFile = await compressIfNeeded(file)
    const fd = new FormData()
    fd.append('file', finalFile)
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`
      try {
        const err = await res.json()
        if (err?.error) errMsg = err.error
      } catch {}
      // Traducir errores BD a mensajes amigables castellano.
      if (/uq_admin_uploads_company_hash|duplicate key.*hash/i.test(errMsg)) {
        errMsg = 'Archivo duplicado — ya está en la base de datos (mismo contenido).'
      } else if (/duplicate key/i.test(errMsg)) {
        errMsg = 'Archivo duplicado — registro ya existe.'
      } else if (/file_hash|sha256/i.test(errMsg)) {
        errMsg = 'Archivo duplicado detectado por hash SHA-256.'
      }
      throw new Error(errMsg)
    }
    return res.json()
  }

  async function processBatch() {
    if (batchRunning) return
    const pendings = queue.filter((it) => it.status === 'pending')
    if (pendings.length === 0) {
      setGlobalError('No hay archivos pendientes en la cola.')
      return
    }
    setBatchRunning(true)
    setGlobalError(null)

    const pendingIds = pendings.map((p) => p.id)
    for (const itemId of pendingIds) {
      const current = queueRef.current.find((q) => q.id === itemId)
      if (!current || current.status !== 'pending') continue

      setCurrentItemId(itemId)
      updateItem(itemId, { status: 'processing', message: undefined })

      try {
        const result = await uploadFile(current.file)
        updateItem(itemId, {
          status: 'success',
          result: {
            invoiceId: result.id,
            empresa: result.empresa,
            amount: result.amount,
          },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        updateItem(itemId, { status: 'error', message: msg })
      }

      await new Promise((r) => setTimeout(r, THROTTLE_MS))
    }

    setBatchRunning(false)
    setCurrentItemId(null)
  }

  const total = queue.length
  const processed = queue.filter((it) => it.status === 'success' || it.status === 'error').length
  const pendingCount = queue.filter((it) => it.status === 'pending').length
  const successCount = queue.filter((it) => it.status === 'success').length
  const errorCount = queue.filter((it) => it.status === 'error').length
  const progressPct = total === 0 ? 0 : Math.round((processed / total) * 100)

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="bg-white border border-neutral-100 p-5">
        <div className="mb-5">
          <label className={lbl}>Archivos</label>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!batchRunning) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded border-2 border-dashed p-4 transition ${
              dragOver ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-neutral-50'
            } ${batchRunning ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              capture="environment"
              onChange={handleFileChange}
              disabled={batchRunning}
              className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-white hover:file:bg-primary"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Arrastra uno o varios archivos, o pulsa para elegir. Móvil abre cámara trasera.
              Formatos: JPG, PNG, WebP, HEIC, PDF. Máx 10 MB/archivo. Máx {MAX_QUEUE_ITEMS} en cola.
              Sistema detecta tipo de documento y proyecto automático.
            </p>
          </div>
        </div>

        {globalError && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠️ {globalError}
          </div>
        )}

        {total > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-sm">
                <span className="font-bold">{processed}</span> de <span className="font-bold">{total}</span> procesados
                {successCount > 0 && <span className="ml-2 text-emerald-700">✓ {successCount}</span>}
                {errorCount > 0 && <span className="ml-2 text-red-700">✗ {errorCount}</span>}
                {pendingCount > 0 && !batchRunning && <span className="ml-2 text-neutral-500">⏳ {pendingCount} pendientes</span>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={processBatch}
                  disabled={batchRunning || pendingCount === 0}
                  className="rounded bg-neutral-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-primary disabled:opacity-50"
                >
                  {batchRunning ? 'Subiendo…' : `Subir ${pendingCount} archivo${pendingCount === 1 ? '' : 's'}`}
                </button>
                <button
                  type="button"
                  onClick={clearQueue}
                  disabled={batchRunning}
                  className="rounded border border-neutral-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Limpiar cola
                </button>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-neutral-100">
              <div className="h-full bg-neutral-900 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {total === 0 ? (
          <p className="text-center text-sm text-neutral-500 py-8">
            Sin archivos en la cola. Arrastra o selecciona para empezar.
          </p>
        ) : (
          <ul className="space-y-2">
            {queue.map((it) => {
              const isCurrent = it.id === currentItemId
              const stateStyle =
                it.status === 'pending' ? 'border-neutral-200 bg-neutral-50 text-neutral-700'
                : it.status === 'processing' ? 'border-blue-200 bg-blue-50 text-blue-900'
                : it.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'

              return (
                <li key={it.id} className={`flex items-center gap-3 rounded border p-3 text-sm transition ${stateStyle}`}>
                  <span className="text-lg shrink-0 w-6 text-center">
                    {it.status === 'pending' && '⏳'}
                    {it.status === 'processing' && <span className="inline-block animate-spin">🔄</span>}
                    {it.status === 'success' && '✅'}
                    {it.status === 'error' && '❌'}
                  </span>
                  {it.previewUrl ? (
                    <img src={it.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded border border-neutral-200 object-cover" />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded border border-neutral-200 bg-white flex items-center justify-center text-xs text-neutral-500">
                      {it.file.type === 'application/pdf' ? 'PDF' : 'DOC'}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">
                      {it.file.name || 'archivo'}
                      {isCurrent && <span className="ml-2 text-[10px] uppercase tracking-widest text-blue-700">en curso</span>}
                    </div>
                    <div className="text-xs opacity-75">
                      {it.sizeKB} KB
                      {it.status === 'success' && it.result?.invoiceId && (
                        <> · ID: <code className="font-mono">{it.result.invoiceId.slice(0, 8)}…</code></>
                      )}
                      {it.status === 'success' && it.result?.empresa && <> · {it.result.empresa}</>}
                      {it.status === 'success' && it.result?.amount != null && <> · {it.result.amount} €</>}
                      {it.status === 'error' && it.message && <> · {it.message}</>}
                    </div>
                  </div>
                  {it.status !== 'processing' && !batchRunning && (
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="shrink-0 text-xs text-neutral-500 hover:text-red-700"
                      title="Quitar de la cola"
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-neutral-100 p-4 text-xs text-neutral-600">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Cómo funciona</h3>
          <ol className="space-y-2 list-decimal pl-4">
            <li>Arrastra uno o varios archivos (o pulsa para elegir)</li>
            <li>Revisa la cola y pulsa &quot;Subir N archivos&quot;</li>
            <li>El sistema detecta tipo de documento y proyecto automáticamente</li>
            <li>OCR cascada Gemini → GPT-4o → Mistral extrae datos</li>
            <li>Los documentos aparecen en Revisión IA para validar</li>
          </ol>
        </div>
        <div className="bg-white border border-neutral-100 p-4 text-xs text-neutral-600">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Procesado</h3>
          <p>
            Imágenes &gt; 2 MB se comprimen en el navegador antes de subir. PDFs y HEIC se envían tal cual.
            Cada archivo se sube en serie con 800 ms entre subidas para no saturar el backend.
          </p>
        </div>
        <div className="bg-white border border-neutral-100 p-4 text-xs text-neutral-600">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Privacidad</h3>
          <p>
            Los archivos se guardan en bucket privado <code className="font-mono">admin-uploads</code> de Supabase Storage
            y solo son accesibles vía URL firmada temporal (1h).
          </p>
        </div>
      </div>
    </div>
  )
}
