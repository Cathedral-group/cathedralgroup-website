/**
 * Endpoints /api/admin/companies — Bloque 0 F3.3
 *
 * GET  → lista companies del user actual (las que ve en el selector empresa)
 * POST → crear nueva SL del grupo (solo owner del grupo)
 *
 * Auth: admin allow-list + AAL2.
 *
 * POST body:
 * {
 *   cif: string,                    // CIF único España
 *   razon_social: string,
 *   nombre_comercial?: string,
 *   parent_company_id?: string,     // UUID si es subsidiaria de otra del grupo
 *   participation_pct?: number,
 *   consolidation_method?: string,
 *   sii_obligado?: boolean,
 *   audit_obligada?: boolean,
 *   ...
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { syncCompanyMetadataForUser } from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function GET(_request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminSupabaseClient()

  try {
    // Companies del user actual (via company_members)
    const { data: memberships, error: memErr } = await supabase
      .from('company_members')
      .select('company_id, role, granted_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
    if (memErr) throw new Error(memErr.message)

    const companyIds = (memberships ?? []).map((m) => m.company_id as string)
    if (companyIds.length === 0) {
      return NextResponse.json({ companies: [], active_company_id: null })
    }

    const { data: companies, error: cErr } = await supabase
      .from('companies')
      .select(
        'id, cif, razon_social, nombre_comercial, parent_company_id, participation_pct, consolidation_method, sii_obligado, verifactu_obligado, audit_obligada, status, fecha_constitucion, capital_social, codigo_cnae, ccc_principal, created_at',
      )
      .in('id', companyIds)
      .is('deleted_at', null)
      .order('razon_social')
    if (cErr) throw new Error(cErr.message)

    const rolesMap = new Map<string, string>()
    for (const m of memberships ?? []) rolesMap.set(m.company_id as string, m.role as string)

    const enriched = (companies ?? []).map((c) => ({
      ...c,
      user_role: rolesMap.get(c.id as string) ?? null,
    }))

    return NextResponse.json({
      companies: enriched,
      active_company_id:
        (user.app_metadata?.active_company_id as string | undefined) ?? companyIds[0],
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

interface CreateBody {
  cif?: string
  razon_social?: string
  nombre_comercial?: string
  domicilio_fiscal?: string
  codigo_postal?: string
  municipio?: string
  provincia?: string
  pais?: string
  fecha_constitucion?: string
  capital_social?: number
  codigo_cnae?: string
  ccc_principal?: string
  parent_company_id?: string
  participation_pct?: number
  consolidation_method?: 'integration_global' | 'integration_proportional' | 'equivalence'
  sii_obligado?: boolean
  verifactu_obligado?: boolean
  audit_obligada?: boolean
  consolidacion_obligada?: boolean
  notes?: string
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: CreateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.cif || !body.razon_social) {
    return NextResponse.json(
      { error: 'cif y razon_social son obligatorios' },
      { status: 400 },
    )
  }

  // Validación CIF España: empieza por letra A/B/C/D/E/F/G/H/J/N/P/Q/R/S/U/V/W
  if (!/^[A-HJNP-SUVW]\d{7}[0-9A-J]$/i.test(body.cif)) {
    return NextResponse.json(
      { error: 'CIF inválido. Formato esperado: letra + 7 dígitos + dígito/letra control' },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()

  try {
    // Si parent_company_id está, validar que el user tiene acceso al parent
    if (body.parent_company_id) {
      const { data: parentMember, error: parentErr } = await supabase
        .from('company_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', body.parent_company_id)
        .is('revoked_at', null)
        .maybeSingle()
      if (parentErr) throw new Error(parentErr.message)
      if (!parentMember || !['owner', 'admin'].includes(parentMember.role as string)) {
        return NextResponse.json(
          { error: 'Forbidden: necesitas ser owner/admin del parent_company para crear subsidiaria' },
          { status: 403 },
        )
      }
    }

    // INSERT empresa
    const { data: created, error: insErr } = await supabase
      .from('companies')
      .insert({
        cif: body.cif.toUpperCase(),
        razon_social: body.razon_social,
        nombre_comercial: body.nombre_comercial ?? null,
        domicilio_fiscal: body.domicilio_fiscal ?? null,
        codigo_postal: body.codigo_postal ?? null,
        municipio: body.municipio ?? null,
        provincia: body.provincia ?? null,
        pais: body.pais ?? 'ES',
        fecha_constitucion: body.fecha_constitucion ?? null,
        capital_social: body.capital_social ?? null,
        codigo_cnae: body.codigo_cnae ?? null,
        ccc_principal: body.ccc_principal ?? null,
        parent_company_id: body.parent_company_id ?? null,
        participation_pct: body.participation_pct ?? null,
        consolidation_method: body.consolidation_method ?? null,
        sii_obligado: body.sii_obligado ?? false,
        verifactu_obligado: body.verifactu_obligado ?? true,
        audit_obligada: body.audit_obligada ?? false,
        consolidacion_obligada: body.consolidacion_obligada ?? false,
        notes: body.notes ?? null,
        metadata: { created_by: user.email, source: 'admin_panel' },
      })
      .select()
      .single()
    if (insErr) {
      if (insErr.code === '23505') {
        return NextResponse.json(
          { error: `CIF ${body.cif} ya existe en el grupo` },
          { status: 409 },
        )
      }
      throw new Error(insErr.message)
    }

    // El creador automáticamente es owner de la nueva empresa
    const { error: memberErr } = await supabase.from('company_members').insert({
      user_id: user.id,
      company_id: created.id,
      role: 'owner',
      granted_by: user.id,
    })
    if (memberErr) throw new Error(`asignar owner: ${memberErr.message}`)

    // Sincronizar app_metadata del creador (incluye nueva company en JWT)
    await syncCompanyMetadataForUser(user.id)

    // Audit log
    await supabase.from('audit_log_chain').insert({
      actor_user_id: user.id,
      actor_email: user.email,
      action: 'INSERT',
      table_name: 'companies',
      record_id: created.id,
      company_id: created.id,
      after_data: created,
      metadata: { source: 'admin_panel_create_company' },
    })

    return NextResponse.json({ ok: true, company: created }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
