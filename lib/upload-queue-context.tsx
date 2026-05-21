/**
 * UploadQueueContext — cola upload global Cathedral Group
 *
 * Bug solucionado: usuario navega `/admin/upload` → otra página → cola se
 * detiene porque componente UploadView se desmonta y aborta fetches.
 *
 * Solución: Provider en `app/admin/layout.tsx` (App Router layout NO re-renderiza
 * en navegación → state persiste mientras pestaña viva). UploadView consume
 * contexto. Cualquier vista admin lee `useUploadQueue()` para badge sidebar.
 *
 * Limitaciones aceptadas:
 *  - F5 / cierre pestaña → cola muere (File objects no serializables IndexedDB)
 *  - Service Worker Background Sync FUTURO (Safari 2026 sin soporte fiable)
 */
'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'

export type QueueStatus = 'pending' | 'processing' | 'success' | 'error'

export interface QueueItem {
  id: string
  file: File
  status: QueueStatus
  message?: string
  result?: { invoiceId?: string; empresa?: string; amount?: number }
  previewUrl?: string
  sizeKB: number
  isImage: boolean
}

interface UploadQueueContextValue {
  queue: QueueItem[]
  addFiles: (files: File[]) => void
  processBatch: () => Promise<void>
  cancelItem: (id: string) => void
  clearCompleted: () => void
  clearAll: () => void
  batchRunning: boolean
  currentItemId: string | null
  globalError: string | null
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null)

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPTED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const THROTTLE_MS = 800
const MAX_QUEUE_ITEMS = 100

function isCompressibleImage(f: File): boolean {
  return f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/webp'
}

async function compressIfNeeded(file: File): Promise<File> {
  if (!isCompressibleImage(file) || file.size <= 2 * 1024 * 1024) return file
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 2,
      maxWidthOrHeight: 2400,
      useWebWorker: true,
    })
    return compressed
  } catch {
    return file
  }
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [currentItemId, setCurrentItemId] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const queueRef = useRef<QueueItem[]>([])
  queueRef.current = queue

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const accepted: QueueItem[] = []
    let rejectedCount = 0
    for (const file of files) {
      if (queueRef.current.length + accepted.length >= MAX_QUEUE_ITEMS) {
        rejectedCount++
        continue
      }
      if (!ACCEPTED_MIMES.includes(file.type)) {
        rejectedCount++
        continue
      }
      if (file.size === 0 || file.size > MAX_FILE_BYTES) {
        rejectedCount++
        continue
      }
      const id = crypto.randomUUID()
      const isImage = file.type.startsWith('image/')
      accepted.push({
        id,
        file,
        status: 'pending',
        sizeKB: Math.round(file.size / 1024),
        isImage,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      })
    }
    if (accepted.length > 0) setQueue((prev) => [...prev, ...accepted])
    if (rejectedCount > 0) setGlobalError(`${rejectedCount} archivo(s) rechazados (tamaño/tipo no admitido o cola llena)`)
  }, [])

  const cancelItem = useCallback((id: string) => {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id)
      if (item?.previewUrl) {
        try { URL.revokeObjectURL(item.previewUrl) } catch { /* ignore */ }
      }
      return prev.filter((q) => q.id !== id)
    })
  }, [])

  const clearCompleted = useCallback(() => {
    setQueue((prev) => {
      const remaining: QueueItem[] = []
      for (const it of prev) {
        if (it.status === 'success' || it.status === 'error') {
          if (it.previewUrl) { try { URL.revokeObjectURL(it.previewUrl) } catch { /* ignore */ } }
        } else {
          remaining.push(it)
        }
      }
      return remaining
    })
  }, [])

  const clearAll = useCallback(() => {
    queueRef.current.forEach((it) => {
      if (it.previewUrl) { try { URL.revokeObjectURL(it.previewUrl) } catch { /* ignore */ } }
    })
    setQueue([])
    setGlobalError(null)
    setCurrentItemId(null)
  }, [])

  async function uploadFile(file: File): Promise<{ id: string; doc_type?: string; status?: string; empresa?: string; amount?: number }> {
    const finalFile = await compressIfNeeded(file)
    const fd = new FormData()
    fd.append('file', finalFile)
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`
      try {
        const err = await res.json()
        if (err?.error) errMsg = err.error
      } catch { /* ignore */ }
      if (/uq_admin_uploads_company_hash|duplicate key.*hash/i.test(errMsg)) {
        errMsg = 'Archivo duplicado — ya está en la base de datos (mismo contenido).'
      } else if (/duplicate key/i.test(errMsg)) {
        errMsg = 'Archivo duplicado — registro ya existe.'
      }
      throw new Error(errMsg)
    }
    return res.json()
  }

  const processBatch = useCallback(async () => {
    if (batchRunning) return
    const pendings = queueRef.current.filter((it) => it.status === 'pending')
    if (pendings.length === 0) {
      setGlobalError('No hay archivos pendientes en la cola.')
      return
    }
    setBatchRunning(true)
    setGlobalError(null)
    for (const item of pendings) {
      const current = queueRef.current.find((q) => q.id === item.id)
      if (!current || current.status !== 'pending') continue
      setCurrentItemId(item.id)
      updateItem(item.id, { status: 'processing', message: undefined })
      try {
        const result = await uploadFile(current.file)
        updateItem(item.id, {
          status: 'success',
          result: { invoiceId: result.id, empresa: result.empresa, amount: result.amount },
          message: result.doc_type ? `OK · ${result.doc_type}` : 'OK',
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        updateItem(item.id, { status: 'error', message: msg })
      }
      await new Promise((r) => setTimeout(r, THROTTLE_MS))
    }
    setBatchRunning(false)
    setCurrentItemId(null)
  }, [batchRunning, updateItem])

  // Auto-start batch cuando se añaden archivos pending y no hay batch corriendo
  useEffect(() => {
    if (batchRunning) return
    const hasPending = queueRef.current.some((it) => it.status === 'pending')
    if (hasPending) {
      void processBatch()
    }
  }, [queue, batchRunning, processBatch])

  return (
    <UploadQueueContext.Provider
      value={{
        queue,
        addFiles,
        processBatch,
        cancelItem,
        clearCompleted,
        clearAll,
        batchRunning,
        currentItemId,
        globalError,
      }}
    >
      {children}
    </UploadQueueContext.Provider>
  )
}

export function useUploadQueue(): UploadQueueContextValue {
  const ctx = useContext(UploadQueueContext)
  if (!ctx) {
    throw new Error('useUploadQueue must be used within <UploadQueueProvider>')
  }
  return ctx
}

/** Hook ligero que devuelve solo contadores para badges sidebar. */
export function useUploadQueueCounts() {
  const { queue, batchRunning } = useUploadQueue()
  return {
    total: queue.length,
    pending: queue.filter((q) => q.status === 'pending').length,
    processing: queue.filter((q) => q.status === 'processing').length,
    success: queue.filter((q) => q.status === 'success').length,
    error: queue.filter((q) => q.status === 'error').length,
    batchRunning,
  }
}
