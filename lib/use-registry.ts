/**
 * Hook React useRegistry — consume el SSOT registry con cache en cliente.
 *
 * Cache 5 min en sessionStorage + 1 fetch en background al cargar.
 * Componentes UI reemplazan listas hardcoded por:
 *
 *   const { registry, loading, error } = useRegistry()
 *   if (loading) return <Skeleton />
 *   const docTypes = registry.doc_types
 */
'use client'

import { useEffect, useState } from 'react'
import type { Registry } from './registry'

const CACHE_KEY = '__cathedral_registry_cache_v1'
const TTL_MS = 5 * 60 * 1000 // 5 min

type CacheEntry = { fetched_at: number; data: Registry }

function readCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (Date.now() - parsed.fetched_at > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(data: Registry) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ fetched_at: Date.now(), data }))
  } catch {
    // sessionStorage llena o deshabilitada — silent fail
  }
}

export function useRegistry() {
  const [registry, setRegistry] = useState<Registry | null>(() => {
    const cached = readCache()
    return cached?.data || null
  })
  const [loading, setLoading] = useState<boolean>(() => readCache() === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/registry')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: Registry = await res.json()
        if (cancelled) return
        setRegistry(data)
        writeCache(data)
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (!registry) {
      load()
    } else {
      // background refresh para mantener cache fresca
      load()
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { registry, loading, error }
}

/** Invalida el cache sessionStorage. Úsalo tras editar registry desde UI admin. */
export function invalidateRegistryCache() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
