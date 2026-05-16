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
 *   - /api/admin/feature-flag-toggle
 *   - /api/admin/feature-flag-list
 *   - /api/health/utilities
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

await run('OR lookup email_message_id + filename existente → match', async () => {
  // Sample golden dataset 16/05: email '19e2d767957666c9' + 'Factura 0057.pdf'
  // existe en invoices table. Valida lookup v2 OR fallback path.
  const res = await fetch(`${BASE}/api/dedup`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email_message_id: '19e2d767957666c9',
      filename: 'Factura 0057.pdf',
    }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.dedup_method !== 'email_message_id') {
    throw new Error(`expected dedup_method=email_message_id, got ${json.dedup_method}`)
  }
  if (json.source !== 'cathedral-dedup-v2') {
    throw new Error(`expected source=v2, got ${json.source}`)
  }
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

// ─── /api/admin/feature-flag-toggle ──────────────────────────────────────────
console.log('\n[/api/admin/feature-flag-toggle]')

await run('preview update no-op (description igual a actual)', async () => {
  // No-op: description ya es esa, preview previous/current iguales
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      key: 'use_dedup_endpoint',
      description: 'Workflow general: enrutar dedup SHA-256 via /api/dedup en vez de Code node Supabase directo',
    }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (!json.ok) throw new Error('ok=false')
  if (json.previous.enabled !== json.current.enabled) throw new Error('preview enabled mismatch')
  if (json.previous.rollout_pct !== json.current.rollout_pct) throw new Error('preview rollout mismatch')
})

await run('flag inexistente → 404', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key: 'nonexistent_smoke', enabled: true }),
  })
  await expectStatus(res, 404)
})

await run('body sin campos a actualizar → 400', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key: 'use_dedup_endpoint' }),
  })
  await expectStatus(res, 400)
})

await run('rollout_pct fuera rango → 400', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key: 'use_dedup_endpoint', rollout_pct: 150 }),
  })
  await expectStatus(res, 400)
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'use_dedup_endpoint', enabled: false }),
  })
  await expectStatus(res, 401)
})

// ─── /api/admin/feature-flag-batch ────────────────────────────────────────────
console.log('\n[/api/admin/feature-flag-batch]')

await run('batch update 2 flags no-op (preview)', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-batch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      updates: [
        {
          key: 'use_dedup_endpoint',
          description: 'Workflow general: enrutar dedup SHA-256 via /api/dedup en vez de Code node Supabase directo',
        },
        {
          key: 'use_fuzzy_supplier_endpoint',
          description: 'Workflow general: enrutar fuzzy supplier via /api/fuzzy-supplier (pg_trgm server-side) en vez de Code node JS',
        },
      ],
    }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (!json.ok) throw new Error(`batch failed: ${JSON.stringify(json)}`)
  if (json.succeeded !== 2) throw new Error(`expected succeeded=2, got ${json.succeeded}`)
  if (json.failed !== 0) throw new Error(`expected failed=0, got ${json.failed}`)
})

await run('batch flag inexistente → 200 con failed=1', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-batch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ updates: [{ key: 'nonexistent_batch_smoke', enabled: true }] }),
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.ok !== false) throw new Error(`expected ok=false`)
  if (json.failed !== 1) throw new Error(`expected failed=1`)
})

await run('cap >20 items → 400', async () => {
  const updates = Array.from({ length: 25 }, (_, i) => ({ key: `x_${i}`, enabled: false }))
  const res = await fetch(`${BASE}/api/admin/feature-flag-batch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ updates }),
  })
  await expectStatus(res, 400)
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: [{ key: 'x', enabled: false }] }),
  })
  await expectStatus(res, 401)
})

// ─── /api/admin/revalidate-flags-cache ────────────────────────────────────────
console.log('\n[/api/admin/revalidate-flags-cache]')

await run('POST trigger → ok + tag + revalidated_at', async () => {
  const res = await fetch(`${BASE}/api/admin/revalidate-flags-cache`, {
    method: 'POST',
    headers: authHeaders,
  })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.ok !== true) throw new Error('ok=false')
  if (json.tag !== 'feature-flags') throw new Error(`tag=${json.tag}`)
  if (typeof json.revalidated_at !== 'string') throw new Error('revalidated_at not string')
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/revalidate-flags-cache`, { method: 'POST' })
  await expectStatus(res, 401)
})

// ─── /api/admin/feature-flag-snapshot ─────────────────────────────────────────
console.log('\n[/api/admin/feature-flag-snapshot]')

await run('GET snapshot → snapshot_at + flags array + count + metadata', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-snapshot`, { headers: authHeaders })
  await expectStatus(res, 200)
  const json = await res.json()
  if (typeof json.snapshot_at !== 'string') throw new Error('snapshot_at not string')
  if (!Array.isArray(json.flags)) throw new Error('flags not array')
  if (typeof json.count !== 'number') throw new Error('count not number')
  if (json.flags.length < 4) throw new Error(`expected ≥4 flags, got ${json.flags.length}`)
  // Cada flag debe tener campos snapshot completos (no solo essential como list)
  for (const f of json.flags) {
    if (typeof f.created_at !== 'string') throw new Error(`flag ${f.key} missing created_at`)
    if (typeof f.updated_at !== 'string') throw new Error(`flag ${f.key} missing updated_at`)
    if (f.metadata === undefined) throw new Error(`flag ${f.key} missing metadata field`)
  }
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-snapshot`)
  await expectStatus(res, 401)
})

