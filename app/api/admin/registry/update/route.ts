/**
 * POST /api/admin/registry/update
 *
 * Endpoint mutación SSOT Cathedral. Solo admins con AAL2.
 * Body: { table: 'doc_types_registry' | 'prompt_templates' | 'ai_providers_registry', code: string, body: {...} }
 *
 * Tras UPDATE, BD dispara pg_notify('cathedral_registry_change', ...) → n8n
 * recibe via PostgreSQL LISTEN trigger (workflow auxiliar) y resetea
 * $workflowStaticData. UI clientes refrescan vía invalidateRegistryCache().
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

const ALLOWED_TABLES = ['doc_types_registry', 'prompt_templates', 'ai_providers_registry'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let payload: { table?: string; code?: string; body?: Record<string, unknown> }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { table, code, body } = payload
  if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
    return NextResponse.json({ error: 'table inválida' }, { status: 400 })
  }
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code requerido' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body requerido' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from(table)
    .update(body)
    .eq('code', code)
    .select('code')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  return NextResponse.json({ ok: true, code: data?.code })
}
