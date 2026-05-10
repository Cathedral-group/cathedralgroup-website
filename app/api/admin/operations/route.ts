/**
 * POST /api/admin/operations
 *
 * Endpoint genérico para acciones operativas del Operations Center
 * (/admin/sistema). Cada acción tiene su lógica específica.
 *
 * Body: { action: 'force_eval_snapshot' | 'reload_pgrst' | 'cleanup_idempotency' |
 *                  'recalculate_costs' | 'create_test_notification' }
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

const VALID_ACTIONS = new Set([
  'force_eval_snapshot',
  'cleanup_idempotency',
  'recalculate_costs',
  'forensic_rpcs_check',
  'create_test_notification',
])

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `action inválida. Permitidas: ${[...VALID_ACTIONS].join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()
  const start = Date.now()

  try {
    let result: unknown = null

    switch (action) {
      case 'force_eval_snapshot': {
        const { data: snapshot, error: snapErr } = await supabase.rpc('eval_structural_snapshot', {
          p_window_days: 30,
        })
        if (snapErr) throw new Error(`snapshot: ${snapErr.message}`)
        const { data: insRes, error: insErr } = await supabase
          .from('eval_runs')
          .insert({
            run_type: 'manual',
            scope: 'invoices',
            metrics: snapshot,
            notes: `Manual desde /admin/sistema por ${user.email}`,
          })
          .select('id')
          .single()
        if (insErr) throw new Error(`persist: ${insErr.message}`)
        result = { run_id: insRes?.id, snapshot }
        break
      }
      case 'cleanup_idempotency': {
        const { data, error } = await supabase.rpc('cleanup_webhook_idempotency')
        if (error) throw new Error(error.message)
        result = Array.isArray(data) ? data[0] : data
        break
      }
      case 'recalculate_costs': {
        const { data, error } = await supabase.rpc('recalculate_ai_costs')
        if (error) throw new Error(error.message)
        result = Array.isArray(data) ? data[0] : data
        break
      }
      case 'forensic_rpcs_check': {
        const { data, error } = await supabase.rpc('forensic_rpcs_healthcheck')
        if (error) throw new Error(error.message)
        const failed = ((data as Array<{ ok: boolean }>) ?? []).filter((r) => !r.ok).length
        result = { results: data, failed_count: failed }
        break
      }
      case 'create_test_notification': {
        const { data, error } = await supabase.rpc('upsert_system_notification', {
          p_severity: 'info',
          p_title: 'Test desde Operations Center',
          p_message: `Notificación de prueba creada por ${user.email} a las ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
          p_source: 'manual_test',
          p_metadata: { triggered_by: user.email },
          p_dedup_key: 'test_notification_admin',
        })
        if (error) throw new Error(error.message)
        result = { notification_id: data }
        break
      }
    }

    const duration_ms = Date.now() - start
    return NextResponse.json({
      ok: true,
      action,
      duration_ms,
      result,
      executed_by: user.email,
      executed_at: new Date().toISOString(),
    })
  } catch (e) {
    const duration_ms = Date.now() - start
    return NextResponse.json(
      {
        ok: false,
        action,
        error: e instanceof Error ? e.message : String(e),
        duration_ms,
      },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
