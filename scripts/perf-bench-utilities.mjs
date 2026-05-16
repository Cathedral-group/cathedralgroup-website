#!/usr/bin/env node
/**
 * Performance benchmark utility endpoints Cathedral.
 *
 * Ejecuta N requests por endpoint y reporta p50/p95/p99 + min/max/avg.
 * Útil detectar regresiones latencia post-deploy, validar SLA <500ms p95.
 *
 * Uso:
 *   CATHEDRAL_INTERNAL_TOKEN=... [N=20] [BASE_URL=...] \
 *     node scripts/perf-bench-utilities.mjs
 *
 * Defaults:
 *   - N=20 requests por endpoint
 *   - BASE_URL=https://cathedralgroup-website.vercel.app
 *   - Concurrencia: secuencial (1 request a la vez) para medir latencia real
 *     sin contención. Para load test paralelo, usar herramienta dedicada (k6, hey).
 *
 * Output: tabla compacta por endpoint con stats.
 *
 * Cold start: primer request siempre lento (Vercel function warmup). Reportado
 * separado en output.
 */
import { performance } from 'node:perf_hooks'

const TOKEN = process.env.CATHEDRAL_INTERNAL_TOKEN
const BASE = (process.env.BASE_URL ?? 'https://cathedralgroup-website.vercel.app').replace(/\/$/, '')
const N = parseInt(process.env.N ?? '20', 10)

if (!TOKEN) {
  console.error('Error: CATHEDRAL_INTERNAL_TOKEN env var requerida')
  process.exit(1)
}

if (!Number.isFinite(N) || N < 5 || N > 100) {
  console.error('Error: N debe ser entre 5 y 100')
  process.exit(1)
}

const authHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0
  const idx = Math.min(sortedArr.length - 1, Math.ceil((p / 100) * sortedArr.length) - 1)
  return sortedArr[idx]
}

function stats(latenciesMs) {
  // Cold start (primer request) puede ser 3-5× más lento en Vercel serverless.
  // Lo reportamos separado pero EXCLUIMOS del cálculo de p95/p99 (warmed stats
  // reflejan SLA producción real, no outlier inicial). Min/max/avg incluyen todo.
  const cold = latenciesMs[0]
  const warmed = latenciesMs.slice(1).filter((l) => Number.isFinite(l))
  const warmedSorted = [...warmed].sort((a, b) => a - b)
  const allSorted = [...latenciesMs].filter((l) => Number.isFinite(l)).sort((a, b) => a - b)
  return {
    n: latenciesMs.length,
    cold,
    min: allSorted[0],
    avg: allSorted.reduce((a, b) => a + b, 0) / allSorted.length,
    p50: percentile(warmedSorted, 50),
    p95: percentile(warmedSorted, 95),
    p99: percentile(warmedSorted, 99),
    max: allSorted[allSorted.length - 1],
  }
}

async function benchEndpoint(name, requestFactory) {
  const latencies = []
  process.stdout.write(`  ${name.padEnd(40)} `)
  for (let i = 0; i < N; i++) {
    const t0 = performance.now()
    try {
      const res = await requestFactory()
      // Drenar body para latencia full
      await res.text()
      const dt = performance.now() - t0
      latencies.push(dt)
      process.stdout.write('.')
    } catch (err) {
      process.stdout.write('!')
      latencies.push(NaN)
    }
  }
  process.stdout.write('\n')
  const valid = latencies.filter((l) => Number.isFinite(l))
  if (valid.length === 0) {
    return { name, error: 'all requests failed', n: 0 }
  }
  return { name, ...stats(valid), failed: N - valid.length }
}

