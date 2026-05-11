/**
 * Actualizar una fase de proyecto. Foco: pct_certificado editable por admin
 * (la certificación es decisión manual, no automática desde tareas tachadas).
 *
 * PATCH /api/admin/personal/project-phases/[id]
 *   Body: { pct_certificado?, status?, start_date?, end_date?, name? }
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
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

const ALLOWED_STATUS = ['pendiente', 'en_curso', 'completado']

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
    pct_certificado?: number
    status?: string
    start_date?: string | null
    end_date?: string | null
    name?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (body.status && !ALLOWED_STATUS.includes(body.status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.pct_certificado !== undefined) {
    const pct = Number(body.pct_certificado)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: 'pct_certificado entre 0 y 100' }, { status: 400 })
    }
    update.pct_certificado = pct
    update.pct_certificado_updated_at = new Date().toISOString()
    update.pct_certificado_updated_by = user.email ?? null
  }
  if (body.status !== undefined) update.status = body.status
  if (body.start_date !== undefined) update.start_date = body.start_date || null
  if (body.end_date !== undefined) update.end_date = body.end_date || null
  if (body.name !== undefined) update.name = body.name.trim()

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  // Verificar pertenencia al proyecto de la empresa activa
  const supabase = createAdminSupabaseClient()
  const { data: phase } = await supabase
    .from('project_phases')
    .select('id, project_id, projects:project_id (company_id)')
    .eq('id', id)
    .maybeSingle()
  if (!phase) return NextResponse.json({ error: 'Fase no encontrada' }, { status: 404 })

  type ProjectCompanyJoin = { company_id?: string | null }
  const proj = phase.projects as ProjectCompanyJoin | ProjectCompanyJoin[] | null
  const phaseCompanyId = Array.isArray(proj) ? proj[0]?.company_id : proj?.company_id
  if (phaseCompanyId !== resolved.activeCompanyId) {
    return NextResponse.json({ error: 'Fase fuera de tu empresa activa' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('project_phases')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, phase: data })
}

export const dynamic = 'force-dynamic'
