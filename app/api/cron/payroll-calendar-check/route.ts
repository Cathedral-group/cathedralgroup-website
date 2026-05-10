/**
 * GET /api/cron/payroll-calendar-check — B8 alarma mensual nóminas
 *
 * Llamado por GitHub Actions cron mensual los días 22, 27, 30 a las 09:00
 * Madrid. Para cada company del grupo verifica:
 *   - Día 22: ¿nóminas del mes corriente generadas?
 *   - Día 27: ¿pagadas?
 *   - Día 30: ¿SS presentada?
 *
 * Si hay alertas (warning/critical) crea system_notification con dedup_key
 * por (company_id, hito, mes/año) para no spamear.
 *
 * Auth: Bearer AUDIT_CRON_SECRET o header x-vercel-cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function isAuthorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  return auth.slice(7) === expected
}

interface PayrollCalendarRow {
  company_id: string
  company_name: string
  current_month: number
  current_year: number
  active_employees: number
  payrolls_generated: number
  payrolls_pending: number
  ss_filing_done: boolean
  hint_22: string
  hint_27: string
  hint_30: string
  alerta_global: 'info' | 'warning' | 'critical'
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()

  try {
    const { data, error } = await supabase.rpc('payroll_calendar_check', { p_company_id: null })
    if (error) throw new Error(`payroll_calendar_check: ${error.message}`)

    const rows = (data as PayrollCalendarRow[]) ?? []
    let notificationsCreated = 0

    for (const row of rows) {
      // Solo crear notification si activos > 0 y severity != info
      if (row.active_employees === 0) continue
      if (row.alerta_global === 'info') continue

      const messages: string[] = []
      if (row.hint_22 && (row.hint_22.startsWith('⚠') || row.hint_22.startsWith('🔴')))
        messages.push(`Generación: ${row.hint_22}`)
      if (row.hint_27 && (row.hint_27.startsWith('⚠') || row.hint_27.startsWith('🔴') || row.hint_27.startsWith('⏰')))
        messages.push(`Pago: ${row.hint_27}`)
      if (row.hint_30 && (row.hint_30.startsWith('⚠') || row.hint_30.startsWith('🔴')))
        messages.push(`SS: ${row.hint_30}`)

      if (messages.length === 0) continue

      const dedupKey = `payroll_calendar_${row.company_id}_${row.current_year}_${row.current_month}`
      await supabase.rpc('upsert_system_notification', {
        p_severity: row.alerta_global,
        p_title: `Nóminas ${row.current_month}/${row.current_year} — ${row.company_name}`,
        p_message: `${messages.join(' · ')} (${row.payrolls_generated}/${row.active_employees} generadas)`,
        p_source: 'payroll_calendar_check',
        p_metadata: row as unknown as Record<string, unknown>,
        p_dedup_key: dedupKey,
      })
      notificationsCreated += 1
    }

    return NextResponse.json({
      ok: true,
      checked: rows.length,
      notifications_created: notificationsCreated,
      results: rows,
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
