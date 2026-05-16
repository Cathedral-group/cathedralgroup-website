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

  // Stats consolidadas de las 3 tablas destino del clasificador (invoices + quotes + documents)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    inv24h, quo24h, doc24h,
    inv7d, quo7d, doc7d,
    invTot, quoTot, docTot,
    invErr, quoErr,
    invDrive, quoDrive, docDrive,
  ] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', dayAgo),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', dayAgo),
    supabase.from('documents').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', dayAgo),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', weekAgo),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', weekAgo),
    supabase.from('documents').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', weekAgo),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('documents').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('review_status', 'error'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('review_status', 'error'),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('drive_url', 'is', null),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('drive_url', 'is', null),
    supabase.from('documents').select('id', { count: 'exact', head: true }).is('deleted_at', null).not('drive_url', 'is', null),
  ])

  // Última fila insertada (señal workflow vivo). Solo invoices + quotes ya que
  // documents.titulo no se usa en lastCandidates output. Reduce 1 SELECT Supabase.
  const [lastInv, lastQuo] = await Promise.all([
    supabase.from('invoices').select('created_at, empresa, amount_total').is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('quotes').select('created_at, empresa, total').is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const lastCandidates = [
    lastInv.data ? { table: 'invoices', created_at: lastInv.data.created_at, empresa: lastInv.data.empresa, amount: lastInv.data.amount_total } : null,
    lastQuo.data ? { table: 'quotes',   created_at: lastQuo.data.created_at, empresa: lastQuo.data.empresa, amount: lastQuo.data.total } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)
  const lastEntry = lastCandidates.length
    ? lastCandidates.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b)
    : null

  const totalActive = (invTot.count ?? 0) + (quoTot.count ?? 0) + (docTot.count ?? 0)
  const totalDrive = (invDrive.count ?? 0) + (quoDrive.count ?? 0) + (docDrive.count ?? 0)

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    supabase: {
      // Compatibilidad con el panel admin actual: alias `invoices_*` mantienen
      // el contador agregado de las 3 tablas (invoices + quotes + documents)
      invoices_24h: (inv24h.count ?? 0) + (quo24h.count ?? 0) + (doc24h.count ?? 0),
      invoices_7d: (inv7d.count ?? 0) + (quo7d.count ?? 0) + (doc7d.count ?? 0),
      invoices_total: totalActive,
      errores_pendientes: (invErr.count ?? 0) + (quoErr.count ?? 0),
      con_drive_url: totalDrive,
      total_activas: totalActive,
      drive_coverage_pct: totalActive > 0 ? Math.round((totalDrive / totalActive) * 100) : 0,
      breakdown_24h: {
        invoices: inv24h.count ?? 0,
        quotes: quo24h.count ?? 0,
        documents: doc24h.count ?? 0,
      },
      breakdown_total: {
        invoices: invTot.count ?? 0,
        quotes: quoTot.count ?? 0,
        documents: docTot.count ?? 0,
      },
      last_invoice: lastEntry ? {
        table: lastEntry.table,
        created_at: lastEntry.created_at,
        empresa: lastEntry.empresa,
        amount_total: lastEntry.amount,
        hours_ago: Math.round((Date.now() - new Date(lastEntry.created_at).getTime()) / (1000 * 60 * 60) * 10) / 10,
      } : null,
    },
  })
}
