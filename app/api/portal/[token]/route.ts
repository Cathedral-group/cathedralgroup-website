import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, number, created_at, valid_until, total, subtotal, vat_total, project_id, client_id, certifications, status')
    .eq('portal_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !quote) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

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
