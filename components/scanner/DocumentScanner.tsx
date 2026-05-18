'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCamera } from './useCamera'
import { useOpenCv } from './useOpenCv'
import type { CapturedPage, DocumentScannerProps, PaperCorners } from './types'

const INPUT_WIDTH = 640
const INPUT_HEIGHT = 480
const STABILITY_FRAMES = 12
const STABILITY_THRESHOLD_PX = 20
const AUTO_CAPTURE_COOLDOWN_MS = 2000

interface CornerHistoryEntry {
  corners: PaperCorners
  ts: number
}

function maxCornerDelta(a: PaperCorners, b: PaperCorners): number {
  const pairs: Array<[keyof PaperCorners, keyof PaperCorners]> = [
    ['topLeftCorner', 'topLeftCorner'],
    ['topRightCorner', 'topRightCorner'],
    ['bottomLeftCorner', 'bottomLeftCorner'],
    ['bottomRightCorner', 'bottomRightCorner'],
  ]
  let max = 0
  for (const [k1, k2] of pairs) {
    const p1 = a[k1]
    const p2 = b[k2]
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    if (d > max) max = d
  }
  return max
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob falló'))),
      'image/jpeg',
      quality,
    )
  })
}

function downscaleCanvas(src: HTMLCanvasElement, longEdge: number): HTMLCanvasElement {
  const ratio = src.width / src.height
  let w = src.width
  let h = src.height
  if (Math.max(w, h) > longEdge) {
    if (w >= h) {
      w = longEdge
      h = Math.round(longEdge / ratio)
    } else {
      h = longEdge
      w = Math.round(longEdge * ratio)
    }
  }
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, 0, 0, w, h)
  return out
}