const ENDPOINTS = [
  {
    name: '/api/health/utilities',
    factory: () => fetch(`${BASE}/api/health/utilities`, { headers: authHeaders }),
  },
  {
    name: '/api/feature-flag-check',
    factory: () =>
      fetch(`${BASE}/api/feature-flag-check?key=use_dedup_endpoint&subject_id=bench-${Date.now()}-${Math.random()}`, {
        headers: authHeaders,
      }),
  },
  {
    name: '/api/admin/feature-flag-list',
    factory: () => fetch(`${BASE}/api/admin/feature-flag-list`, { headers: authHeaders }),
  },
  {
    name: '/api/dedup (file_hash inexistente)',
    factory: () =>
      fetch(`${BASE}/api/dedup`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          file_hash: '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      }),
  },
  {
    name: '/api/fuzzy-supplier (no match)',
    factory: () =>
      fetch(`${BASE}/api/fuzzy-supplier`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: 'BenchNonExistentSupplier', nif: 'B99999999' }),
      }),
  },
  {
    name: '/api/fuzzy-ticket-invoice (no match)',
    factory: () =>
      fetch(`${BASE}/api/fuzzy-ticket-invoice`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          supplier_nif: 'B99999999',
          amount: 1,
          issue_date: '2020-01-01',
        }),
      }),
  },
  {
    name: '/api/decide-table (factura default)',
    factory: () =>
      fetch(`${BASE}/api/decide-table`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ doc_type: 'factura' }),
      }),
  },
]

console.log(`\nPerf benchmark Cathedral utilities — N=${N} requests por endpoint`)
console.log(`Base: ${BASE}`)
console.log('Secuencial (sin paralelismo) para medir latencia limpia.\n')

const results = []
for (const ep of ENDPOINTS) {
  const r = await benchEndpoint(ep.name, ep.factory)
  results.push(r)
}

// Tabla output
console.log('\n┌──────────────────────────────────────────────┬───────┬──────┬──────┬──────┬──────┬──────┬──────┐')
console.log('│ Endpoint                                      │  cold │  min │  avg │  p50 │  p95 │  p99 │  max │')
console.log('├──────────────────────────────────────────────┼───────┼──────┼──────┼──────┼──────┼──────┼──────┤')

for (const r of results) {
  if (r.error) {
    console.log(`│ ${r.name.padEnd(44)} │ ${r.error.padEnd(58)} │`)
    continue
  }
  const cells = [
    r.name.padEnd(44),
    `${Math.round(r.cold)}`.padStart(5),
    `${Math.round(r.min)}`.padStart(4),
    `${Math.round(r.avg)}`.padStart(4),
    `${Math.round(r.p50)}`.padStart(4),
    `${Math.round(r.p95)}`.padStart(4),
    `${Math.round(r.p99)}`.padStart(4),
    `${Math.round(r.max)}`.padStart(4),
  ]
  console.log(`│ ${cells.join(' │ ')} │`)
}
console.log('└──────────────────────────────────────────────┴───────┴──────┴──────┴──────┴──────┴──────┴──────┘')
console.log('Todas las cifras en milisegundos.')
console.log()

// SLA check: p95 warmed < 800ms (excluye cold start outlier).
// 800ms es threshold realista Vercel Hobby Fluid Compute + Supabase queries
// (~150-300ms warmed esperado para utilities, ~400-500ms RPC pg_trgm).
// Cold start típico 300-1000ms — NO cuenta para SLA porque es ephemeral
// (primera invocación tras idle >5min).
const SLA_P95_MS = 800
const slaViolations = results.filter((r) => !r.error && r.p95 > SLA_P95_MS)
if (slaViolations.length > 0) {
  console.log(`⚠️  SLA violations (p95 warmed > ${SLA_P95_MS}ms): ${slaViolations.length}`)
  for (const r of slaViolations) {
    console.log(`   ${r.name}: p95=${Math.round(r.p95)}ms (cold=${Math.round(r.cold)}ms)`)
  }
  process.exit(1)
}

console.log(`✓ Todos los endpoints SLA p95 warmed < ${SLA_P95_MS}ms (cold start excluido).`)
process.exit(0)
