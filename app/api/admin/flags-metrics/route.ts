/**
 * GET /api/admin/flags-metrics
 *
 * Métricas agregadas feature_flags + admin_audit_log para dashboard runtime
 * + monitoring observability.
 *
 * Devuelve:
 *   - Conteo flags (total, enabled, partial rollout 0<pct<100, full 100%)
 *   - Distribución rollout_pct
 *   - Audit activity últimas 24h (count por action)
 *   - Top 5 flags más modificados (record_id frecuencia en audit_log)
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Útil:
 *   - Dashboard admin Cathedral
 *   - Alerting si rollout activación inesperada
 *   - Capacity planning audit log retention
 */

import { type NextRequest } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'

interface FlagRow {
  enabled: boolean
  rollout_pct: number
}

interface AuditRow {
  action: string
  record_id: string
}

export async function GET(request: NextRequest) {
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Queries paralelas
  const [flagsRes, auditRes] = await Promise.all([
    supabase.from('feature_flags').select('enabled, rollout_pct'),
    supabase
      .from('admin_audit_log')
      .select('action, record_id')
      .eq('table_name', 'feature_flags')
      .gte('created_at', since24h)
      .limit(500),
  ])

  if (flagsRes.error || auditRes.error) {
    console.error(
      '[flags-metrics] error flags=%s audit=%s',
      flagsRes.error?.message ?? 'ok',
      auditRes.error?.message ?? 'ok'
    )
    return Response.json(
      { error: 'Upstream database error' },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  const flags = (flagsRes.data ?? []) as FlagRow[]
  const audit = (auditRes.data ?? []) as AuditRow[]

  // Flags stats
  const flagsStats = {
    total: flags.length,
    enabled: flags.filter((f) => f.enabled).length,
    disabled: flags.filter((f) => !f.enabled).length,
    partial_rollout: flags.filter((f) => f.enabled && f.rollout_pct > 0 && f.rollout_pct < 100).length,
    full_rollout: flags.filter((f) => f.enabled && f.rollout_pct === 100).length,
    rollout_distribution: {
      pct_0: flags.filter((f) => f.rollout_pct === 0).length,
      pct_1_25: flags.filter((f) => f.rollout_pct > 0 && f.rollout_pct <= 25).length,
      pct_26_50: flags.filter((f) => f.rollout_pct > 25 && f.rollout_pct <= 50).length,
      pct_51_75: flags.filter((f) => f.rollout_pct > 50 && f.rollout_pct <= 75).length,
      pct_76_100: flags.filter((f) => f.rollout_pct > 75 && f.rollout_pct <= 100).length,
    },
  }

  // Audit activity stats 24h
  const auditByAction = audit.reduce<Record<string, number>>((acc, row) => {
    acc[row.action] = (acc[row.action] ?? 0) + 1
    return acc
  }, {})

  const auditByRecord = audit.reduce<Record<string, number>>((acc, row) => {
    acc[row.record_id] = (acc[row.record_id] ?? 0) + 1
    return acc
  }, {})

  const topFlagsModified = Object.entries(auditByRecord)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }))

  return Response.json({
    flags: flagsStats,
    audit_24h: {
      total_events: audit.length,
      by_action: auditByAction,
      top_5_flags_modified: topFlagsModified,
    },
    timestamp: new Date().toISOString(),
    source: 'cathedral-flags-metrics-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
