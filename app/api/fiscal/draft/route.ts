/**
 * GET /api/fiscal/draft?modelo=303&ejercicio=2026&periodo=1T
 *
 * B4 — Devuelve el borrador del modelo AEAT solicitado calculado automáticamente
 * desde invoices + payrolls del periodo. NO crea filing, solo devuelve el JSON
 * con casillas pre-rellenadas para que el contable lo revise antes de presentar.
 *
 * Modelos soportados:
 *   - 303: IVA trimestral/mensual/anual (régimen general)
 *   - 111: IRPF retenciones rendimientos trabajo + profesionales
 *
 * Auth: admin allow-list + AAL2 + role owner/admin/contable de la company activa.
 *
 * Response: JSON con todas las casillas + alertas + notas + datos de empresa.
 *           Validar manualmente antes de presentar a AEAT.
 */

import { NextRequest, NextResponse } from 'next/server'
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

const SUPPORTED_MODELOS = new Set(['303', '111', '115', '347'])
const SUPPORTED_PERIODOS = new Set(['1T', '2T', '3T', '4T', 'A', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const modelo = url.searchParams.get('modelo') ?? ''
  const ejercicioStr = url.searchParams.get('ejercicio') ?? ''
  const periodo = url.searchParams.get('periodo') ?? ''

  if (!SUPPORTED_MODELOS.has(modelo)) {
    return NextResponse.json(
      { error: `modelo no soportado. Permitidos: ${[...SUPPORTED_MODELOS].join(', ')}` },
      { status: 400 },
    )
  }

  const ejercicio = parseInt(ejercicioStr, 10)
  if (!Number.isInteger(ejercicio) || ejercicio < 2020 || ejercicio > 2100) {
    return NextResponse.json(
      { error: 'ejercicio inválido (entero entre 2020 y 2100)' },
      { status: 400 },
    )
  }

  if (!SUPPORTED_PERIODOS.has(periodo)) {
    return NextResponse.json(
      { error: `periodo no soportado. Permitidos: ${[...SUPPORTED_PERIODOS].join(', ')}` },
      { status: 400 },
    )
  }

  // Resolver company activa
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Forbidden' },
      { status: 403 },
    )
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }

  // Verificar role
  const supabase = createAdminSupabaseClient()
  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', activeCompanyId)
    .is('revoked_at', null)
    .maybeSingle()
  if (!membership || !['owner', 'admin', 'contable'].includes(membership.role as string)) {
    return NextResponse.json(
      { error: 'Forbidden: requiere rol owner/admin/contable de la empresa activa' },
      { status: 403 },
    )
  }

  // Llamar RPC correspondiente
  const rpcMap: Record<string, string> = {
    '303': 'generate_303_draft',
    '111': 'generate_111_draft',
    '115': 'generate_115_draft',
    '347': 'generate_347_draft',
  }
  const rpcName = rpcMap[modelo]

  try {
    // 347 es anual (no requiere periodo), pasamos solo ejercicio
    const rpcArgs: Record<string, unknown> = {
      p_company_id: activeCompanyId,
      p_ejercicio: ejercicio,
    }
    if (modelo !== '347') {
      rpcArgs.p_periodo = periodo
    }
    const { data, error } = await supabase.rpc(rpcName, rpcArgs)
    if (error) throw new Error(error.message)

    return NextResponse.json({
      ok: true,
      draft: data,
      generated_by: user.email,
      generated_at: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
