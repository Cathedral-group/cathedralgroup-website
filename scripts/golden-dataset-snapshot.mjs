#!/usr/bin/env node
/**
 * Golden dataset snapshot — 50 facturas recientes Cathedral
 *
 * Uso:
 *   node scripts/golden-dataset-snapshot.mjs [--limit=50] [--out=path]
 *
 * Output: JSON con 50 facturas + sus campos clave dedup/fuzzy/decide-table.
 * Prerequisito Tarea 4 (cutover workflow general): reprocesar este set tras
 * cutover y verificar diffs cero para cada campo crítico.
 *
 * Campos snapshot:
 *   - id, number, file_hash, email_message_id, original_filename
 *   - supplier_id, supplier_nif, supplier_name (vía join)
 *   - project_id, project_code (vía join)
 *   - direction, doc_type, review_status
 *   - created_at, deleted_at
 *
 * Env vars requeridas:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const args = process.argv.slice(2)
const argLimit = args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '50'
const argOut = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? null

const LIMIT = parseInt(argLimit, 10)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos en env')
  process.exit(1)
}

if (!Number.isFinite(LIMIT) || LIMIT < 1 || LIMIT > 500) {
  console.error('Error: --limit debe ser entre 1 y 500')
  process.exit(1)
}

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json',
}

console.log(`Fetching ${LIMIT} facturas recientes…`)

// Select con embedded resources (suppliers, projects). PostgREST sintaxis FK auto-detect.
const url = `${SUPABASE_URL}/rest/v1/invoices?select=` +
  encodeURIComponent(
    'id,number,file_hash,email_message_id,original_filename,direction,doc_type,review_status,payment_status,supplier_id,supplier_nif,project_id,issue_date,amount_total,created_at,deleted_at,suppliers(id,name,nif),projects(id,code,name)'
  ) +
  '&deleted_at=is.null' +
  '&order=created_at.desc' +
  `&limit=${LIMIT}`

const res = await fetch(url, { headers: HEADERS })
if (!res.ok) {
  console.error(`Error HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const rows = await res.json()
console.log(`✓ Recibidas ${rows.length} filas`)

// Snapshot estandarizado — orden estable de campos para diff posterior
const snapshot = rows.map((r) => ({
  id: r.id,
  number: r.number,
  file_hash: r.file_hash,
  email_message_id: r.email_message_id,
  original_filename: r.original_filename,
  direction: r.direction,
  doc_type: r.doc_type,
  review_status: r.review_status,
  payment_status: r.payment_status,
  supplier_id: r.supplier_id,
  supplier_nif: r.supplier_nif,
  supplier_name: r.suppliers?.name ?? null,
  project_id: r.project_id,
  project_code: r.projects?.code ?? null,
  project_name: r.projects?.name ?? null,
  issue_date: r.issue_date,
  amount_total: r.amount_total,
  created_at: r.created_at,
}))

// Estadísticas básicas para sanity-check
const stats = {
  total: snapshot.length,
  with_file_hash: snapshot.filter((r) => r.file_hash).length,
  with_supplier_id: snapshot.filter((r) => r.supplier_id).length,
  with_project_id: snapshot.filter((r) => r.project_id).length,
  with_supplier_nif: snapshot.filter((r) => r.supplier_nif).length,
  direction_emitida: snapshot.filter((r) => r.direction === 'emitida').length,
  direction_recibida: snapshot.filter((r) => r.direction === 'recibida').length,
  doc_types: Object.fromEntries(
    Object.entries(
      snapshot.reduce((acc, r) => {
        acc[r.doc_type] = (acc[r.doc_type] ?? 0) + 1
        return acc
      }, {})
    ).sort((a, b) => b[1] - a[1])
  ),
}

const output = {
  meta: {
    generated_at: new Date().toISOString(),
    limit_requested: LIMIT,
    rows_received: snapshot.length,
    source: 'invoices table, soft-deleted excluded, order created_at DESC',
    stats,
  },
  snapshot,
}

const outPath = argOut
  ? resolve(argOut)
  : join(
      process.cwd(),
      `golden-dataset-${new Date().toISOString().slice(0, 10)}.json`
    )

writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`✓ Snapshot escrito: ${outPath}`)
console.log(`✓ Tamaño: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`)
console.log()
console.log('Stats:')
console.log(`  Total: ${stats.total}`)
console.log(`  Con file_hash: ${stats.with_file_hash}/${stats.total}`)
console.log(`  Con supplier_id: ${stats.with_supplier_id}/${stats.total}`)
console.log(`  Con project_id: ${stats.with_project_id}/${stats.total}`)
console.log(`  Direction emitida: ${stats.direction_emitida}, recibida: ${stats.direction_recibida}`)
console.log(`  Doc types:`)
for (const [t, n] of Object.entries(stats.doc_types)) {
  console.log(`    ${t}: ${n}`)
}
