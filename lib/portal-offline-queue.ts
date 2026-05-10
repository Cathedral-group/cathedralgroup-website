/**
 * Cola offline de partes de horas — roadmap libro_horas Fase 3
 *
 * Cuando el trabajador envía un parte y la red falla, se guarda en IndexedDB.
 * Cuando vuelve la red (evento 'online' o reapertura del portal), se drena la cola.
 *
 * NO se incluyen tickets/uploads binarios en la cola — esos siguen siendo online-only
 * en el MVP de Fase 3 por complejidad de manejar Blobs grandes en IDB.
 */

import { openDB, type IDBPDatabase } from 'idb'

interface PendingParte {
  id: string
  token: string
  payload: {
    fecha: string
    project_id: string | null
    horas_ordinarias: number
    horas_extra?: number
    horas_nocturnas?: number
    observaciones?: string
  }
  created_at: number
  retry_count: number
  last_error?: string
}

const DB_NAME = 'cathedral-portal'
const DB_VERSION = 1
const STORE_NAME = 'pending-partes'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('by_created_at', 'created_at')
          store.createIndex('by_token', 'token')
        }
      },
    })
  }
  return dbPromise
}

export async function enqueueParte(item: Omit<PendingParte, 'id' | 'created_at' | 'retry_count'>): Promise<string> {
  const db = await getDb()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const record: PendingParte = {
    id,
    ...item,
    created_at: Date.now(),
    retry_count: 0,
  }
  await db.put(STORE_NAME, record)
  return id
}

export async function listPending(token?: string): Promise<PendingParte[]> {
  const db = await getDb()
  if (!token) {
    return db.getAll(STORE_NAME)
  }
  const all = await db.getAll(STORE_NAME)
  return all.filter((r) => r.token === token)
}

export async function countPending(token?: string): Promise<number> {
  return (await listPending(token)).length
}

export async function removeParte(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}

export async function incrementRetry(id: string, error: string): Promise<void> {
  const db = await getDb()
  const existing = (await db.get(STORE_NAME, id)) as PendingParte | undefined
  if (!existing) return
  existing.retry_count = (existing.retry_count ?? 0) + 1
  existing.last_error = error
  await db.put(STORE_NAME, existing)
}

interface DrainResult {
  attempted: number
  succeeded: number
  failed: number
  remaining: number
}

export async function drainQueue(token: string): Promise<DrainResult> {
  const pending = await listPending(token)
  let succeeded = 0
  let failed = 0

  for (const item of pending) {
    try {
      const res = await fetch(`/api/portal/trabajador/${item.token}/parte`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      })
      if (res.ok) {
        await removeParte(item.id)
        succeeded++
      } else {
        // 4xx = error de cliente persistente, no reintentar indefinidamente
        const errorText = await res.text().catch(() => 'unknown')
        if (res.status >= 400 && res.status < 500) {
          // Si es 4xx tras 3 reintentos, descartar para no bloquear
          if (item.retry_count >= 2) {
            await removeParte(item.id)
            failed++
          } else {
            await incrementRetry(item.id, `HTTP ${res.status}: ${errorText}`)
            failed++
          }
        } else {
          await incrementRetry(item.id, `HTTP ${res.status}: ${errorText}`)
          failed++
        }
      }
    } catch (err) {
      await incrementRetry(item.id, err instanceof Error ? err.message : 'Network error')
      failed++
    }
  }

  const remaining = (await listPending(token)).length
  return { attempted: pending.length, succeeded, failed, remaining }
}
