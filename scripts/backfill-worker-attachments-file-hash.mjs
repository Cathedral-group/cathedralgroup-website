#!/usr/bin/env node
/**
 * Backfill `worker_attachments.file_hash` para rows existentes.
 *
 * Tarea 8 (ADR-0001 Plan A 16/05/2026). Columna añadida 16/05/2026 noche;
 * rows previos a esa fecha tienen file_hash=NULL. Este script:
 *
 *   1. SELECT rows con file_hash IS NULL AND deleted_at IS NULL
 *   2. Para cada uno: download desde Supabase Storage → SHA-256 hex 64 chars
 *   3. UPDATE row con file_hash computado
 *   4. Idempotente: skip si file_hash ya set (race-safe)
 *   5. Logs progreso + summary final
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/backfill-worker-attachments-file-hash.mjs [--dry-run]
 *
 * Salida:
 *   - exit 0 si OK + N rows backfilled
 *   - exit 1 si error fatal
 */
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos')
  process.exit(1)
}

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

async function sha256Hex(buffer) {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex')
}

async function fetchPendingRows() {
  const url = `${SUPABASE_URL}/rest/v1/worker_attachments?` +
    'select=id,storage_bucket,storage_path,original_filename,size_bytes' +
    '&file_hash=is.null' +
    '&deleted_at=is.null' +
    '&order=created_at.asc' +
    '&limit=500'
  const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`SELECT failed: HTTP ${res.status} ${await res.text()}`)
  }
  return res.json()
}

async function downloadFromStorage(bucket, path) {
  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) {
    throw new Error(`Storage download failed: HTTP ${res.status} ${await res.text()}`)
  }
  return res.arrayBuffer()
}

async function updateFileHash(id, fileHash) {
  // PATCH con If-Match no aplicable en PostgREST; idempotencia via WHERE file_hash IS NULL
  const url = `${SUPABASE_URL}/rest/v1/worker_attachments?id=eq.${id}&file_hash=is.null`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ file_hash: fileHash }),
  })
  if (!res.ok) {
    throw new Error(`UPDATE failed: HTTP ${res.status} ${await res.text()}`)
  }
}

async function main() {
  console.log(`[backfill] DRY_RUN=${DRY_RUN}`)
  const rows = await fetchPendingRows()
  console.log(`[backfill] ${rows.length} rows pending`)

  if (rows.length === 0) {
    console.log('[backfill] Nada que hacer. Exit 0.')
    return
  }

  let ok = 0
  let failed = 0
  const failures = []

  for (const row of rows) {
    const bucket = row.storage_bucket || 'worker-receipts'
    const path = row.storage_path
    const id = row.id
    const fname = row.original_filename ?? '(sin nombre)'

    try {
      const buf = await downloadFromStorage(bucket, path)
      const hash = await sha256Hex(buf)

      // Sanity check: tamaño coherente
      if (typeof row.size_bytes === 'number' && row.size_bytes > 0 && buf.byteLength !== row.size_bytes) {
        console.warn(
          `[backfill] ${id} size mismatch: storage=${buf.byteLength} db=${row.size_bytes} — continúo con hash real`
        )
      }

      if (DRY_RUN) {
        console.log(`[backfill] DRY id=${id} file="${fname}" hash=${hash.slice(0, 16)}…`)
      } else {
        await updateFileHash(id, hash)
        console.log(`[backfill] OK  id=${id} file="${fname}" hash=${hash.slice(0, 16)}…`)
      }
      ok++
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      failures.push({ id, path, error: msg })
      console.error(`[backfill] FAIL id=${id} path=${path} error=${msg}`)
    }
  }

  console.log()
  console.log(`[backfill] Summary: ok=${ok} failed=${failed} total=${rows.length}`)
  if (failures.length > 0) {
    console.log('[backfill] Failures detail:')
    for (const f of failures) {
      console.log(`  - id=${f.id} path=${f.path}`)
      console.log(`    error: ${f.error}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err)
  process.exit(1)
})
