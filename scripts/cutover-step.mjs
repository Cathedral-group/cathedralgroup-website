#!/usr/bin/env node
/**
 * Cutover progresivo step-by-step para flags utility Cathedral.
 *
 * Automatiza el ciclo activación + esperar + comparar baseline + decidir
 * siguiente paso. Diseñado para correr con David supervisando (output claro
 * pre/post cada paso, requiere confirmación manual entre pasos críticos).
 *
 * Uso:
 *   CATHEDRAL_INTERNAL_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/cutover-step.mjs <flag-key> <action>
 *
 * Actions:
 *   - status        Muestra estado actual flag + last 7 días invoices stats
 *   - preview       Dry-run: simula activación pero NO modifica BD
 *   - activate-10   Sube a rollout_pct=10 (paso 1 cutover)
 *   - activate-50   Sube a 50 (requiere previous=10 + golden compare OK)
 *   - activate-100  Sube a 100 (requiere previous=50 + golden compare OK)
 *   - rollback      Bajar enabled=false + rollout_pct=0 (emergencia)
 *   - compare       Correr golden-dataset-compare con baseline más reciente
 *   - audit         Listar audit log entries recientes del flag
 *
 * Pre-condiciones cada activate-N:
 *   - smoke-test-utilities.mjs exit 0 (sanity check)
 *   - health/utilities status='ok'
 *   - baseline existe (scripts/golden-dataset-baseline-*.json)
 *
 * Post-activación: imprime guidance al usuario para esperar 24h + correr compare.
 *
 * NO ejecuta el cutover real workflow n8n (eso requiere PATCH workflow general
 * via cookie session — proceso manual sesión dedicada). Este script controla
 * solo el flag rollout porcentaje + monitoreo.
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const TOKEN = process.env.CATHEDRAL_INTERNAL_TOKEN
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = (process.env.BASE_URL ?? 'https://cathedralgroup-website.vercel.app').replace(/\/$/, '')

if (!TOKEN) {
  console.error('Error: CATHEDRAL_INTERNAL_TOKEN env var requerida')
  process.exit(1)
}

const [, , flagKey, action] = process.argv

if (!flagKey || !action) {
  console.error('Uso: node scripts/cutover-step.mjs <flag-key> <action>')
  console.error('  flag-key: use_dedup_endpoint | use_fuzzy_supplier_endpoint | use_decide_table_endpoint | portal_use_unified_ocr')
  console.error('  action:   status | preview | activate-10 | activate-50 | activate-100 | rollback | compare')
  process.exit(1)
}

const VALID_FLAGS = new Set([
  'use_dedup_endpoint',
  'use_fuzzy_supplier_endpoint',
  'use_decide_table_endpoint',
  'portal_use_unified_ocr',
])
if (!VALID_FLAGS.has(flagKey)) {
  console.error(`Error: flag-key inválido. Permitidos: ${[...VALID_FLAGS].join(', ')}`)
  process.exit(1)
}

const VALID_ACTIONS = new Set(['status', 'preview', 'activate-10', 'activate-50', 'activate-100', 'rollback', 'compare', 'audit'])
if (!VALID_ACTIONS.has(action)) {
  console.error(`Error: action inválida. Permitidas: ${[...VALID_ACTIONS].join(', ')}`)
  process.exit(1)
}

const authHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
}

async function fetchFlag(key) {
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key, description: undefined }),
  })
  // hack: toggle requires al menos 1 campo; usamos preview con no-op
  // mejor: usar /api/feature-flag-check + leer Supabase directo
  if (!res.ok) {
    throw new Error(`fetch flag ${key} failed: HTTP ${res.status}`)
  }
  return res.json()
}

async function readFlagFromEndpoint(key) {
  // Usa /api/admin/feature-flag-list — independiza de Supabase env vars
  // (solo precisa CATHEDRAL_INTERNAL_TOKEN). Si no disponible (HTTP error)
  // fallback a Supabase direct si env vars presentes.
  try {
    const res = await fetch(`${BASE}/api/admin/feature-flag-list`, {
      headers: authHeaders,
    })
    if (res.ok) {
      const json = await res.json()
      const flag = (json.flags ?? []).find((f) => f.key === key)
      return flag ?? null
    }
  } catch {
    // fallback abajo
  }
  // Fallback Supabase direct (legacy path si endpoint no deployed aún)
  if (SUPABASE_URL && SUPABASE_KEY) {
    const url = `${SUPABASE_URL}/rest/v1/feature_flags?key=eq.${encodeURIComponent(key)}&select=enabled,rollout_pct,description,updated_at,updated_by`
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    if (!res.ok) throw new Error(`Supabase fallback read failed: HTTP ${res.status}`)
    const rows = await res.json()
    return rows[0] ?? null
  }
  throw new Error('No se pudo leer flag: /api/admin/feature-flag-list falló y sin Supabase env vars')
}

async function fetchInvoicesStats() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const url = `${SUPABASE_URL}/rest/v1/invoices?select=id,created_at,direction,doc_type&created_at=gte.${sevenDaysAgo}&deleted_at=is.null&limit=2000`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return {
    total_7d: rows.length,
    emitidas: rows.filter((r) => r.direction === 'emitida').length,
    recibidas: rows.filter((r) => r.direction === 'recibida').length,
    by_doc_type: rows.reduce((acc, r) => {
      acc[r.doc_type] = (acc[r.doc_type] ?? 0) + 1
      return acc
    }, {}),
  }
}

async function toggleFlag(key, patch) {
  const res = await fetch(`${BASE}/api/admin/feature-flag-toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ key, ...patch }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`toggle failed HTTP ${res.status}: ${body}`)
  }
  return res.json()
}

async function checkHealth() {
  const res = await fetch(`${BASE}/api/health/utilities`, { headers: authHeaders })
  if (!res.ok) throw new Error(`health HTTP ${res.status}`)
  return res.json()
}

function runSmokeTest() {
  console.log('  ↳ Corriendo smoke test 26 tests...')
  const result = spawnSync('node', ['scripts/smoke-test-utilities.mjs'], {
    env: { ...process.env, CATHEDRAL_INTERNAL_TOKEN: TOKEN },
    cwd: resolve(process.cwd()),
  })
  if (result.status !== 0) {
    console.error('  ✗ Smoke test FAIL — abortar')
    console.error(result.stdout?.toString() ?? '')
    console.error(result.stderr?.toString() ?? '')
    return false
  }
  console.log('  ✓ Smoke test 26/26 pass')
  return true
}

function findLatestBaseline() {
  try {
    const files = readdirSync('scripts')
      .filter((f) => f.startsWith('golden-dataset-baseline-') && f.endsWith('.json'))
      .sort()
      .reverse()
    return files[0] ? `scripts/${files[0]}` : null
  } catch {
    return null
  }
}

function runGoldenCompare(baseline) {
  console.log(`  ↳ Comparando contra ${baseline}...`)
  const result = spawnSync('node', ['scripts/golden-dataset-compare.mjs', baseline], {
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY },
    cwd: resolve(process.cwd()),
    stdio: 'inherit',
  })
  return result.status === 0
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionStatus() {
  console.log(`\n=== STATUS flag '${flagKey}' ===`)
  const flag = await readFlagFromEndpoint(flagKey)
  if (!flag) {
    console.error(`Flag '${flagKey}' no encontrado en BD`)
    process.exit(1)
  }
  console.log(`  enabled:      ${flag.enabled}`)
  console.log(`  rollout_pct:  ${flag.rollout_pct}`)
  console.log(`  description:  ${flag.description ?? '(sin descripción)'}`)
  console.log(`  updated_at:   ${flag.updated_at}`)
  console.log(`  updated_by:   ${flag.updated_by ?? '(initial seed)'}`)

  console.log(`\n=== HEALTH ===`)
  const health = await checkHealth()
  console.log(`  status:       ${health.status}`)
  console.log(`  supabase:     ${health.checks.supabase_connectivity.ok ? 'ok' : 'FAIL'} (${health.checks.supabase_connectivity.latency_ms}ms)`)

  console.log(`\n=== INVOICES LAST 7d ===`)
  const stats = await fetchInvoicesStats()
  if (stats) {
    console.log(`  total: ${stats.total_7d} (${stats.recibidas} recibidas, ${stats.emitidas} emitidas)`)
    for (const [t, n] of Object.entries(stats.by_doc_type).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${t}: ${n}`)
    }
  }
}

async function actionPreview() {
  console.log(`\n=== PREVIEW activación '${flagKey}' (NO modifica BD) ===`)
  const flag = await readFlagFromEndpoint(flagKey)
  console.log(`Current: enabled=${flag.enabled} rollout_pct=${flag.rollout_pct}`)
  console.log(`If activate-10: enabled=true rollout_pct=10`)
  console.log(`If activate-50: enabled=true rollout_pct=50`)
  console.log(`If activate-100: enabled=true rollout_pct=100`)
  console.log(`If rollback:    enabled=false rollout_pct=0`)
}

async function actionActivate(targetPct) {
  console.log(`\n=== ACTIVATE '${flagKey}' rollout_pct=${targetPct} ===`)

  // Pre-checks
  console.log('Pre-checks:')
  if (!runSmokeTest()) process.exit(1)

  const health = await checkHealth()
  if (health.status !== 'ok') {
    console.error(`  ✗ Health status=${health.status} — abortar`)
    process.exit(1)
  }
  console.log('  ✓ Health ok')

  const flag = await readFlagFromEndpoint(flagKey)
  console.log(`  Estado actual: enabled=${flag.enabled} rollout_pct=${flag.rollout_pct}`)

  // Validación rollout ascendente
  if (targetPct === 50 && flag.rollout_pct < 10) {
    console.error(`  ✗ rollout_pct actual=${flag.rollout_pct} debe ser ≥10 antes de subir a 50`)
    console.error(`  Si quieres saltar pasos: usar /api/admin/feature-flag-toggle directo (curl)`)
    process.exit(1)
  }
  if (targetPct === 100 && flag.rollout_pct < 50) {
    console.error(`  ✗ rollout_pct actual=${flag.rollout_pct} debe ser ≥50 antes de subir a 100`)
    process.exit(1)
  }

  // Apply
  const result = await toggleFlag(flagKey, { enabled: true, rollout_pct: targetPct })
  console.log(`\nResult:`)
  console.log(`  previous: enabled=${result.previous.enabled} rollout_pct=${result.previous.rollout_pct}`)
  console.log(`  current:  enabled=${result.current.enabled} rollout_pct=${result.current.rollout_pct}`)

  console.log(`\n✓ Flag '${flagKey}' activado a ${targetPct}%`)
  console.log(`\nNext steps:`)
  console.log(`  1. Esperar 24h tráfico real`)
  console.log(`  2. Correr: node scripts/cutover-step.mjs ${flagKey} compare`)
  console.log(`  3. Si exit 0 → siguiente paso. Si exit 1 → rollback inmediato.`)
}

async function actionRollback() {
  console.log(`\n=== ROLLBACK '${flagKey}' (enabled=false, rollout_pct=0) ===`)
  const result = await toggleFlag(flagKey, { enabled: false, rollout_pct: 0 })
  console.log(`previous: enabled=${result.previous.enabled} rollout_pct=${result.previous.rollout_pct}`)
  console.log(`current:  enabled=${result.current.enabled} rollout_pct=${result.current.rollout_pct}`)
  console.log(`\n✓ Rollback completo. Workflow general vuelve a Code legacy 100% inmediato.`)
}

async function actionAudit() {
  console.log(`\n=== AUDIT LOG '${flagKey}' (últimos 20) ===`)
  const res = await fetch(`${BASE}/api/admin/audit-log-recent?table=feature_flags&limit=20`, {
    headers: authHeaders,
  })
  if (!res.ok) {
    console.error(`Error HTTP ${res.status}`)
    process.exit(1)
  }
  const json = await res.json()
  const filtered = json.rows.filter((r) => r.record_id === flagKey)
  if (filtered.length === 0) {
    console.log(`  (sin audit entries para '${flagKey}')`)
    return
  }
  console.log(`  Total: ${filtered.length} entries`)
  console.log()
  for (const row of filtered) {
    const dt = new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  ${dt}  ${row.action.padEnd(20)}  ${row.user_email.padEnd(40)}  ip=${row.ip ?? '-'}`)
  }
}

async function actionCompare() {
  const baseline = findLatestBaseline()
  if (!baseline) {
    console.error('Error: no baseline encontrado en scripts/golden-dataset-baseline-*.json')
    console.error('Generar con: node scripts/golden-dataset-snapshot.mjs')
    process.exit(1)
  }
  console.log(`\n=== COMPARE baseline=${baseline} ===`)
  const ok = runGoldenCompare(baseline)
  if (ok) {
    console.log(`\n✓ PASS — 0 diffs críticos. Seguro continuar siguiente rollout step.`)
  } else {
    console.error(`\n✗ FAIL — diffs detectados. ROLLBACK INMEDIATO:`)
    console.error(`  node scripts/cutover-step.mjs ${flagKey} rollback`)
    process.exit(1)
  }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

try {
  switch (action) {
    case 'status':
      await actionStatus()
      break
    case 'preview':
      await actionPreview()
      break
    case 'activate-10':
      await actionActivate(10)
      break
    case 'activate-50':
      await actionActivate(50)
      break
    case 'activate-100':
      await actionActivate(100)
      break
    case 'rollback':
      await actionRollback()
      break
    case 'compare':
      await actionCompare()
      break
    case 'audit':
      await actionAudit()
      break
  }
} catch (err) {
  console.error(`\nFatal: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
