#!/usr/bin/env node
/**
 * Golden dataset comparator — verifica regresiones post-cutover utility endpoints.
 *
 * Uso:
 *   node scripts/golden-dataset-compare.mjs <baseline.json> [--limit=50]
 *
 * Lee baseline guardado por `golden-dataset-snapshot.mjs` y compara contra
 * estado actual de las mismas IDs. Cualquier diff en campos críticos =
 * potencial regresión.
 *
 * Tolerancia 0 en:
 *   - file_hash (SHA-256 inmutable post-upload)
 *   - direction, doc_type (clasificación inicial inmutable)
 *   - issue_date, amount_total (inmutables post-OCR)
 *
 * Tolerancia configurable (--allow-shift):
 *   - supplier_id, project_id (puede cambiar por re-corroboración)
 *   - review_status, payment_status (cambia con uso normal)
 *
 * Exit codes:
 *   0 = 0 diffs en campos críticos
 *   1 = diffs en campos críticos detectados
 *   2 = error fatal (baseline corrupto, BD down, etc.)
 *
 * Recomendado en pipeline pre-cutover:
 *   - Generar baseline ANTES de cutover
 *   - Activar feature flag rollout_pct=10
 *   - Esperar 24h → correr este script
 *   - Si exit 0 → subir rollout 50 → 24h → 100
 *   - Si exit 1 → rollback rollout_pct=0 + investigar diff
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const BASELINE_PATH = args.find((a) => !a.startsWith('--'))
const ALLOW_SHIFT = args.includes('--allow-shift')

if (!BASELINE_PATH) {
  console.error('Uso: node scripts/golden-dataset-compare.mjs <baseline.json> [--allow-shift]')
  process.exit(2)
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos')
  process.exit(2)
}

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json',
}

const CRITICAL_FIELDS = [
  'file_hash',
  'direction',
  'doc_type',
  'issue_date',
  'amount_total',
]

const MUTABLE_FIELDS = ['supplier_id', 'project_id', 'review_status', 'payment_status']

const baselineRaw = readFileSync(resolve(BASELINE_PATH), 'utf-8')
const baseline = JSON.parse(baselineRaw)
const baselineSnapshot = baseline.snapshot
console.log(`[compare] Baseline: ${BASELINE_PATH}`)
console.log(`[compare] Generado: ${baseline.meta.generated_at}`)
console.log(`[compare] Rows: ${baselineSnapshot.length}`)
console.log()

// Fetch estado actual mismos IDs
const ids = baselineSnapshot.map((r) => r.id)
const idsParam = ids.join(',')
const url = `${SUPABASE_URL}/rest/v1/invoices?select=` +
  encodeURIComponent(
    'id,number,file_hash,email_message_id,original_filename,direction,doc_type,review_status,payment_status,supplier_id,supplier_nif,project_id,issue_date,amount_total,created_at,deleted_at,suppliers(id,name,nif),projects(id,code,name)'
  ) +
  `&id=in.(${idsParam})`

const res = await fetch(url, { headers: HEADERS })
if (!res.ok) {
  console.error(`Error HTTP ${res.status}: ${await res.text()}`)
  process.exit(2)
}
const currentRows = await res.json()
console.log(`[compare] Current rows: ${currentRows.length}`)

const byId = new Map(currentRows.map((r) => [r.id, r]))

const criticalDiffs = []
const mutableDiffs = []
const missing = []

for (const base of baselineSnapshot) {
  const cur = byId.get(base.id)
  if (!cur) {
    missing.push(base.id)
    continue
  }

  // Normalizar shape current → mismo formato baseline
  const curFlat = {
    id: cur.id,
    file_hash: cur.file_hash,
    direction: cur.direction,
    doc_type: cur.doc_type,
    issue_date: cur.issue_date,
    amount_total: cur.amount_total,
    supplier_id: cur.supplier_id,
    project_id: cur.project_id,
    review_status: cur.review_status,
    payment_status: cur.payment_status,
  }

  for (const field of CRITICAL_FIELDS) {
    if (base[field] !== curFlat[field]) {
      criticalDiffs.push({
        id: base.id,
        field,
        baseline: base[field],
        current: curFlat[field],
      })
    }
  }
  for (const field of MUTABLE_FIELDS) {
    if (base[field] !== curFlat[field]) {
      mutableDiffs.push({
        id: base.id,
        field,
        baseline: base[field],
        current: curFlat[field],
      })
    }
  }
}

console.log()
console.log(`[compare] Summary:`)
console.log(`  Missing rows: ${missing.length}`)
console.log(`  Critical diffs (fail): ${criticalDiffs.length}`)
console.log(`  Mutable diffs (info): ${mutableDiffs.length}`)
console.log()

if (missing.length > 0) {
  console.log('Missing rows (soft-deleted desde baseline?):')
  for (const id of missing.slice(0, 5)) console.log(`  - ${id}`)
  if (missing.length > 5) console.log(`  ... ${missing.length - 5} más`)
}

if (criticalDiffs.length > 0) {
  console.log('CRITICAL DIFFS (regresión potencial):')
  for (const d of criticalDiffs.slice(0, 20)) {
    console.log(`  ${d.id} ${d.field}: ${JSON.stringify(d.baseline)} → ${JSON.stringify(d.current)}`)
  }
  if (criticalDiffs.length > 20) console.log(`  ... ${criticalDiffs.length - 20} más`)
}

if (mutableDiffs.length > 0 && !ALLOW_SHIFT) {
  console.log()
  console.log('Mutable diffs (esperados con uso normal):')
  for (const d of mutableDiffs.slice(0, 10)) {
    console.log(`  ${d.id} ${d.field}: ${JSON.stringify(d.baseline)} → ${JSON.stringify(d.current)}`)
  }
  if (mutableDiffs.length > 10) console.log(`  ... ${mutableDiffs.length - 10} más`)
}

if (criticalDiffs.length > 0) {
  console.log()
  console.log('❌ FAIL: hay diffs en campos críticos. Rollback rollout_pct=0 + investigar.')
  process.exit(1)
}

console.log()
console.log('✓ PASS: 0 diffs en campos críticos. Seguro continuar rollout.')
process.exit(0)
