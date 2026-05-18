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

/**
 * Selecciona cámara trasera priorizando heurísticas robustas para iOS Safari.
 * iOS Safari WebKit bug #253186 hace que `facingMode: 'environment'` a veces
 * seleccione ultra-gran-angular. Estrategia:
 * 1. enumerateDevices() (requiere permiso previo)
 * 2. Buscar device cuya label contenga "back" / "rear" / "trasera" / "environment"
 * 3. Si solo 1 cámara, usarla. Si varias, última suele ser trasera en iOS
 */
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

export function useCamera(autoStart: boolean = true): CameraControls {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({
    status: 'pending',
    error: null,
    videoDevices: [],
    activeDeviceId: null,
    hasTorch: false,
    torchOn: false,
  })

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
      setState((s) => ({
        ...s,
        status: 'no_device',
        error: 'Tu navegador no soporta acceso a cámara',
      }))
      return
    }

    setState((s) => ({ ...s, status: 'requesting', error: null }))

    try {
      // Primero pedimos permiso con constraint suave para que enumerateDevices devuelva labels
      const initialConstraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: { facingMode: { ideal: 'environment' } }, audio: false }

      let stream = await navigator.mediaDevices.getUserMedia(initialConstraints)

      // Tras permiso, listar devices con labels
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = allDevices.filter((d) => d.kind === 'videoinput')

      // Si no se forzó deviceId, intentar rear con heurística
      if (!deviceId && videoDevices.length > 1) {
        const rearId = pickRearCamera(videoDevices)
        const currentTrack = stream.getVideoTracks()[0]
        const currentDeviceId = currentTrack?.getSettings().deviceId
        if (rearId && rearId !== currentDeviceId) {
          stream.getTracks().forEach((t) => t.stop())
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: rearId } },
            audio: false,
          })
        }
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.playsInline = true
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => {})
      }

      const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null
      const track = stream.getVideoTracks()[0]
      const caps: any = typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {}
      const hasTorch = !!caps?.torch

      setState({
        status: 'granted',
        error: null,
        videoDevices,
        activeDeviceId: activeId,
        hasTorch,
        torchOn: false,
      })
    } catch (err: any) {
      const name = err?.name || 'Error'
      let status: PermissionStatus = 'error'
      let msg = 'No se pudo acceder a la cámara'
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        status = 'denied'
        msg = 'Permiso de cámara denegado. Cambia el ajuste en el navegador y vuelve a intentar.'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        status = 'no_device'
        msg = 'No se detecta ninguna cámara en este dispositivo.'
      }
      setState((s) => ({ ...s, status, error: msg }))
    }
  }, [])

  const switchCamera = useCallback(
    async (deviceId: string) => {
      stop()
      await start(deviceId)
    },
    [start, stop],
  )

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !state.torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as any] })
      setState((s) => ({ ...s, torchOn: next }))
    } catch {
      // iOS Safari no soporta torch — silenciar
    }
  }, [state.torchOn])

  useEffect(() => {
    if (autoStart) {
      void start()
    }
    return () => {
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
