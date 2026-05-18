'use client'

import { useEffect, useState } from 'react'

interface OpenCvState {
  cv: any | null
  scanner: any | null
  loading: boolean
  error: string | null
}

let cachedCv: any | null = null
let cachedScanner: any | null = null
let inflight: Promise<{ cv: any; scanner: any }> | null = null

/**
 * Carga opencv.js + jscanify defensivamente.
 *
 * BUG @techstark/opencv-js #47: `onRuntimeInitialized` puede ser read-only en
 * algunas versiones — asignación silenciosa falla y Promise queda colgada
 * indefinidamente (síntoma "todo bloqueado" producción).
 *
 * Solución: detectar runtime ready vía polling de `cv.Mat`, con timeout 30s
 * para fallar rápido si el WASM nunca carga.
 */
async function loadOpenCvAndScanner(): Promise<{ cv: any; scanner: any }> {
  if (cachedCv && cachedScanner) return { cv: cachedCv, scanner: cachedScanner }
  if (inflight) return inflight

  inflight = (async () => {
    const cvModule: any = (await import('@techstark/opencv-js')).default

    let cv: any
    if (cvModule instanceof Promise) {
      cv = await cvModule
    } else {
      // Esperar runtime con timeout 30s. Usa polling defensivo en vez de
      // depender solo de onRuntimeInitialized (read-only en v4.12 issue #47).
      cv = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(pollId)
          reject(new Error('Timeout cargando opencv.js (30s)'))
        }, 30_000)

        // Si ya está inicializado, resolver inmediatamente
        if (typeof cvModule.Mat === 'function') {
          clearTimeout(timeout)
          resolve(cvModule)
          return
        }

        // Intentar asignar onRuntimeInitialized — falla silenciosa si read-only
        try {
          const prev = cvModule.onRuntimeInitialized
          cvModule.onRuntimeInitialized = () => {
            if (typeof prev === 'function') {
              try { prev() } catch {}
            }
            clearTimeout(timeout)
            clearInterval(pollId)
            resolve(cvModule)
          }
        } catch {
          // read-only — confiamos solo en polling
        }

        // Polling defensivo cada 100ms (cubre el caso read-only y race conditions)
        const pollId: ReturnType<typeof setInterval> = setInterval(() => {
          if (typeof cvModule.Mat === 'function') {
            clearInterval(pollId)
            clearTimeout(timeout)
            resolve(cvModule)
          }
        }, 100)
      })
    }

    // jscanify lee `cv` desde window — UMD module
    if (typeof window !== 'undefined') {
      ;(window as any).cv = cv
    }

    // @ts-expect-error — jscanify v1.4.x sin types oficiales para subpath /client
    const jscanifyModule: any = await import('jscanify/client')
    const JscanifyCtor = jscanifyModule.default || jscanifyModule
    const scanner = new JscanifyCtor()

    cachedCv = cv
    cachedScanner = scanner
    return { cv, scanner }
  })()

  // Si carga falla, limpiar inflight para permitir retry
  inflight.catch(() => {
    inflight = null
  })

  return inflight
}

export function useOpenCv(): OpenCvState {
  const [state, setState] = useState<OpenCvState>({
    cv: cachedCv,
    scanner: cachedScanner,
    loading: !cachedCv,
    error: null,
  })

  useEffect(() => {
    let active = true
    if (cachedCv && cachedScanner) {
      setState({ cv: cachedCv, scanner: cachedScanner, loading: false, error: null })
      return
    }
    loadOpenCvAndScanner()
      .then(({ cv, scanner }) => {
        if (!active) return
        setState({ cv, scanner, loading: false, error: null })
      })
      .catch((err) => {
        if (!active) return
        setState({
          cv: null,
          scanner: null,
          loading: false,
          error: err instanceof Error ? err.message : 'No se pudo cargar el motor de escaneo',
        })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
