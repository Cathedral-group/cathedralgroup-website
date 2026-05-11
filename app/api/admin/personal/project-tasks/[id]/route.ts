/**
 * Tarea individual de proyecto — endpoints admin.
 *
 * PATCH  /api/admin/personal/project-tasks/[id]
 *   Body: { texto?, notas?, estado?, prioridad?, fecha_objetivo?, asignada_a?, phase_id?, tipo? }
 *   Permite cualquier modificación. Si estado pasa a 'hecha' → registra completed_at + by.
 *
 * DELETE /api/admin/personal/project-tasks/[id]
 *   Soft-delete.
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

const ALLOWED_ESTADO = ['pendiente', 'en_curso', 'hecha']
const ALLOWED_TIPO = ['obra_presupuesto', 'obra_remate', 'interna_socio']
const ALLOWED_PRIORIDAD = ['baja', 'media', 'alta']

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
    texto?: string
    notas?: string | null
    estado?: string
    prioridad?: string
    fecha_objetivo?: string | null
    asignada_a?: string | null
    phase_id?: string | null
    tipo?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (body.estado && !ALLOWED_ESTADO.includes(body.estado)) {
    return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
  }
  if (body.tipo && !ALLOWED_TIPO.includes(body.tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }
  if (body.prioridad && !ALLOWED_PRIORIDAD.includes(body.prioridad)) {
    return NextResponse.json({ error: 'prioridad inválida' }, { status: 400 })
  }
  if (body.fecha_objetivo && !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_objetivo)) {
    return NextResponse.json({ error: 'fecha_objetivo formato YYYY-MM-DD' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.texto !== undefined) update.texto = body.texto.trim()
  if (body.notas !== undefined) update.notas = body.notas?.trim() || null
  if (body.prioridad !== undefined) update.prioridad = body.prioridad
  if (body.fecha_objetivo !== undefined) update.fecha_objetivo = body.fecha_objetivo || null
  if (body.asignada_a !== undefined) update.asignada_a = body.asignada_a || null
  if (body.phase_id !== undefined) update.phase_id = body.phase_id || null
  if (body.tipo !== undefined) update.tipo = body.tipo

  if (body.estado !== undefined) {
    update.estado = body.estado
    if (body.estado === 'hecha') {
      update.completed_at = new Date().toISOString()
      update.completed_by_email = user.email ?? null
    } else if (body.estado === 'pendiente' || body.estado === 'en_curso') {
      update.completed_at = null
      update.completed_by_email = null
      update.completed_by_employee_id = null
    }
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('project_tasks')
    .update(update)
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .select(
      `id, project_id, texto, notas, estado, prioridad, tipo, fecha_objetivo, asignada_a, phase_id,
       created_at, created_by_email, created_source, completed_at, completed_by_email,
       updated_at,
       project:project_id (id, code, name),
       assigned_employee:asignada_a (id, nombre)`,
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
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
    .from('project_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
