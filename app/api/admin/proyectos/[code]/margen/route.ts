/**
 * Margen real obra por proyecto — roadmap rentabilidad cost_scope
 *
 * GET /api/admin/proyectos/[code]/margen
 *     Devuelve agregados rentabilidad real del proyecto:
 *       - Ingresos (facturas emitidas)
 *       - Gastos directos (cost_scope='proyecto_directo')
 *       - Gastos indirectos (cost_scope='proyecto_indirecto')
 *       - Margen bruto / neto (+ porcentajes)
 *       - Retención 5% LOE pendiente
 *       - Presupuesto inicial vs certificado (desviación)
 *
 * Definición contable: PGC RICAC 14/04/2015.
 *
 * Auth: admin allow-list + AAL2 + acceso a la company del proyecto.
 *       Patrón idéntico a labor-costs/route.ts.
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

async function resolveCompanyAndProject(
  user: User,
  request: NextRequest,
  code: string,
) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 as const }
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }

  const supabase = createAdminSupabaseClient()
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, code, name, company_id, presupuesto_inicial, budget_estimated')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .single()

  if (projectError || !project) {
    return { error: 'Proyecto no encontrado', status: 404 as const }
  }

  return { activeCompanyId, project, supabase }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const resolved = await resolveCompanyAndProject(user, request, code)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { project, supabase } = resolved

  // Llamada RPC. Devuelve JSONB con todos los agregados.
  const { data, error } = await supabase.rpc('compute_project_margin', {
    p_project_id: project.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      presupuesto_inicial: project.presupuesto_inicial,
      budget_estimated: project.budget_estimated,
    },
    margen: data,
    computed_at: new Date().toISOString(),
  })
}

export const dynamic = 'force-dynamic'
