#!/usr/bin/env node
/**
 * Smoke test integración 4 utility endpoints Cathedral.
 *
 * Uso:
 *   CATHEDRAL_INTERNAL_TOKEN=... [BASE_URL=...] \
 *     node scripts/smoke-test-utilities.mjs
 *
 * Default BASE_URL: https://cathedralgroup-website.vercel.app
 *
 * Endpoints probados:
 *   - /api/feature-flag-check
 *   - /api/dedup (v2)
 *   - /api/fuzzy-supplier
 *   - /api/fuzzy-ticket-invoice
 *   - /api/decide-table (v2)
 *
 * Para cada endpoint: 3-5 casos (happy path + edge + auth).
 *
 * Exit 0 = todos pass. Exit 1 = al menos 1 fail.
 * Run periódico recomendado: pre-deploy, post-deploy, pre-cutover, semanal.
 */
import { performance } from 'node:perf_hooks'

const TOKEN = process.env.CATHEDRAL_INTERNAL_TOKEN
const BASE = (process.env.BASE_URL ?? 'https://cathedralgroup-website.vercel.app').replace(/\/$/, '')

if (!TOKEN) {
  console.error('Error: CATHEDRAL_INTERNAL_TOKEN env var requerida')
  process.exit(1)
}

let passed = 0
let failed = 0
const failures = []