export default function DocumentScanner({
  onComplete,
  onCancel,
  maxPages = 10,
  autoCaptureDelayMs = 400,
  outputLongEdge = 1600,
  outputQuality = 0.85,
}: DocumentScannerProps) {
  // autoStart=false — start() debe llamarse desde click directo del usuario (iOS gesture)
  const camera = useCamera(false)
  const { cv, scanner, loading: cvLoading, error: cvError } = useOpenCv()

  const inputCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const cornerHistoryRef = useRef<CornerHistoryEntry[]>([])
  const lastAutoCaptureRef = useRef<number>(0)
  const captureInFlightRef = useRef<boolean>(false)
  // Refs para evitar restart del rAF effect cada render
  const captureNowRef = useRef<((corners?: PaperCorners) => Promise<void>) | null>(null)
  const autoCaptureRef = useRef<boolean>(true)
  const lastHintRef = useRef<string>('Apunta a un documento')

  const [pages, setPages] = useState<CapturedPage[]>([])
  const [autoCapture, setAutoCapture] = useState<boolean>(true)
  const [statusHint, setStatusHint] = useState<string>('Apunta a un documento')
  const [completing, setCompleting] = useState<boolean>(false)
  const [cameraStarted, setCameraStarted] = useState<boolean>(false)

  const ready = camera.status === 'granted' && !!cv && !!scanner

  const captureNow = useCallback(
    async (corners?: PaperCorners) => {
      if (!ready || captureInFlightRef.current) return
      if (pages.length >= maxPages) {
        setStatusHint(`Máximo ${maxPages} páginas`)
        return
      }
      const inputCanvas = inputCanvasRef.current
      const video = camera.videoRef.current
      if (!inputCanvas || !video) return

      captureInFlightRef.current = true
      try {
        // Capturar a resolución alta (no la del preview 640×480)
        const fullCanvas = document.createElement('canvas')
        fullCanvas.width = video.videoWidth
        fullCanvas.height = video.videoHeight
        const fctx = fullCanvas.getContext('2d')!
        fctx.drawImage(video, 0, 0)

        // Si tenemos corners detectadas en preview, escalarlas a resolución full
        let extracted: HTMLCanvasElement | null = null
        if (corners) {
          const scaleX = fullCanvas.width / INPUT_WIDTH
          const scaleY = fullCanvas.height / INPUT_HEIGHT
          const fullCorners = {
            topLeftCorner: { x: corners.topLeftCorner.x * scaleX, y: corners.topLeftCorner.y * scaleY },
            topRightCorner: { x: corners.topRightCorner.x * scaleX, y: corners.topRightCorner.y * scaleY },
            bottomLeftCorner: { x: corners.bottomLeftCorner.x * scaleX, y: corners.bottomLeftCorner.y * scaleY },
            bottomRightCorner: { x: corners.bottomRightCorner.x * scaleX, y: corners.bottomRightCorner.y * scaleY },
          }
          // Calcular dimensiones output basadas en aspect del documento
          const w1 = Math.hypot(fullCorners.topRightCorner.x - fullCorners.topLeftCorner.x, fullCorners.topRightCorner.y - fullCorners.topLeftCorner.y)
          const w2 = Math.hypot(fullCorners.bottomRightCorner.x - fullCorners.bottomLeftCorner.x, fullCorners.bottomRightCorner.y - fullCorners.bottomLeftCorner.y)
          const h1 = Math.hypot(fullCorners.bottomLeftCorner.x - fullCorners.topLeftCorner.x, fullCorners.bottomLeftCorner.y - fullCorners.topLeftCorner.y)
          const h2 = Math.hypot(fullCorners.bottomRightCorner.x - fullCorners.topRightCorner.x, fullCorners.bottomRightCorner.y - fullCorners.topRightCorner.y)
          const outW = Math.round(Math.max(w1, w2))
          const outH = Math.round(Math.max(h1, h2))
          try {
            extracted = scanner.extractPaper(fullCanvas, outW, outH, fullCorners)
          } catch (e) {
            console.warn('[scanner] extractPaper falló con corners, fallback foto sin recortar', e)
          }
        }

        // Sin corners o extract falló → guardar foto tal cual
        const finalCanvas = extracted || fullCanvas
        const downscaled = downscaleCanvas(finalCanvas, outputLongEdge)
        const blob = await canvasToBlob(downscaled, outputQuality)

        const page: CapturedPage = {
          id: crypto.randomUUID(),
          blob,
          previewUrl: URL.createObjectURL(blob),
          capturedAt: Date.now(),
        }
        setPages((prev) => [...prev, page])
        setStatusHint(`✓ Página ${pages.length + 1} capturada`)
        cornerHistoryRef.current = []
        lastAutoCaptureRef.current = Date.now()

        // Haptic feedback si soportado
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(40)
        }
      } catch (err) {
        console.error('[scanner] captura falló', err)
        setStatusHint('Error al capturar — reintenta')
      } finally {
        captureInFlightRef.current = false
      }
    },
    [ready, pages.length, maxPages, scanner, camera.videoRef, outputLongEdge, outputQuality],
  )

  const removePage = useCallback((id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const finalize = useCallback(async () => {
    if (pages.length === 0) {
      setStatusHint('Captura al menos una página')
      return
    }
    setCompleting(true)
    try {
      await onComplete(pages)
    } finally {
      setCompleting(false)
    }
  }, [pages, onComplete])

  // Sincronizar refs cada render (sin causar re-run del effect rAF)
  useEffect(() => {
    captureNowRef.current = captureNow
  }, [captureNow])

  useEffect(() => {
    autoCaptureRef.current = autoCapture
  }, [autoCapture])

  // Loop de detección rAF
  useEffect(() => {
    if (!ready) return
    const video = camera.videoRef.current
    const input = inputCanvasRef.current
    const overlay = overlayCanvasRef.current
    if (!video || !input || !overlay) return

    const inputCtx = input.getContext('2d')!
    const overlayCtx = overlay.getContext('2d')!

    input.width = INPUT_WIDTH
    input.height = INPUT_HEIGHT

    const tick = () => {
      if (!video.videoWidth || !video.videoHeight) {
        rafIdRef.current = requestAnimationFrame(tick)
        return
      }

      // Sincronizar tamaño overlay con tamaño renderizado del video
      const rect = video.getBoundingClientRect()
      if (overlay.width !== rect.width || overlay.height !== rect.height) {
        overlay.width = rect.width
        overlay.height = rect.height
      }

      // Copiar video a canvas input 640×480
      inputCtx.drawImage(video, 0, 0, INPUT_WIDTH, INPUT_HEIGHT)

      // Detectar contorno + esquinas. CRÍTICO: img.delete() + contour.delete()
      // SIEMPRE en finally — sin esto opencv.js leak ~60s → OOM iOS (issue #23216).
      let corners: PaperCorners | null = null
      let img: any = null
      let contour: any = null
      try {
        img = cv.imread(input)
        contour = scanner.findPaperContour(img)
        if (contour) {
          const pts = scanner.getCornerPoints(contour, img)
          if (
            pts.topLeftCorner &&
            pts.topRightCorner &&
            pts.bottomLeftCorner &&
            pts.bottomRightCorner
          ) {
            corners = pts
          }
        }
      } catch (e) {
        // Silenciar — frame puede no detectar
      } finally {
        try { if (contour && typeof contour.delete === 'function') contour.delete() } catch {}
        try { if (img && typeof img.delete === 'function') img.delete() } catch {}
      }

      // Limpiar overlay
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height)

      // Hint a aplicar (batch — solo se hace setState al final si cambia)
      let nextHint: string | null = null

      if (corners) {
        const scaleX = overlay.width / INPUT_WIDTH
        const scaleY = overlay.height / INPUT_HEIGHT
        overlayCtx.strokeStyle = '#fbbf24'
        overlayCtx.lineWidth = 4
        overlayCtx.lineJoin = 'round'
        overlayCtx.beginPath()
        overlayCtx.moveTo(corners.topLeftCorner.x * scaleX, corners.topLeftCorner.y * scaleY)
        overlayCtx.lineTo(corners.topRightCorner.x * scaleX, corners.topRightCorner.y * scaleY)
        overlayCtx.lineTo(corners.bottomRightCorner.x * scaleX, corners.bottomRightCorner.y * scaleY)
        overlayCtx.lineTo(corners.bottomLeftCorner.x * scaleX, corners.bottomLeftCorner.y * scaleY)
        overlayCtx.closePath()
        overlayCtx.stroke()

        // Tracking estabilidad para auto-capture
        const now = Date.now()
        const history = cornerHistoryRef.current
        history.push({ corners, ts: now })
        // Limpiar entries viejos (slice O(n) una vez, NO shift O(n²) por frame)
        const cutoff = now - 1500
        if (history.length > 0 && history[0].ts < cutoff) {
          let firstValid = 0
          while (firstValid < history.length && history[firstValid].ts < cutoff) firstValid++
          cornerHistoryRef.current = history.slice(firstValid)
        }
        const liveHistory = cornerHistoryRef.current

        const currentAutoCapture = autoCaptureRef.current
        if (
          currentAutoCapture &&
          liveHistory.length >= STABILITY_FRAMES &&
          now - lastAutoCaptureRef.current > AUTO_CAPTURE_COOLDOWN_MS
        ) {
          const ref = liveHistory[liveHistory.length - STABILITY_FRAMES].corners
          let stable = true
          for (let i = liveHistory.length - STABILITY_FRAMES; i < liveHistory.length; i++) {
            if (maxCornerDelta(liveHistory[i].corners, ref) > STABILITY_THRESHOLD_PX) {
              stable = false
              break
            }
          }
          if (stable) {
            const elapsed = now - liveHistory[liveHistory.length - STABILITY_FRAMES].ts
            if (elapsed >= autoCaptureDelayMs) {
              nextHint = '✨ Estable — capturando...'
              const fn = captureNowRef.current
              if (fn) void fn(corners)
            } else {
              nextHint = 'Mantén estable...'
            }
          } else {
            nextHint = 'Documento detectado — alinea'
          }
        } else if (!currentAutoCapture) {
          nextHint = 'Pulsa el botón para capturar'
        }
      } else {
        cornerHistoryRef.current = []
        nextHint = 'Buscando documento...'
      }

      // Solo setState si el hint cambió (anti-thrash main thread iOS)
      if (nextHint && nextHint !== lastHintRef.current) {
        lastHintRef.current = nextHint
        setStatusHint(nextHint)
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    // CRÍTICO: captureNow + autoCapture FUERA de deps — usamos refs.
    // Si están en deps, cada captura recrea callback → effect re-run →
    // cancela y reinicia rAF loop → video iOS inconsistente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cv, scanner, autoCaptureDelayMs, camera.videoRef])

  // Cleanup blobs on unmount
  useEffect(() => {
    return () => {
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Estados error / loading UI
  if (camera.status === 'denied') {
    return (
      <PermissionDenied
        message={camera.error || 'Permiso de cámara denegado'}
        onRetry={() => camera.start()}
        onCancel={onCancel}
      />
    )
  }
  if (camera.status === 'no_device') {
    return (
      <FullscreenMessage
        title="Sin cámara disponible"
        message={camera.error || 'Este dispositivo no tiene cámara'}
        actionLabel="Cerrar"
        onAction={onCancel}
      />
    )
  }
  if (cvError) {
    return (
      <FullscreenMessage
        title="Error al cargar el motor de escaneo"
        message={cvError}
        actionLabel="Cerrar"
        onAction={onCancel}
      />
    )
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between bg-black/70 px-4 py-3 text-white">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
        >
          ✕ Cancelar
        </button>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {pages.length} / {maxPages} págs
          </span>
          {camera.hasTorch && (
            <button
              type="button"
              onClick={camera.toggleTorch}
              className={`rounded-full px-3 py-2 text-xs ${
                camera.torchOn ? 'bg-amber-400 text-black' : 'bg-white/10 hover:bg-white/20'
              }`}
              title="Linterna"
            >
              💡
            </button>
          )}
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
            />
            Auto
          </label>
        </div>
      </div>

      {/* Preview + overlay */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={camera.videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
        <canvas
          ref={overlayCanvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {/* Canvas input invisible para procesado */}
        <canvas ref={inputCanvasRef} className="hidden" />

        {/* Estado pending — usuario debe pulsar para iniciar (iOS user-gesture) */}
        {camera.status === 'pending' && !cameraStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 px-6 text-white">
            <div className="text-5xl">📷</div>
            <h2 className="mt-4 text-lg font-medium">Listo para escanear</h2>
            <p className="mt-2 max-w-xs text-center text-sm text-stone-300">
              Pulsa el botón para activar la cámara. Tu navegador pedirá permiso.
            </p>
            <button
              type="button"
              onClick={() => {
                setCameraStarted(true)
                void camera.start()
              }}
              disabled={cvLoading}
              className="mt-6 rounded bg-emerald-600 px-8 py-4 text-base font-bold uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {cvLoading ? 'Cargando motor...' : 'Activar cámara'}
            </button>
            {cvLoading && (
              <p className="mt-3 text-xs text-stone-400">
                Descargando motor de escaneo (~8 MB, una sola vez)
              </p>
            )}
          </div>
        )}

        {(camera.status === 'requesting' || (cameraStarted && cvLoading)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
            <div className="text-2xl">📷</div>
            <p className="mt-3 text-sm">
              {camera.status === 'requesting'
                ? 'Esperando permiso de cámara...'
                : 'Cargando motor de escaneo (~8 MB)...'}
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-6 rounded border border-white/30 px-4 py-2 text-xs hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        )}

        {ready && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-xs text-white">
            {statusHint}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black/80 px-3 pb-6 pt-3">
        {/* Thumbnails */}
        {pages.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {pages.map((p, idx) => (
              <div key={p.id} className="relative shrink-0">
                <img
                  src={p.previewUrl}
                  alt={`Página ${idx + 1}`}
                  className="h-16 w-16 rounded border-2 border-white/40 object-cover"
                />
                <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[10px] text-white">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removePage(p.id)}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white hover:bg-red-700"
                  aria-label="Borrar página"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-around">
          <div className="w-24" />
          {/* Botón disparo grande para guantes */}
          <button
            type="button"
            onClick={() => captureNow()}
            disabled={!ready || captureInFlightRef.current || pages.length >= maxPages}
            className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"
            aria-label="Capturar"
          >
            <span className="h-16 w-16 rounded-full bg-white" />
          </button>
          <button
            type="button"
            onClick={finalize}
            disabled={pages.length === 0 || completing}
            className="w-24 rounded-full bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {completing ? '...' : pages.length === 0 ? 'Hecho' : `Hecho (${pages.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

function PermissionDenied({
  message,
  onRetry,
  onCancel,
}: {
  message: string
  onRetry: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black p-6 text-white">
      <div className="text-5xl">📷</div>
      <h2 className="mt-4 text-xl font-medium">Permiso de cámara necesario</h2>
      <p className="mt-2 max-w-md text-center text-sm text-stone-300">{message}</p>
      <div className="mt-6 max-w-md rounded border border-stone-700 bg-stone-900 p-4 text-xs text-stone-300">
        <p className="font-bold uppercase tracking-widest text-stone-400">Cómo activarlo</p>
        <ul className="mt-2 space-y-1">
          <li>
            <strong>iPhone/iPad (Safari):</strong> Ajustes → Safari → Cámara → "Cathedral" →
            "Permitir"
          </li>
          <li>
            <strong>Android (Chrome):</strong> pulsa el candado en la barra → Permisos →
            Cámara → "Permitir"
          </li>
          <li>
            <strong>Mac/PC (Chrome/Edge):</strong> click candado URL → Cámara → "Permitir" +
            recargar
          </li>
        </ul>
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded bg-white px-6 py-3 text-sm font-bold text-black hover:bg-stone-200"
        >
          Reintentar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-white/40 px-6 py-3 text-sm hover:bg-white/10"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function FullscreenMessage({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black p-6 text-white">
      <h2 className="text-xl font-medium">{title}</h2>
      <p className="mt-2 max-w-md text-center text-sm text-stone-300">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-6 rounded bg-white px-6 py-3 text-sm font-bold text-black hover:bg-stone-200"
      >
        {actionLabel}
      </button>
    </div>
  )
}
