/**
 * GET /api/health/utilities
 *
 * Health check Cathedral: utilities + sistema infra. Diseñado para monitoring + cron + status page.
 *
 * Verifica:
 *   - Conectividad Supabase + feature_flags
 *   - n8n exec error rate 1h (exceptions_log count)
 *   - Provider distribution 24h (detect Vertex OAuth dead)
 *   - Workflow Definitivo active status (n8n REST API)
 *
 * Auth: `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}` (mismo patrón otros utilities).
 *
 * Response siempre 200 con `status` field (degraded/critical en body). cathedral-health-cron.sh
 * lee status field, NO HTTP code — cambiar a 503 rompería cron.
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

  // Check 2: n8n exec error rate 1h. count: 'planned' (no full scan — no index created_at)
  try {
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { count, error } = await supabase
      .from('exceptions_log')
      .select('*', { count: 'planned', head: true })
      .gte('created_at', oneHourAgo)
    if (error) {
      checks.n8n_errors_1h = { ok: false, error: error.message }
    } else {
      const errorCount = count ?? 0
      checks.n8n_errors_1h = { ok: errorCount <= 5, count: errorCount, threshold: 5 }
    }
  } catch (err) {
    checks.n8n_errors_1h = { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }

  // Check 3: Provider distribution 24h. Alerta si gpt-4o > 10% del total (síntoma Vertex OAuth dead)
  try {
    const oneDayAgo = new Date(Date.now() - 86400_000).toISOString()
    const { data: invoiceRows, error } = await supabase
      .from('invoices')
      .select('ai_provider')
      .gte('created_at', oneDayAgo)
    if (error) {
      checks.provider_distribution_24h = { ok: false, error: error.message }
    } else {
      const dist: Record<string, number> = {}
      for (const r of invoiceRows ?? []) {
        const provider = (r as { ai_provider?: string | null }).ai_provider ?? 'unknown'
        dist[provider] = (dist[provider] || 0) + 1
      }
      const total = Object.values(dist).reduce((a, b) => a + b, 0)
      const gpt4oCount = dist['gpt-4o'] ?? 0
      const gpt4oPct = total > 0 ? gpt4oCount / total : 0
      // Solo alerta si volumen significativo (>10 facturas) Y gpt-4o domina
      const alert = total > 10 && gpt4oPct > 0.10
      checks.provider_distribution_24h = {
        ok: !alert,
        total,
        distribution: dist,
        gpt4o_pct: Math.round(gpt4oPct * 10000) / 100,
      }
    }
  } catch (err) {
    checks.provider_distribution_24h = { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }

  // Check 4: Workflow Definitivo active status (info, no critical — esperado OFF durante S1 refactor)
  try {
    if (!process.env.N8N_API_KEY) {
      checks.n8n_workflow_active = { ok: false, error: 'N8N_API_KEY not configured' }
    } else {
      const wfRes = await fetch('https://n8n.cathedralgroup.es/api/v1/workflows/OcYrtR9pM6jIa7NK', {
        headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY },
        signal: AbortSignal.timeout(8000),
      })
      if (!wfRes.ok) {
        checks.n8n_workflow_active = { ok: false, status_code: wfRes.status, error: `n8n HTTP ${wfRes.status}` }
      } else {
        const wfData = await wfRes.json() as { active?: boolean; name?: string }
        // ok=true siempre — info only, no degrada status agregado. S1 refactor: OFF esperado.
        checks.n8n_workflow_active = { ok: true, active: wfData.active ?? false, name: wfData.name }
      }
    }
  } catch (err) {
    checks.n8n_workflow_active = { ok: false, error: err instanceof Error ? err.message : 'unknown' }
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
    source: 'cathedral-health-utilities-v2',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
