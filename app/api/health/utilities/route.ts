/**
 * GET /api/health/utilities
 *
 * Health check específico para los 4 utility endpoints internos Cathedral
 * + estado del sistema feature_flags. Diseñado para monitoring + cron + status page.
 *
 * Verifica:
 *   - Conectividad Supabase (SELECT count feature_flags)
 *   - Flag system funcional (4 flags seed presentes)
 *   - Estado activación cada flag (enabled + rollout_pct)
 *   - Latencia round-trip BD
 *
 * NO ejecuta llamadas HTTP a `/api/dedup` etc (eso lo hace `scripts/smoke-test-utilities.mjs`
 * externamente). Aquí solo lo verificable internamente sin generar tráfico cruzado.
 *
 * Auth: `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}` (mismo patrón otros utilities).
 *
 * Response 200 (siempre — incluso si algún check falla, devuelve detalle):
 *   {
 *     "status": "ok" | "degraded" | "critical",
 *     "checks": {
 *       "supabase_connectivity": { ok: bool, latency_ms: number, error?: string },
 *       "feature_flags_table":   { ok: bool, count: number, error?: string },
 *       "expected_flags_present": { ok: bool, missing: string[] }
 *     },
 *     "flags_status": [{ key, enabled, rollout_pct }],
 *     "timestamp": ISO8601,
 *     "source": "cathedral-health-utilities-v1"
 *   }
 *
 * Uso típico:
 *   - Cron healthcheck Hetzner cada hora
 *   - Pre-deploy: ¿está la infra utility OK?
 *   - Post-deploy: ¿flags seguían intactos?
 */

import { type NextRequest } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'

const EXPECTED_FLAG_KEYS = [
  'use_dedup_endpoint',
  'use_fuzzy_supplier_endpoint',
  'use_decide_table_endpoint',
  'portal_use_unified_ocr',
]

// Auth via lib/api-auth (refactor 16/05 noche).

interface CheckResult {
  ok: boolean
  error?: string
  [k: string]: unknown
}

interface FlagStatus {
  key: string
  enabled: boolean
  rollout_pct: number
}

export async function GET(request: NextRequest) {
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: Record<string, CheckResult> = {}
  let flagsStatus: FlagStatus[] = []

  // Check 1: Supabase connectivity + feature_flags table
  const t0 = Date.now()
  const supabase = createAdminSupabaseClient()
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, enabled, rollout_pct')
      .order('key', { ascending: true })

    const latency = Date.now() - t0

    if (error) {
      checks.supabase_connectivity = { ok: false, latency_ms: latency, error: error.message }
      checks.feature_flags_table = { ok: false, error: error.message }
      checks.expected_flags_present = { ok: false, missing: EXPECTED_FLAG_KEYS }
    } else {
      const rows = (data ?? []) as FlagStatus[]
      flagsStatus = rows
      checks.supabase_connectivity = { ok: true, latency_ms: latency }
      checks.feature_flags_table = { ok: true, count: rows.length }

      const presentKeys = new Set(rows.map((r) => r.key))
      const missing = EXPECTED_FLAG_KEYS.filter((k) => !presentKeys.has(k))
      checks.expected_flags_present = {
        ok: missing.length === 0,
        missing,
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    checks.supabase_connectivity = { ok: false, latency_ms: Date.now() - t0, error: message }
    checks.feature_flags_table = { ok: false, error: message }
    checks.expected_flags_present = { ok: false, missing: EXPECTED_FLAG_KEYS }
  }

  // Status agregado
  const allOk = Object.values(checks).every((c) => c.ok)
  const criticalBroken = !checks.supabase_connectivity?.ok
  const status: 'ok' | 'degraded' | 'critical' = allOk
    ? 'ok'
    : criticalBroken
      ? 'critical'
      : 'degraded'

  return Response.json({
    status,
    checks,
    flags_status: flagsStatus,
    timestamp: new Date().toISOString(),
    source: 'cathedral-health-utilities-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
