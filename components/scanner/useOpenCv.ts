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

async function loadOpenCvAndScanner(): Promise<{ cv: any; scanner: any }> {
  if (cachedCv && cachedScanner) return { cv: cachedCv, scanner: cachedScanner }
  if (inflight) return inflight

  inflight = (async () => {
    const cvModule: any = (await import('@techstark/opencv-js')).default
    let cv: any
    if (cvModule instanceof Promise) {
      cv = await cvModule
    } else if (cvModule.onRuntimeInitialized !== undefined) {
      await new Promise<void>((resolve) => {
        if (typeof cvModule.Mat === 'function') {
          resolve()
        } else {
          cvModule.onRuntimeInitialized = () => resolve()
        }
      })
      cv = cvModule
    } else {
      cv = cvModule
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