async function run(name, fn) {
  const t0 = performance.now()
  try {
    await fn()
    const dt = (performance.now() - t0).toFixed(0)
    console.log(`  ✓ ${name} (${dt}ms)`)
    passed++
  } catch (err) {
    const dt = (performance.now() - t0).toFixed(0)
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  ✗ ${name} (${dt}ms) — ${msg}`)
    failures.push({ name, msg })
    failed++
  }
}

async function expectStatus(res, status) {
  if (res.status !== status) {
    let body = ''
    try {
      body = await res.text()
    } catch {}
    throw new Error(`expected HTTP ${status}, got ${res.status}: ${body.slice(0, 200)}`)
  }
}

async function expectJsonField(res, field, predicate, label) {
  const json = await res.json()
  const val = json[field]
  if (!predicate(val)) {
    throw new Error(`field ${field}: expected ${label}, got ${JSON.stringify(val)}`)
  }
  return json
}

const authHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
}

// ─── /api/feature-flag-check ──────────────────────────────────────────────────
console.log('\n[/api/feature-flag-check]')

await run('flag existente → 200 + should_use boolean', async () => {
  const res = await fetch(
    `${BASE}/api/feature-flag-check?key=use_dedup_endpoint&subject_id=smoke-test`,
    { headers: authHeaders }
  )
  await expectStatus(res, 200)
  await expectJsonField(res, 'should_use', (v) => typeof v === 'boolean', 'boolean')
})

await run('flag inexistente → 404', async () => {
  const res = await fetch(
    `${BASE}/api/feature-flag-check?key=nonexistent_smoke&subject_id=x`,
    { headers: authHeaders }
  )
  await expectStatus(res, 404)
})

await run('sin auth → 401', async () => {
  const res = await fetch(
    `${BASE}/api/feature-flag-check?key=use_dedup_endpoint&subject_id=x`
  )
  await expectStatus(res, 401)
})

await run('key invalida → 400', async () => {
  const res = await fetch(
    `${BASE}/api/feature-flag-check?key=INVALID-KEY&subject_id=x`,
    { headers: authHeaders }
  )
  await expectStatus(res, 400)
})

// ─── /api/dedup v2 ────────────────────────────────────────────────────────────
console.log('\n[/api/dedup v2]')

await run('file_hash inexistente → is_duplicate=false', async () => {
  const res = await fetch(`${BASE}/api/dedup`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      file_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.is_duplicate !== false) throw new Error(`expected is_duplicate=false`)
  if (json.source !== 'cathedral-dedup-v2') throw new Error(`expected source v2, got ${json.source}`)
})

await run('body vacio → 400', async () => {
  const res = await fetch(`${BASE}/api/dedup`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  })
  await expectStatus(res, 400)
})

await run('solo email_message_id sin filename → 400', async () => {
  const res = await fetch(`${BASE}/api/dedup`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email_message_id: 'test' }),
  })
  await expectStatus(res, 400)
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/dedup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_hash: 'a'.repeat(64) }),
  })
  await expectStatus(res, 401)
})

// ─── /api/fuzzy-supplier ──────────────────────────────────────────────────────
console.log('\n[/api/fuzzy-supplier]')

await run('nombre proveedor con NIF → 200 + estructura correcta', async () => {
  const res = await fetch(`${BASE}/api/fuzzy-supplier`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'NombreInexistenteParaSmokeTest', nif: 'B99999999' }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (typeof json.match_found !== 'boolean') throw new Error('match_found not boolean')
  if (!Array.isArray(json.candidates)) throw new Error('candidates not array')
})

await run('name vacio → 400', async () => {
  const res = await fetch(`${BASE}/api/fuzzy-supplier`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: '' }),
  })
  await expectStatus(res, 400)
})

// ─── /api/fuzzy-ticket-invoice ────────────────────────────────────────────────
console.log('\n[/api/fuzzy-ticket-invoice]')

await run('NIF + importe + fecha → 200 + candidates array', async () => {
  const res = await fetch(`${BASE}/api/fuzzy-ticket-invoice`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      supplier_nif: 'B99999999',
      amount: 100,
      issue_date: '2026-01-01',
    }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (!Array.isArray(json.candidates)) throw new Error('candidates not array')
  if (typeof json.query_params?.min_amt !== 'number') throw new Error('query_params.min_amt')
})

await run('amount=0 → 400', async () => {
  const res = await fetch(`${BASE}/api/fuzzy-ticket-invoice`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ supplier_nif: 'B12345678', amount: 0, issue_date: '2026-01-01' }),
  })
  await expectStatus(res, 400)
})

await run('fecha mal formada → 400', async () => {
  const res = await fetch(`${BASE}/api/fuzzy-ticket-invoice`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ supplier_nif: 'B12345678', amount: 100, issue_date: '01/01/2026' }),
  })
  await expectStatus(res, 400)
})

// ─── /api/decide-table v2 ─────────────────────────────────────────────────────
console.log('\n[/api/decide-table v2]')

await run('nomina → payrolls', async () => {
  const res = await fetch(`${BASE}/api/decide-table`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ doc_type: 'nomina' }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.table !== 'payrolls') throw new Error(`expected payrolls, got ${json.table}`)
  if (json.source !== 'cathedral-decide-table-v2') throw new Error(`expected source v2`)
})

await run('cotizacion → quotes', async () => {
  const res = await fetch(`${BASE}/api/decide-table`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ doc_type: 'cotizacion' }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.table !== 'quotes') throw new Error(`expected quotes, got ${json.table}`)
})

await run('contrato → documents', async () => {
  const res = await fetch(`${BASE}/api/decide-table`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ doc_type: 'contrato' }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.table !== 'documents') throw new Error(`expected documents, got ${json.table}`)
})

await run('modelo_fiscal Cathedral → tax_filings', async () => {
  const res = await fetch(`${BASE}/api/decide-table`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ doc_type: 'modelo_fiscal', supplier_nif: 'B19761915' }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.table !== 'tax_filings') throw new Error(`expected tax_filings, got ${json.table}`)
})

await run('regex hipoteca concept → invoices needs_review', async () => {
  const res = await fetch(`${BASE}/api/decide-table`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      doc_type: 'factura',
      concept: 'Cuota mensual del préstamo hipotecario',
    }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.table !== 'invoices') throw new Error(`expected invoices, got ${json.table}`)
  if (json.action !== 'needs_review') throw new Error(`expected needs_review`)
})

await run('doc_type ausente → 400', async () => {
  const res = await fetch(`${BASE}/api/decide-table`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  })
  await expectStatus(res, 400)
})

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log()
console.log(`Smoke test summary: ${passed} passed, ${failed} failed (total ${passed + failed})`)
if (failed > 0) {
  console.log()
  console.log('Failures:')
  for (const f of failures) console.log(`  - ${f.name}: ${f.msg}`)
  process.exit(1)
}
console.log('✓ Todos los endpoints OK.')
process.exit(0)
