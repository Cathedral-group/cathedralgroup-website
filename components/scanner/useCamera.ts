'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type PermissionStatus = 'pending' | 'requesting' | 'granted' | 'denied' | 'no_device' | 'error'

interface CameraState {
  status: PermissionStatus
  error: string | null
  videoDevices: MediaDeviceInfo[]
  activeDeviceId: string | null
  hasTorch: boolean
  torchOn: boolean
}

interface CameraControls extends CameraState {
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: (deviceId?: string) => Promise<void>
  stop: () => void
  switchCamera: (deviceId: string) => Promise<void>
  toggleTorch: () => Promise<void>
}

function pickRearCamera(devices: MediaDeviceInfo[]): string | null {
  if (devices.length === 0) return null
  if (devices.length === 1) return devices[0].deviceId

  const labelMatch = devices.find((d) => {
    const l = d.label.toLowerCase()
    return /back|rear|trasera|environment|posterior/.test(l)
  })
  if (labelMatch) return labelMatch.deviceId

  return devices[devices.length - 1].deviceId
}

/**
 * Camera hook robusto iOS Safari + Android Chrome + desktop.
 *
 * REGLAS CRÍTICAS aplicadas tras diagnóstico validador 18/05/2026:
 *
 * 1. NO doble getUserMedia. WebKit bug #179363: el segundo getUserMedia sobre
 *    misma media pone track.muted=true read-only en primer stream → video negro
 *    UI colgada. Si necesitamos cambiar de cámara tras enumerateDevices,
 *    usamos applyConstraints sobre la track existente.
 *
 * 2. autoStart por defecto FALSE. iOS Safari requiere user-gesture directo en
 *    el stack del click — setTimeout o useEffect rompe ese stack. El componente
 *    consumer debe llamar start() desde el onClick del botón "Iniciar cámara".
 */
export function useCamera(autoStart: boolean = false): CameraControls {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef<boolean>(true)
  const [state, setState] = useState<CameraState>({
    status: 'pending',
    error: null,
    videoDevices: [],
    activeDeviceId: null,
    hasTorch: false,
    torchOn: false,
  })

  const safeSetState = useCallback((updater: (s: CameraState) => CameraState) => {
    if (mountedRef.current) setState(updater)
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const start = useCallback(async (deviceId?: string) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      safeSetState((s) => ({
        ...s,
        status: 'no_device',
        error: 'Tu navegador no soporta acceso a cámara',
      }))
      return
    }

    safeSetState((s) => ({ ...s, status: 'requesting', error: null }))

    try {
      // ÚNICO getUserMedia. Si no se especifica deviceId, pedimos hint environment
      // (Safari iOS lo soporta como hint, no como require — fallback frontal automático).
      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      // Enumerate devices DESPUÉS del permiso (necesario para labels)
      let videoDevices: MediaDeviceInfo[] = []
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        videoDevices = allDevices.filter((d) => d.kind === 'videoinput')
      } catch {
        // ignore
      }

      // Si hay múltiples cámaras y la activa NO es la trasera por heurística label,
      // applyConstraints en track existente (NO doble getUserMedia — WebKit bug #179363)
      if (!deviceId && videoDevices.length > 1) {
        const rearId = pickRearCamera(videoDevices)
        const currentTrack = stream.getVideoTracks()[0]
        const currentDeviceId = currentTrack?.getSettings().deviceId
        if (rearId && rearId !== currentDeviceId && currentTrack) {
          try {
            await currentTrack.applyConstraints({
              deviceId: { exact: rearId },
            } as MediaTrackConstraints)
          } catch {
            // Si applyConstraints falla, seguimos con la cámara seleccionada por facingMode
          }
        }
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.playsInline = true
        videoRef.current.muted = true
        videoRef.current.autoplay = true
        await videoRef.current.play().catch(() => {})
      }

      const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null
      const track = stream.getVideoTracks()[0]
      const caps: any = typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {}
      const hasTorch = !!caps?.torch

      safeSetState(() => ({
        status: 'granted',
        error: null,
        videoDevices,
        activeDeviceId: activeId,
        hasTorch,
        torchOn: false,
      }))
    } catch (err: any) {
      const name = err?.name || 'Error'
      let status: PermissionStatus = 'error'
      let msg = err?.message || 'No se pudo acceder a la cámara'
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        status = 'denied'
        msg = 'Permiso de cámara denegado. Cambia el ajuste en el navegador y vuelve a intentar.'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        status = 'no_device'
        msg = 'No se detecta ninguna cámara en este dispositivo.'
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        msg = 'La cámara está siendo usada por otra app. Ciérrala y reintenta.'
      }
      safeSetState((s) => ({ ...s, status, error: msg }))
    }
  }, [safeSetState])

  const switchCamera = useCallback(
    async (deviceId: string) => {
      const track = streamRef.current?.getVideoTracks()[0]
      if (track) {
        try {
          await track.applyConstraints({ deviceId: { exact: deviceId } } as MediaTrackConstraints)
          safeSetState((s) => ({ ...s, activeDeviceId: deviceId }))
          return
        } catch {
          // Fallback: stop + start fresh
        }
      }
      stop()
      await start(deviceId)
    },
    [start, stop, safeSetState],
  )

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !state.torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as any] })
      safeSetState((s) => ({ ...s, torchOn: next }))
    } catch {
      // iOS Safari no soporta torch — silenciar
    }
  }, [state.torchOn, safeSetState])

  useEffect(() => {
    mountedRef.current = true
    if (autoStart) {
      void start()
    }
    return () => {
      mountedRef.current = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  return {
    ...state,
    videoRef,
    start,
    stop,
    switchCamera,
    toggleTorch,
  }
}
