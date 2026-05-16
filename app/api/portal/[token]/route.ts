import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, number, created_at, valid_until, total, subtotal, vat_total, project_id, client_id, certifications, status, portal_token_expires_at')
    .eq('portal_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !quote) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Expiration check (lifecycle-based — fórmula aprobada 2026-04-25):
  //   borrador/enviado/aceptado-en-obra: portal_token_expires_at = NULL → vivo siempre
  //   rechazado o proyecto cancelado:    NOW() + 30 días
  //   proyecto finalizado:                end_date_real + 2 años (post-venta + garantías)
  // Si expiró, devolver 410 Gone para que el cliente sepa que el link existió pero ya no es válido.
  // Audit 16/05/2026: usar `<=` no `<` para denegar exactamente al boundary
  // (`<` daba 1 tick de gracia teórico aunque inocuo en práctica).
  if (quote.portal_token_expires_at && new Date(quote.portal_token_expires_at) <= new Date()) {
    return NextResponse.json(
      {
        error: 'Este enlace ha expirado',
        message: 'El enlace al portal de este presupuesto ya no está activo. Contacte con Cathedral Group para reactivarlo si lo necesita.',
      },
      { status: 410 }
    )
  }

  // Fetch client and project info (public-safe fields only)
  let clientName = ''
  if (quote.client_id) {
    const { data: c } = await supabase
      .from('clients')
      .select('name, company_name')
      .eq('id', quote.client_id)
      .single()
    if (c) clientName = (c.company_name || c.name) ?? ''
  }

  let projectName = ''
  if (quote.project_id) {
    const { data: p } = await supabase
      .from('projects')
      .select('code, name')
      .eq('id', quote.project_id)
      .single()
    if (p) projectName = `${p.code} — ${p.name}`
  }

  return NextResponse.json({
    id: quote.id,
    number: quote.number,
    created_at: quote.created_at,
    valid_until: quote.valid_until,
    total: quote.total,
    subtotal: quote.subtotal,
    vat_total: quote.vat_total,
    status: quote.status,
    client_name: clientName,
    project_name: projectName,
    certifications: Array.isArray(quote.certifications) ? quote.certifications : [],
  })
}
