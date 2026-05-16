#!/usr/bin/env node
/**
 * CI Full Check Cathedral utilities — runs all tests + checks en secuencia.
 *
 * Diseñado pre-deploy / pre-cutover / hourly cron / status page integration.
 *
 * Ejecuta:
 *   1. node --test scripts/test-feature-flags-rollout.mjs (8 tests determinismo)
 *   2. node --test scripts/test-cathedral-utility-client.mjs (10 tests wrappers)
 *   3. scripts/smoke-test-utilities.mjs (28 tests integración endpoints prod)
 *   4. GET /api/health/utilities (status check + flags presentes)
 *   5. scripts/golden-dataset-compare.mjs <latest-baseline> (regresión BD)
 *
 * Uso:
 *   CATHEDRAL_INTERNAL_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/ci-full-check.mjs [--skip-golden]
 *
 * Exit codes:
 *   0 = all pass
 *   1 = al menos 1 check fail
 *
 * Output: tabla compacta cada step + summary final.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const TOKEN = process.env.CATHEDRAL_INTERNAL_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = (process.env.BASE_URL ?? 'https://cathedralgroup-website.vercel.app').replace(/\/$/, '')
const SKIP_GOLDEN = process.argv.includes('--skip-golden')

if (!TOKEN) {
  console.error('Error: CATHEDRAL_INTERNAL_TOKEN env var requerida')
  process.exit(1)
}

const cwd = resolve(process.cwd())

const results = []

function recordStep(name, success, durationMs, detail = '') {
  results.push({ name, success, durationMs, detail })
  const icon = success ? '✓' : '✗'
  const dt = `${durationMs.toFixed(0)}ms`
  console.log(`  ${icon} ${name.padEnd(40)} ${dt.padStart(8)}  ${detail}`)
}

// ─── Step 1: rollout determinism tests ───────────────────────────────────────
console.log('\n[1/5] node --test scripts/test-feature-flags-rollout.mjs')
{
  const t0 = performance.now()
  const r = spawnSync('node', ['--test', 'scripts/test-feature-flags-rollout.mjs'], { cwd })
  const dt = performance.now() - t0
  recordStep('rollout determinism tests', r.status === 0, dt,
    r.status === 0 ? '8 tests' : `exit ${r.status}`)
  if (r.status !== 0) {
    console.error(r.stdout?.toString())
    console.error(r.stderr?.toString())
  }
}

// ─── Step 2: cathedral-utility-client unit tests ─────────────────────────────
console.log('\n[2/5] node --test scripts/test-cathedral-utility-client.mjs + test-api-auth.mjs')
{
  const t0 = performance.now()
  const r = spawnSync(
    'node',
    [
      '--test',
      'scripts/test-cathedral-utility-client.mjs',
      'scripts/test-api-auth.mjs',
    ],
    { cwd }
  )
  const dt = performance.now() - t0
  recordStep('unit tests offline', r.status === 0, dt,
    r.status === 0 ? '22 tests (10 client + 12 api-auth)' : `exit ${r.status}`)
  if (r.status !== 0) {
    console.error(r.stdout?.toString())
    console.error(r.stderr?.toString())
  }
}

// ─── Step 3: smoke test 28 integration ───────────────────────────────────────
console.log('\n[3/5] scripts/smoke-test-utilities.mjs')
{
  const t0 = performance.now()
  const r = spawnSync('node', ['scripts/smoke-test-utilities.mjs'], {
    cwd,
    env: { ...process.env, CATHEDRAL_INTERNAL_TOKEN: TOKEN },
  })
  const dt = performance.now() - t0
  const stdout = r.stdout?.toString() ?? ''
  const passMatch = stdout.match(/(\d+) passed, (\d+) failed/)
  const detail = passMatch ? `${passMatch[1]} pass / ${passMatch[2]} fail` : `exit ${r.status}`
  recordStep('smoke test 26 integration', r.status === 0, dt, detail)
  if (r.status !== 0) {
    console.error(stdout)
    console.error(r.stderr?.toString())
  }
}

// ─── Step 4: health/utilities check ──────────────────────────────────────────
console.log('\n[4/5] GET /api/health/utilities')
{
  const t0 = performance.now()
  try {
    const res = await fetch(`${BASE}/api/health/utilities`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const dt = performance.now() - t0
    if (!res.ok) {
      recordStep('health/utilities', false, dt, `HTTP ${res.status}`)
    } else {
      const json = await res.json()
      const ok = json.status === 'ok'
      recordStep(
        'health/utilities',
        ok,
        dt,
        `status=${json.status}, flags=${json.flags_status?.length ?? '?'}, supabase=${json.checks?.supabase_connectivity?.latency_ms ?? '?'}ms`
      )
    }
  } catch (err) {
    const dt = performance.now() - t0
    recordStep('health/utilities', false, dt, err instanceof Error ? err.message : 'error')
  }
}

// ─── Step 5: golden dataset compare (opcional, --skip-golden) ───────────────
console.log('\n[5/5] scripts/golden-dataset-compare.mjs <latest baseline>')
if (SKIP_GOLDEN) {
  console.log('  ⊘ skipped (--skip-golden)')
  results.push({ name: 'golden dataset compare', success: true, durationMs: 0, detail: 'skipped' })
} else if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('  ⊘ skipped (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no provistos)')
  results.push({ name: 'golden dataset compare', success: true, durationMs: 0, detail: 'skipped (no env)' })
} else {
  const baselines = readdirSync('scripts')
    .filter((f) => f.startsWith('golden-dataset-baseline-') && f.endsWith('.json'))
    .sort()
    .reverse()
  const baseline = baselines[0]
  if (!baseline) {
    recordStep('golden dataset compare', false, 0, 'no baseline encontrado')
  } else {
    const t0 = performance.now()
    const r = spawnSync('node', ['scripts/golden-dataset-compare.mjs', `scripts/${baseline}`], { cwd })
    const dt = performance.now() - t0
    const stdout = r.stdout?.toString() ?? ''
    const criticalMatch = stdout.match(/Critical diffs[^:]*:\s*(\d+)/)
    const detail = criticalMatch ? `${criticalMatch[1]} critical diffs` : `exit ${r.status}`
    recordStep('golden dataset compare', r.status === 0, dt, `${baseline}, ${detail}`)
    if (r.status !== 0) {
      console.error(stdout)
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.success).length
const failed = results.filter((r) => !r.success).length
console.log()
console.log('─'.repeat(60))
console.log(`Summary: ${passed} passed, ${failed} failed (total ${results.length})`)

if (failed > 0) {
  console.log()
  console.log('Failed steps:')
  for (const r of results.filter((x) => !x.success)) {
    console.log(`  - ${r.name}: ${r.detail}`)
  }
  process.exit(1)
}

console.log('✓ Todos los checks OK. Sistema utilities sano.')
process.exit(0)
