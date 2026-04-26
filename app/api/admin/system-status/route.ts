/**
 * GET /api/admin/system-status
 *
 * Estado consolidado del sistema de procesado de documentos:
 * - Stats Supabase invoices (24h, 7d, total, errores, drive)
 * - Última ejecución n8n del workflow general
 * - Estado de microservicio pdf2img (vía n8n proxy NO directo)
 *
 * Auth: misma allow-list + AAL2 que /api/db/*
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

const N8N_BASE = 'https://n8n.cathedralgroup.es/api/v1'
const WORKFLOW_GENERAL_ID = 'LWZWxjo9O5ku7tF7'
const WORKFLOW_HEALTHCHECK_ID = 'rVP7OfuMpZrHVPxa'

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

  const N8N_API_KEY = process.env.N8N_API_KEY
  const supabase = createAdminSupabaseClient()

  // ── Supabase: stats de invoices ──
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

  // Última factura insertada (cuándo se procesó algo por última vez)
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('created_at, empresa, amount_total')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── n8n: últimas ejecuciones del workflow general ──
  let n8nGeneralActive = false
  let n8nGeneralLastExec: { id: string; status: string; startedAt: string; stoppedAt: string | null } | null = null
  let n8nGeneralLastError: { id: string; startedAt: string; node?: string } | null = null
  let n8nHealthcheckActive = false

  if (N8N_API_KEY) {
    try {
      const wfRes = await fetch(`${N8N_BASE}/workflows/${WORKFLOW_GENERAL_ID}`, {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }, cache: 'no-store',
      })
      if (wfRes.ok) {
        const wf = await wfRes.json()
        n8nGeneralActive = wf.active === true
      }

      const hcRes = await fetch(`${N8N_BASE}/workflows/${WORKFLOW_HEALTHCHECK_ID}`, {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }, cache: 'no-store',
      })
      if (hcRes.ok) {
        const hc = await hcRes.json()
        n8nHealthcheckActive = hc.active === true
      }

      const execRes = await fetch(`${N8N_BASE}/executions?workflowId=${WORKFLOW_GENERAL_ID}&limit=10`, {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }, cache: 'no-store',
      })
      if (execRes.ok) {
        const execs = (await execRes.json()).data ?? []
        if (execs[0]) n8nGeneralLastExec = {
          id: execs[0].id,
          status: execs[0].status,
          startedAt: execs[0].startedAt,
          stoppedAt: execs[0].stoppedAt,
        }
        const lastError = execs.find((e: { status: string }) => e.status === 'error')
        if (lastError) n8nGeneralLastError = {
          id: lastError.id,
          startedAt: lastError.startedAt,
        }
      }
    } catch (err) {
      console.error('[system-status] n8n fetch failed:', err)
    }
  }

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
    n8n: {
      configured: !!N8N_API_KEY,
      general_active: n8nGeneralActive,
      healthcheck_active: n8nHealthcheckActive,
      last_execution: n8nGeneralLastExec,
      last_error: n8nGeneralLastError,
    },
  })
}
