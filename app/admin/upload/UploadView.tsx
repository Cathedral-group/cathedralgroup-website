'use client'

import { useCallback, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import dynamic from 'next/dynamic'
import type { CapturedPage } from '@/components/scanner/types'

const DocumentScanner = dynamic(() => import('@/components/scanner/DocumentScanner'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white">
      <p className="text-sm">Cargando escáner...</p>
    </div>
  ),
})

interface Project {
  id: string
  code: string
  name: string | null
}

interface Props {
  projects: Project[]
}

const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'factura', label: '🧮 Factura' },
  { value: 'ticket', label: '🧾 Ticket' },
  { value: 'albaran', label: '📋 Albarán' },
  { value: 'presupuesto', label: '💰 Presupuesto' },
  { value: 'proforma', label: '📄 Proforma' },
  { value: 'contrato', label: '✍️ Contrato' },
  { value: 'escritura', label: '🏛️ Escritura' },
  { value: 'nota_simple', label: '📜 Nota simple' },
  { value: 'licencia', label: '🔖 Licencia' },
  { value: 'seguro', label: '🛡️ Seguro' },
  { value: 'certificado', label: '🏅 Certificado' },
  { value: 'informe', label: '📊 Informe' },
  { value: 'modelo_fiscal', label: '🏦 Modelo fiscal' },
  { value: 'otro', label: '📎 Otro' },
]

interface UploadResult {
  id: string
  storage_path: string
  signed_url: string | null
  doc_type: string
  status: string
}

