/**
 * PATCH  /api/admin/personal/ausencias/[id]
 *        Body: { status?, decision_notes? }
 *        Aprobar/rechazar una solicitud de ausencia.
 *
 * DELETE /api/admin/personal/ausencias/[id]
 *        Soft-delete.
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { dismissNotificationByDedup } from '@/lib/admin-notify'
import {
  resolveCompanyIdForRequest,
  getCompanyContextFromUser,
  CATHEDRAL_INVESTMENT_SL_ID,
} from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function resolveCompany(user: User, request: NextRequest) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 } as const
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }
  return { activeCompanyId } as const
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params
  let body: {
    status?: string
    decision_notes?: string
    cancellation_decision?: 'approved' | 'rejected'
    cancellation_admin_motivo?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const ALLOWED = ['pending', 'approved', 'rejected', 'cancelled']
  if (body.status && !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }
  if (body.cancellation_decision && !['approved', 'rejected'].includes(body.cancellation_decision)) {
    return NextResponse.json({ error: 'cancellation_decision inválida' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const nowIso = new Date().toISOString()

  // Cargar la ausencia primero para conocer tipo + status actual (necesario para banco horas)
  const { data: current } = await supabase
    .from('worker_absences')
    .select('id, status, tipo')
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .maybeSingle()

  if (!current) return NextResponse.json({ error: 'Ausencia no encontrada' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: nowIso }

  // Decisión sobre solicitud de cancelación del trabajador
  if (body.cancellation_decision) {
    update.cancellation_decided_at = nowIso
    update.cancellation_decided_by_email = user.email ?? null
    update.cancellation_decision = body.cancellation_decision
    if (body.cancellation_decision === 'approved') {
      update.status = 'cancelled'
      update.decided_at = nowIso
      update.decided_by_email = user.email ?? null
      if (body.decision_notes) update.decision_notes = body.decision_notes
    }
    // si rejected: el status sigue como estaba (approved); solo registramos la decisión
  } else if (body.status) {
    update.status = body.status
    if (['approved', 'rejected', 'cancelled'].includes(body.status)) {
      update.decided_at = nowIso
      update.decided_by_email = user.email ?? null
    }
    if (body.status === 'cancelled' && body.cancellation_admin_motivo) {
      update.cancellation_admin_motivo = body.cancellation_admin_motivo
    }
    if (body.decision_notes !== undefined) update.decision_notes = body.decision_notes
  } else if (body.decision_notes !== undefined) {
    update.decision_notes = body.decision_notes
  }

  const { data, error } = await supabase
    .from('worker_absences')
    .update(update)
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si se cancela una ausencia banco_horas que estaba aprobada → restituir saldo
  const becameCancelled =
    update.status === 'cancelled' && current.status === 'approved' && current.tipo === 'banco_horas'
  if (becameCancelled) {
    try {
      await supabase.rpc('restitute_banco_horas_on_cancel', {
        p_absence_id: id,
        p_admin_email: user.email ?? 'admin',
      })
    } catch (e) {
      console.warn('[ausencias restitute banco horas]', e)
    }
  }

  // Auto-dismiss notificación pendiente si el admin la resolvió (approved/rejected/cancelled)
  if (body.status && body.status !== 'pending') {
    dismissNotificationByDedup('portal_trabajador', `absence:${id}`, user.email ?? undefined)
      .catch((e) => console.warn('[ausencias dismiss]', e))
  }
  // Auto-dismiss notificación de petición de cancelación si el admin la decidió
  if (body.cancellation_decision) {
    dismissNotificationByDedup('portal_trabajador', `absence_cancel:${id}`, user.email ?? undefined)
      .catch((e) => console.warn('[ausencias dismiss cancel]', e))
  }

  return NextResponse.json({ ok: true, row: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('worker_absences')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dismissNotificationByDedup('portal_trabajador', `absence:${id}`, user.email ?? undefined)
    .catch((e) => console.warn('[ausencias dismiss delete]', e))

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
