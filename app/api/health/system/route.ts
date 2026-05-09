/**
 * GET /api/health/system
 *
 * Health agregado del sistema Cathedral. Combina:
 * - Estado de workflows n8n activos (vía API n8n con API key)
 * - Estado de las 7 RPCs forensic (vía forensic_rpcs_healthcheck)
 * - Último snapshot eval (eval_runs)
 * - Últimos errores no resueltos (exceptions_log)
 * - Coberturas críticas BD
 *
 * Usado por:
 * - Dashboard /admin/eval (widget Health)
 * - Cron diario alerting (cuando esté configurado RESEND)
 *
 * Auth:
 * - GET → admin allow-list + AAL2
 * - POST → admin allow-list + AAL2 + persiste snapshot (futuro)
 * - Header `Authorization: Bearer AUDIT_CRON_SECRET` para acceso cron
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheckUser() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function authCheckCron(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (auth.length !== expectedHeader.length) return false
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expectedHeader))
  } catch {
    return false
  }
}

interface RpcHealthResult {
  rpc_name: string
  ok: boolean
  error_message: string | null
  duration_ms: number
}

interface SystemHealth {
  checked_at: string
  overall_status: 'healthy' | 'degraded' | 'critical'
  components: {
    forensic_rpcs: { ok: number; failed: number; results: RpcHealthResult[] }
    workflows: { active: number; total: number; names: string[] }
    last_eval_snapshot: { run_at: string | null; total: number | null; minutes_ago: number | null }
    exceptions_pending: { count: number; oldest_minutes: number | null }
    backup_recent: { count_24h: number }
  }
  alerts: string[]
}

export async function GET(request: NextRequest) {
  const isUser = await authCheckUser()
  const isCron = authCheckCron(request)
  if (!isUser && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const alerts: string[] = []

  // 1. Forensic RPCs healthcheck
  let rpcResults: RpcHealthResult[] = []
  let rpcOk = 0
  let rpcFailed = 0
  try {
    const { data, error } = await supabase.rpc('forensic_rpcs_healthcheck')
    if (error) {
      alerts.push(`forensic_rpcs_healthcheck error: ${error.message}`)
    } else {
      rpcResults = (data as RpcHealthResult[]) ?? []
      rpcOk = rpcResults.filter((r) => r.ok).length
      rpcFailed = rpcResults.filter((r) => !r.ok).length
      if (rpcFailed > 0) {
        alerts.push(`${rpcFailed} RPC(s) forensic con error: ${rpcResults.filter((r) => !r.ok).map((r) => r.rpc_name).join(', ')}`)
      }
    }
  } catch (e) {
    alerts.push(`forensic_rpcs_healthcheck excepción: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. n8n workflows activos
  let workflows = { active: 0, total: 0, names: [] as string[] }
  const n8nKey = process.env.N8N_API_KEY
  const n8nUrl = process.env.N8N_API_URL ?? 'https://n8n.cathedralgroup.es'
  if (n8nKey) {
    try {
      const res = await fetch(`${n8nUrl}/api/v1/workflows?limit=100`, {
        headers: { 'X-N8N-API-KEY': n8nKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const json = (await res.json()) as { data?: { active: boolean; name: string }[] }
        const data = json.data ?? []
        const active = data.filter((w) => w.active)
        workflows = {
          total: data.length,
          active: active.length,
          names: active.map((w) => w.name),
        }
        if (active.length < 6) {
          alerts.push(`Solo ${active.length} workflows activos (esperados ≥6 incluyendo Clasificador, Auditor, Captura errores, Backup, Healthcheck, Eval)`)
        }
      } else {
        alerts.push(`n8n API HTTP ${res.status}`)
      }
    } catch (e) {
      alerts.push(`n8n API timeout/error: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    alerts.push('N8N_API_KEY no configurada en env vars')
  }

  // 3. Último snapshot eval
  const { data: lastEval } = await supabase
    .from('eval_runs')
    .select('run_at, metrics')
    .order('run_at', { ascending: false })
    .limit(1)
    .single()
  let lastEvalInfo = { run_at: null as string | null, total: null as number | null, minutes_ago: null as number | null }
  if (lastEval) {
    const runAt = new Date(lastEval.run_at as string)
    const minutesAgo = Math.round((Date.now() - runAt.getTime()) / 60000)
    lastEvalInfo = {
      run_at: lastEval.run_at as string,
      total: ((lastEval.metrics as Record<string, unknown> | null)?.total as number | null) ?? null,
      minutes_ago: minutesAgo,
    }
    if (minutesAgo > 60 * 36) {
      alerts.push(`Último snapshot eval hace ${Math.round(minutesAgo / 60)}h (>36h — cron eval no se ejecuta)`)
    }
  } else {
    alerts.push('Sin snapshots eval registrados todavía')
  }

  // 4. Exceptions pendientes
  const { data: pendingExceptions } = await supabase
    .from('exceptions_log')
    .select('id, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: true })
    .limit(1000)
  const exceptionsCount = pendingExceptions?.length ?? 0
  let oldestMinutes: number | null = null
  if (pendingExceptions && pendingExceptions.length > 0) {
    const oldest = new Date(pendingExceptions[0].created_at as string)
    oldestMinutes = Math.round((Date.now() - oldest.getTime()) / 60000)
    if (exceptionsCount > 50) {
      alerts.push(`${exceptionsCount} exceptions sin resolver (>50 — investigar acumulación)`)
    }
  }

  // 5. Backups recientes (últimas 24h) — tabla puede no existir todavía
  let backupCount24h = 0
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('admin_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'create')
      .like('table_name', '%backup%')
      .gte('created_at', since)
    backupCount24h = count ?? 0
  } catch {
    /* tolerante */
  }

  // Calcular overall_status
  let overall: SystemHealth['overall_status'] = 'healthy'
  if (rpcFailed > 0 || (lastEvalInfo.minutes_ago && lastEvalInfo.minutes_ago > 60 * 48)) {
    overall = 'degraded'
  }
  if (rpcFailed >= 2 || workflows.active < 4) {
    overall = 'critical'
  }

  const health: SystemHealth = {
    checked_at: new Date().toISOString(),
    overall_status: overall,
    components: {
      forensic_rpcs: { ok: rpcOk, failed: rpcFailed, results: rpcResults },
      workflows,
      last_eval_snapshot: lastEvalInfo,
      exceptions_pending: { count: exceptionsCount, oldest_minutes: oldestMinutes },
      backup_recent: { count_24h: backupCount24h },
    },
    alerts,
  }

  return NextResponse.json(health)
}

export const dynamic = 'force-dynamic'
