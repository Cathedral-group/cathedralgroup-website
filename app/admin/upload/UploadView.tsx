'use client'

/**
 * UploadView — consume UploadQueueContext global (lib/upload-queue-context.tsx).
 *
 * Bug solucionado sesión 21/05/2026: ya no usa state local. Cola persiste
 * cuando usuario navega a otra página dentro de admin (Provider en layout
 * persiste mientras pestaña viva). Auto-procesa al añadir archivos.
 */

import { useCallback, useRef, useState } from 'react'
import { useUploadQueue } from '@/lib/upload-queue-context'

interface Project {
  id: string
  code: string
  name: string | null
}

interface Props {
  projects?: Project[]
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

export default function UploadView(_props: Props) {
  const { queue, addFiles, cancelItem, clearCompleted, clearAll, batchRunning, currentItemId, globalError } = useUploadQueue()
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    addFiles(arr)
  }, [addFiles])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }, [handleFiles])

  const totalDone = queue.filter((q) => q.status === 'success').length
  const totalError = queue.filter((q) => q.status === 'error').length
  const totalPending = queue.filter((q) => q.status === 'pending').length
  const totalProcessing = queue.filter((q) => q.status === 'processing').length

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Subir documento</h1>
      <p className="text-sm text-neutral-600 mb-6">
        Sube facturas, tickets, albaranes y otros documentos desde cámara móvil o arrastrando un archivo. El sistema extraerá los datos automáticamente con OCR.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-6">
        <div className="border border-neutral-200 bg-white rounded">
          <div className="border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Archivos</p>
            <div className="flex items-center gap-3 text-xs">
              {batchRunning && <span className="text-amber-600">⏳ Procesando…</span>}
              {totalDone > 0 && <span className="text-emerald-600">✅ {totalDone}</span>}
              {totalError > 0 && <span className="text-red-600">❌ {totalError}</span>}
              {totalPending > 0 && <span className="text-neutral-500">⏸ {totalPending}</span>}
              {totalProcessing > 0 && <span className="text-blue-600">🔄 {totalProcessing}</span>}
            </div>
          </div>

          <div
            className={`p-4 transition-colors ${dragOver ? 'bg-primary/5 border-2 border-dashed border-primary' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-primary text-white px-4 py-2 text-sm font-semibold rounded hover:bg-primary/90"
              >
                ELEGIR ARCHIVOS
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES}
                capture="environment"
                onChange={onSelect}
                className="hidden"
              />
              <span className="text-xs text-neutral-500">
                {queue.length === 0 ? 'Ningún archivo seleccionado' : `${queue.length} archivos en cola`}
              </span>

              {queue.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  {(totalDone > 0 || totalError > 0) && (
                    <button onClick={clearCompleted} className="text-xs text-neutral-500 hover:text-neutral-900">
                      Limpiar terminados
                    </button>
                  )}
                  <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-700">
                    Vaciar todo
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-neutral-500 mb-3">
              Arrastra uno o varios archivos, o pulsa para elegir. Móvil abre cámara trasera. Formatos: JPG, PNG, WebP, HEIC, PDF. Máx 10 MB/archivo. Máx 100 en cola. Sistema detecta tipo de documento y proyecto automático.
            </p>

            {globalError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-xs text-red-700 rounded">
                {globalError}
              </div>
            )}

            {queue.length === 0 ? (
              <p className="text-center text-sm text-neutral-400 py-12">
                Sin archivos en la cola. Arrastra o selecciona para empezar.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {queue.map((it) => (
                  <li
                    key={it.id}
                    className={`flex items-center gap-3 px-3 py-2 border rounded text-sm ${
                      it.id === currentItemId ? 'border-amber-400 bg-amber-50' :
                      it.status === 'success' ? 'border-emerald-200 bg-emerald-50' :
                      it.status === 'error' ? 'border-red-200 bg-red-50' :
                      'border-neutral-200 bg-white'
                    }`}
                  >
                    <span className="w-5 text-center">
                      {it.status === 'pending' && '⏸'}
                      {it.status === 'processing' && '🔄'}
                      {it.status === 'success' && '✅'}
                      {it.status === 'error' && '❌'}
                    </span>
                    {it.previewUrl && (
                      <img src={it.previewUrl} alt="" className="w-10 h-10 object-cover rounded border border-neutral-200 flex-none" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{it.file.name}</p>
                      <p className="text-xs text-neutral-500">
                        {it.sizeKB} KB
                        {it.message && <span> · {it.message}</span>}
                      </p>
                    </div>
                    {it.status === 'pending' && (
                      <button onClick={() => cancelItem(it.id)} className="text-xs text-neutral-400 hover:text-red-500">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="border border-neutral-200 bg-white rounded p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Cómo funciona</p>
            <ol className="text-xs text-neutral-700 space-y-1 list-decimal list-inside">
              <li>Arrastra uno o varios archivos (o pulsa para elegir)</li>
              <li>La cola sigue corriendo aunque cambies de página</li>
              <li>El sistema detecta tipo de documento y proyecto automáticamente</li>
              <li>OCR cascada Gemini → GPT-4o → Mistral extrae datos</li>
              <li>Los documentos aparecen en Revisión IA para validar</li>
            </ol>
          </div>

          <div className="border border-neutral-200 bg-white rounded p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Procesado</p>
            <p className="text-xs text-neutral-700">
              Imágenes &gt; 2 MB se comprimen en el navegador antes de subir. PDFs y HEIC se envían tal cual. Cada archivo se sube en serie con 800 ms entre subidas para no saturar el backend.
            </p>
          </div>

          <div className="border border-neutral-200 bg-white rounded p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Privacidad</p>
            <p className="text-xs text-neutral-700">
              Los archivos se guardan en bucket privado <code className="font-mono text-[11px]">admin-uploads</code> de Supabase Storage y solo son accesibles vía URL firmada temporal (1h).
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