export default function UploadView({ projects }: Props) {
  const [docType, setDocType] = useState<string>('factura')
  const [projectId, setProjectId] = useState<string>('')
  const [notas, setNotas] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<UploadResult | null>(null)
  const [showScanner, setShowScanner] = useState<boolean>(false)
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; failed: number } | null>(null)
  const [scanResults, setScanResults] = useState<UploadResult[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const processFile = useCallback(async (f: File) => {
    setError(null)
    setSuccess(null)

    if (f.size > 10 * 1024 * 1024) {
      setError('Archivo demasiado grande (máx 10 MB)')
      return
    }

    // PDFs no se comprimen — subir tal cual
    if (f.type === 'application/pdf') {
      setFile(f)
      setPreviewUrl(null)
      return
    }

    // HEIC: browser-image-compression NO soporta HEIC como input. Fallback: subir original
    // (el endpoint admite image/heic + image/heif).
    if (f.type === 'image/heic' || f.type === 'image/heif') {
      setFile(f)
      setPreviewUrl(null)
      return
    }

    // Comprimir JPEG/PNG/WebP client-side
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
      setPreviewUrl(URL.createObjectURL(compressed))
    } catch (err) {
      console.error('Image compression failed, using original:', err)
      setFile(f)
      setPreviewUrl(URL.createObjectURL(f))
    } finally {
      setCompressing(false)
    }
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void processFile(f)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void processFile(f)
  }

  async function subir() {
    if (!file) {
      setError('Selecciona o arrastra un archivo primero')
      return
    }
    setUploading(true)
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('doc_type', docType)
    if (projectId) fd.append('project_id', projectId)
    if (notas.trim()) fd.append('notas', notas.trim())

    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al subir')
      } else {
        setSuccess({
          id: json.id,
          storage_path: json.storage_path,
          signed_url: json.signed_url,
          doc_type: json.doc_type,
          status: json.status,
        })
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

  function reset() {
    setSuccess(null)
    setError(null)
    setScanResults([])
    setScanProgress(null)
    setFile(null)
    setPreviewUrl(null)
    setNotas('')
    setProjectId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadScannedPages(pages: CapturedPage[]) {
    setShowScanner(false)
    setError(null)
    setSuccess(null)
    setScanResults([])
    setScanProgress({ current: 0, total: pages.length, failed: 0 })

    const results: UploadResult[] = []
    let failed = 0

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const filename = `escaneo_${new Date().toISOString().replace(/[:.]/g, '-')}_p${i + 1}.jpg`
      const fileObj = new File([page.blob], filename, { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', fileObj)
      fd.append('doc_type', docType)
      if (projectId) fd.append('project_id', projectId)
      const pageNote = pages.length > 1 ? `escaneo página ${i + 1}/${pages.length}` : 'escaneo cámara'
      const noteFinal = notas.trim() ? `${notas.trim()} · ${pageNote}` : pageNote
      fd.append('notas', noteFinal)

      try {
        const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (res.ok) {
          results.push({
            id: json.id,
            storage_path: json.storage_path,
            signed_url: json.signed_url,
            doc_type: json.doc_type,
            status: json.status,
          })
        } else {
          failed++
          console.error('[scanner upload] error página', i + 1, json.error)
        }
      } catch (e) {
        failed++
        console.error('[scanner upload] excepción página', i + 1, e)
      }
      setScanProgress({ current: i + 1, total: pages.length, failed })
    }

    setScanResults(results)
    pages.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    if (results.length === 0) {
      setError(`No se subió ninguna página (${failed} fallos)`)
    }
  }

  const lbl = 'text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-2'
  const inp = 'w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm'

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      {/* Columna principal: formulario */}
      <div className="bg-white border border-neutral-100 p-5">
        {/* Tipo */}
        <div className="mb-5">
          <label className={lbl}>Tipo de documento</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {DOC_TYPES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDocType(d.value)}
                className={`rounded border px-2 py-2 text-xs transition ${
                  docType === d.value
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Botón escáner inteligente */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="w-full rounded bg-emerald-600 px-4 py-3 text-sm font-bold uppercase tracking-widest text-white hover:bg-emerald-700"
          >
            📷 Escanear documento con cámara
          </button>
          <p className="mt-1 text-center text-xs text-neutral-500">
            Detección automática de bordes + multi-página + auto-disparo. Requiere webcam o
            cámara móvil.
          </p>
        </div>

        <div className="my-3 flex items-center gap-3 text-xs text-neutral-400">
          <span className="flex-1 border-t border-neutral-200" />
          <span>o subir archivo</span>
          <span className="flex-1 border-t border-neutral-200" />
        </div>

        {/* Captura / drag-drop */}
        <div className="mb-5">
          <label className={lbl}>Archivo</label>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded border-2 border-dashed p-4 transition ${
              dragOver
                ? 'border-neutral-900 bg-neutral-50'
                : 'border-neutral-200 bg-neutral-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              capture="environment"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-widest file:text-white hover:file:bg-primary"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Arrastra un archivo o pulsa para elegir. En móvil abre la cámara trasera. Formatos:
              JPG, PNG, WebP, HEIC, PDF. Máx 10 MB.
            </p>
            {compressing && (
              <p className="mt-2 text-xs text-blue-700">Optimizando imagen…</p>
            )}
            {previewUrl && (
              <div className="mt-3">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-64 w-full rounded border border-neutral-200 object-contain"
                />
              </div>
            )}
            {file && !previewUrl && (
              <p className="mt-3 text-xs text-neutral-700">
                📄 {file.name || 'archivo'} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
        </div>

        {/* Proyecto */}
        <div className="mb-5">
          <label className={lbl}>Proyecto (opcional)</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inp}
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
        <div className="mb-5">
          <label className={lbl}>Notas (opcional)</label>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="ej: factura Leroy Merlin obra C/ Buenavista 24"
            className={inp}
          />
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ Subido correctamente.{' '}
            {success.signed_url && (
              <a
                href={success.signed_url}
                target="_blank"
                rel="noopener"
                className="font-medium underline"
              >
                Ver archivo
              </a>
            )}
            <div className="mt-1 text-xs text-emerald-700">
              ID: <code className="font-mono">{success.id}</code> · Estado:{' '}
              <code className="font-mono">{success.status}</code>
            </div>
          </div>
        )}

        {scanProgress && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            📤 Subiendo escaneo: {scanProgress.current} / {scanProgress.total}
            {scanProgress.failed > 0 && ` · ${scanProgress.failed} fallos`}
          </div>
        )}

        {scanResults.length > 0 && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-medium">
              ✓ {scanResults.length} {scanResults.length === 1 ? 'página subida' : 'páginas subidas'}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {scanResults.map((r, i) => (
                <li key={r.id}>
                  Página {i + 1}: <code className="font-mono">{r.id.slice(0, 8)}</code>
                  {' · '}
                  {r.signed_url && (
                    <a href={r.signed_url} target="_blank" rel="noopener" className="underline">
                      ver
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={subir}
            disabled={!file || uploading || compressing}
            className="rounded bg-neutral-900 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-primary disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : compressing ? 'Optimizando…' : 'Subir documento'}
          </button>
          {(success || file) && (
            <button
              type="button"
              onClick={reset}
              className="rounded border border-neutral-200 bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-neutral-700 hover:bg-neutral-50"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Columna lateral: ayuda */}
      <div className="space-y-4">
        <div className="bg-white border border-neutral-100 p-4 text-xs text-neutral-600">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
            Cómo funciona
          </h3>
          <ol className="space-y-2 list-decimal pl-4">
            <li>Eliges el tipo de documento (factura, ticket, etc.)</li>
            <li>Subes el archivo (foto cámara móvil o drag-drop)</li>
            <li>Opcionalmente asocias proyecto + notas</li>
            <li>El sistema extrae los datos con OCR automáticamente</li>
            <li>El documento aparecerá en Revisión IA para validar</li>
          </ol>
        </div>

        <div className="bg-white border border-neutral-100 p-4 text-xs text-neutral-600">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
            Procesado OCR
          </h3>
          <p>
            Solo imágenes (JPG/PNG/WebP/HEIC) se procesan automáticamente vía cascada
            Gemini → GPT-4o → Mistral.
          </p>
          <p className="mt-2">
            PDFs se almacenan tal cual — el OCR PDF se hará en el pipeline posterior.
          </p>
        </div>

        <div className="bg-white border border-neutral-100 p-4 text-xs text-neutral-600">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">
            Privacidad
          </h3>
          <p>
            Los archivos se guardan en el bucket privado <code className="font-mono">admin-uploads</code>{' '}
            de Supabase Storage y solo son accesibles vía URL firmada temporal (1h).
          </p>
        </div>
      </div>

      {showScanner && (
        <DocumentScanner
          onComplete={uploadScannedPages}
          onCancel={() => setShowScanner(false)}
          maxPages={10}
        />
      )}
    </div>
  )
}