// ─── /api/admin/audit-log-recent ──────────────────────────────────────────────
console.log('\n[/api/admin/audit-log-recent]')

await run('E2E: toggle endpoint → audit row aparece con flag_toggle_api', async () => {
  // 1. Trigger toggle (no-op preview, mismo description que ya tiene)
  const triggerRes = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      key: 'use_dedup_endpoint',
      description:
        'Workflow general: enrutar dedup SHA-256 via /api/dedup en vez de Code node Supabase directo',
    }),
  })
  await expectStatus(triggerRes, 200)

  // 2. Esperar 500ms para que async INSERT propague (con catch defensive
  // en route handler, INSERT no bloquea response — leve race)
  await new Promise((r) => setTimeout(r, 500))

  // 3. Verificar audit row aparece
  const auditRes = await fetch(
    `${BASE}/api/admin/audit-log-recent?table=feature_flags&limit=5`,
    { headers: authHeaders }
  )
  await expectStatus(auditRes, 200)
  const json = await auditRes.json()
  const recentApiRows = json.rows.filter(
    (r) =>
      r.action === 'flag_toggle_api' && r.record_id === 'use_dedup_endpoint'
  )
  if (recentApiRows.length === 0) {
    throw new Error(
      'expected audit row con action=flag_toggle_api record_id=use_dedup_endpoint'
    )
  }
})

await run('GET default limit → rows array + count', async () => {
  const res = await fetch(`${BASE}/api/admin/audit-log-recent?limit=5`, { headers: authHeaders })
  await expectStatus(res, 200)
  const json = await res.json()
  if (!Array.isArray(json.rows)) throw new Error('rows not array')
  if (typeof json.count !== 'number') throw new Error('count not number')
  if (json.count !== json.rows.length) throw new Error('count mismatch')
})

await run('filter table=feature_flags', async () => {
  const res = await fetch(`${BASE}/api/admin/audit-log-recent?table=feature_flags&limit=5`, {
    headers: authHeaders,
  })
  await expectStatus(res, 200)
  const json = await res.json()
  // Si hay rows, deben tener table_name='feature_flags'
  for (const row of json.rows) {
    if (row.table_name !== 'feature_flags') {
      throw new Error(`table filter broken: got ${row.table_name}`)
    }
  }
})

await run('limit > 200 → 400 validation', async () => {
  const res = await fetch(`${BASE}/api/admin/audit-log-recent?limit=500`, { headers: authHeaders })
  await expectStatus(res, 400)
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/audit-log-recent`)
  await expectStatus(res, 401)
})

// ─── /api/admin/feature-flag-delete ───────────────────────────────────────────
console.log('\n[/api/admin/feature-flag-delete]')

await run('flag inexistente → 404', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-delete`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      key: 'nonexistent_smoke_delete',
      confirm: 'DELETE-nonexistent_smoke_delete',
    }),
  })
  await expectStatus(res, 404)
})

await run('confirm wrong → 400', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-delete`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key: 'use_dedup_endpoint', confirm: 'WRONG' }),
  })
  await expectStatus(res, 400)
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'x', confirm: 'DELETE-x' }),
  })
  await expectStatus(res, 401)
})

// ─── /api/admin/feature-flag-list ─────────────────────────────────────────────
console.log('\n[/api/admin/feature-flag-list]')

await run('GET con auth → flags array + count', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-list`, { headers: authHeaders })
  await expectStatus(res, 200)
  const json = await res.json()
  if (!Array.isArray(json.flags)) throw new Error('flags not array')
  if (typeof json.count !== 'number') throw new Error('count not number')
  if (json.count !== json.flags.length) throw new Error('count mismatch flags.length')
  if (json.flags.length < 4) throw new Error(`expected ≥4 flags seed, got ${json.flags.length}`)
  // Cada flag debe tener campos canónicos
  for (const f of json.flags) {
    if (typeof f.key !== 'string') throw new Error(`flag missing key: ${JSON.stringify(f)}`)
    if (typeof f.enabled !== 'boolean') throw new Error(`flag ${f.key} enabled not boolean`)
    if (typeof f.rollout_pct !== 'number') throw new Error(`flag ${f.key} rollout_pct not number`)
  }
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/admin/feature-flag-list`)
  await expectStatus(res, 401)
})

// ─── /api/health/utilities ────────────────────────────────────────────────────
console.log('\n[/api/health/utilities]')

await run('GET con auth → status ok + 4 flags presentes', async () => {
  const res = await fetch(`${BASE}/api/health/utilities`, { headers: authHeaders })
  await expectStatus(res, 200)
  const json = await res.json()
  if (json.status !== 'ok') throw new Error(`status=${json.status}`)
  if (!Array.isArray(json.flags_status)) throw new Error('flags_status not array')
  if (json.flags_status.length < 4) throw new Error(`expected ≥4 flags, got ${json.flags_status.length}`)
  if (!json.checks?.supabase_connectivity?.ok) throw new Error('supabase down')
  if (!json.checks?.feature_flags_table?.ok) throw new Error('feature_flags table fail')
  if (!json.checks?.expected_flags_present?.ok) throw new Error('expected flags missing')
})

await run('sin auth → 401', async () => {
  const res = await fetch(`${BASE}/api/health/utilities`)
  await expectStatus(res, 401)
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
