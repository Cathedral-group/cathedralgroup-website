/**
 * GET /api/cron/backup-stale-check
 *
 * Sprint A Backup Robusto — alarma si el último backup exitoso es >26h.
 *
 * Llamado por:
 *   - Vercel cron schedule cada 6h (vercel.json)
 *   - Manual con header `x-vercel-cron: 1` o Bearer AUDIT_CRON_SECRET
 *
 * Lógica:
 *   1. Llama RPC is_backup_stale(p_threshold_hours=26)
 *   2. Para cada backup_type stale, crea system_notification critical
 *      con dedup_key='backup_stale_<tipo>' (no spam)
 *   3. Si todos los backups OK, NO crea notificación (silence on success)
 *
 * Threshold 26h: el cron diario corre a 04:30 Madrid. 26h = margen seguro
 * para que un retraso de 2h no dispare falsa alarma.
 *
 * Response 200: { ok: true, results: [...], stale_count, notifications_created }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function isAuthorized(request: NextRequest): boolean {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  if (isVercelCron) return true
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  return auth.slice(7) === expected
}

interface StaleResult {
  backup_type: string
  last_success_at: string | null
  hours_since_last_success: number
  is_stale: boolean
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()

  try {
    const { data, error } = await supabase.rpc('is_backup_stale', { p_threshold_hours: 26 })
    if (error) throw new Error(`is_backup_stale: ${error.message}`)

    const results = (data as StaleResult[]) ?? []
    const stale = results.filter((r) => r.is_stale)

    let notificationsCreated = 0
    for (const item of stale) {
      const lastSuccessLabel = item.last_success_at
        ? new Date(item.last_success_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
        : 'NUNCA'
      const hoursLabel = item.hours_since_last_success >= 99999
        ? 'sin registros'
        : `${Math.round(item.hours_since_last_success)}h`

      await supabase.rpc('upsert_system_notification', {
        p_severity: 'critical',
        p_title: `Backup ${item.backup_type} stale (${hoursLabel} sin éxito)`,
        p_message:
          `El último backup ${item.backup_type} con status='success' fue el ${lastSuccessLabel}. ` +
          `Threshold: 26h. Acción: revisar GitHub Actions backup-db.yml o cron Hetzner. ` +
          `Runbook: runbook_recovery.md Escenario 5.`,
        p_source: 'backup_stale_check',
        p_metadata: {
          backup_type: item.backup_type,
          hours_since_last_success: item.hours_since_last_success,
          last_success_at: item.last_success_at,
        },
        p_dedup_key: `backup_stale_${item.backup_type}`,
      })
      notificationsCreated += 1
    }

    return NextResponse.json({
      ok: true,
      results,
      stale_count: stale.length,
      notifications_created: notificationsCreated,
      checked_at: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
