/**
 * GET /api/admin/system-status
 *
 * Estado consolidado del sistema de procesado de documentos.
 * Lee SOLO Supabase (datos que ya tenemos accesibles). La salud del workflow
 * se infiere de la actividad real registrada (última factura procesada vs
 * horario laboral) — no requiere consultar n8n directamente.
 *
 * Auth: misma allow-list + AAL2 que /api/db/*
 */

import { NextResponse } from 'next/server'
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

export async function GET() {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminSupabaseClient()

  // Stats Supabase de invoices
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [todayCount, weekCount, totalCount, errorCount, withDrive, totalActive] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', dayAgo),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', weekAgo),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('review_status', 'error'),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('drive_url', 'is', null),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null),
  ])

  // Última factura insertada (señal indirecta de que el workflow está vivo)
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('created_at, empresa, amount_total')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    supabase: {
      invoices_24h: todayCount.count ?? 0,
      invoices_7d: weekCount.count ?? 0,
      invoices_total: totalCount.count ?? 0,
      errores_pendientes: errorCount.count ?? 0,
      con_drive_url: withDrive.count ?? 0,
      total_activas: totalActive.count ?? 0,
      drive_coverage_pct: totalActive.count && totalActive.count > 0
        ? Math.round(((withDrive.count ?? 0) / totalActive.count) * 100)
        : 0,
      last_invoice: lastInvoice ? {
        created_at: lastInvoice.created_at,
        empresa: lastInvoice.empresa,
        amount_total: lastInvoice.amount_total,
        hours_ago: Math.round((Date.now() - new Date(lastInvoice.created_at).getTime()) / (1000 * 60 * 60) * 10) / 10,
      } : null,
    },
  })
}
