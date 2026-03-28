import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

// Resources that support soft delete (deleted_at field)
const SOFT_DELETE_TABLES = new Set(['leads', 'clients', 'suppliers', 'projects', 'invoices', 'quotes'])

// Map URL segment to actual table name
function tableFor(resource: string): string | null {
  const map: Record<string, string> = {
    leads: 'leads',
    clients: 'clients',
    suppliers: 'suppliers',
    projects: 'projects',
    invoices: 'invoices',
    quotes: 'quotes',
    'project-phases': 'project_phases',
    communications: 'communications',
    catalog: 'quote_items_catalog',
    'quality-coefficients': 'quality_coefficients',
    papelera: 'papelera', // handled separately
  }
  return map[resource] ?? null
}

type Ctx = { params: Promise<{ resource: string }> }

function fmtEur(val: number): string {
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

async function buildQuotePdf(id: string): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient()
  const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', id).single()
  if (error || !quote) return new NextResponse('Presupuesto no encontrado', { status: 404 })

  let clientName = ''
  let projectCode = ''
  if (quote.client_id) {
    const { data: c } = await supabase.from('clients').select('name').eq('id', quote.client_id).single()
    clientName = c?.name ?? ''
  }
  if (quote.project_id) {
    const { data: p } = await supabase.from('projects').select('code, name').eq('id', quote.project_id).single()
    projectCode = p ? `${p.code} — ${p.name}` : ''
  }

  const qualityLabels: Record<string, string> = { estandar: 'Estándar', premium: 'Premium', lujo: 'Lujo' }
  const items: { description: string; quantity: number; unit: string; unit_price: number; vat_pct: number; total: number }[] = Array.isArray(quote.items) ? quote.items : []

  const itemRows = items.filter((it) => it.description).map((it, i) => `
    <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
      <td class="td-desc">${it.description}</td><td class="td-num">${it.quantity}</td>
      <td class="td-center">${it.unit}</td><td class="td-num">${fmtEur(it.unit_price)}</td>
      <td class="td-center">${it.vat_pct}%</td><td class="td-num bold">${fmtEur(it.total)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presupuesto ${quote.number} — Cathedral Group</title><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;padding-top:48px}
.page{max-width:794px;margin:0 auto;padding:48px 56px;min-height:100vh}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:28px;border-bottom:2px solid #B4A898}
.company-name{font-size:18px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.company-tagline{font-size:10px;color:#888;letter-spacing:.12em;text-transform:uppercase;margin-top:3px}
.doc-block{text-align:right}.doc-type{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#B4A898;margin-bottom:4px}
.doc-number{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:32px}
.meta-block label{display:block;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;margin-bottom:4px}
.meta-block .value{font-size:12px;font-weight:500}
.quality-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;border-radius:3px}
.quality-estandar{background:#f0eeec;color:#6b5e52}.quality-premium{background:#dbeafe;color:#1d4ed8}.quality-lujo{background:#fef3c7;color:#92400e}
.section-title{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#B4A898;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
thead tr{border-bottom:1px solid #e5e1dc;border-top:1px solid #e5e1dc}
th{text-align:left;padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#999}
th.th-num,td.td-num{text-align:right}th.th-center,td.td-center{text-align:center}
td{padding:7px 8px;font-size:11px;color:#2a2a2a;vertical-align:top}td.td-desc{max-width:280px}td.bold{font-weight:600}
.row-even{background:#fff}.row-odd{background:#faf9f8}tbody tr:last-child{border-bottom:1px solid #e5e1dc}
.totals{display:flex;justify-content:flex-end;margin-bottom:32px}.totals-table{width:260px}
.totals-table td{padding:4px 8px}.totals-table .label-cell{font-size:11px;color:#666}
.totals-table .amount-cell{text-align:right;font-size:11px;font-variant-numeric:tabular-nums}
.total-row td{border-top:2px solid #B4A898;padding-top:8px}.total-row .label-cell{font-size:13px;font-weight:700;color:#1a1a1a}.total-row .amount-cell{font-size:14px;font-weight:700;color:#1a1a1a}
.notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:40px}
.notes-block p{font-size:10px;color:#555;line-height:1.6;white-space:pre-wrap}
.footer{padding-top:20px;border-top:1px solid #e5e1dc;display:flex;justify-content:space-between;align-items:center}
.footer-brand{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#B4A898}
.footer-meta{font-size:9px;color:#aaa}
.print-bar{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100}
.print-bar span{font-size:11px;font-weight:600;letter-spacing:.06em}
.btn-print{background:#B4A898;color:#fff;border:0;padding:7px 18px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:3px}
.btn-print:hover{background:#9A8D7C}
@media print{body{padding-top:0}.page{padding:28px 40px;max-width:none;min-height:auto}.print-bar{display:none!important}}
</style></head><body>
<div class="print-bar"><span>Presupuesto ${quote.number} — Cathedral Group</span><button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button></div>
<div class="page">
<div class="header"><div class="company-block"><div class="company-name">Cathedral Group</div><div class="company-tagline">Reformas de alta calidad · Madrid</div></div><div class="doc-block"><div class="doc-type">Presupuesto</div><div class="doc-number">${quote.number}</div></div></div>
<div class="meta">
${clientName ? `<div class="meta-block"><label>Cliente</label><div class="value">${clientName}</div></div>` : '<div class="meta-block"></div>'}
<div class="meta-block"><label>Fecha de emisión</label><div class="value">${fmtDate(quote.created_at)}</div></div>
<div class="meta-block"><label>Válido hasta</label><div class="value">${fmtDate(quote.valid_until)}</div></div>
${projectCode ? `<div class="meta-block"><label>Proyecto</label><div class="value">${projectCode}</div></div>` : ''}
${quote.quality_level ? `<div class="meta-block"><label>Nivel de calidad</label><div class="value"><span class="quality-badge quality-${quote.quality_level}">${qualityLabels[quote.quality_level] ?? quote.quality_level}</span></div></div>` : ''}
</div>
<p class="section-title">Partidas del presupuesto</p>
<table><thead><tr><th>Descripción</th><th class="th-num">Cant.</th><th class="th-center">Ud.</th><th class="th-num">Precio ud.</th><th class="th-center">IVA</th><th class="th-num">Total</th></tr></thead>
<tbody>${itemRows || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px">Sin partidas</td></tr>'}</tbody></table>
<div class="totals"><table class="totals-table"><tbody>
<tr><td class="label-cell">Base imponible</td><td class="amount-cell">${fmtEur(quote.subtotal ?? 0)}</td></tr>
<tr><td class="label-cell">IVA</td><td class="amount-cell">${fmtEur(quote.vat_total ?? 0)}</td></tr>
<tr class="total-row"><td class="label-cell">Total presupuesto</td><td class="amount-cell">${fmtEur(quote.total ?? 0)}</td></tr>
</tbody></table></div>
${(quote.notes || quote.conditions) ? `<div class="notes-grid">
${quote.notes ? `<div class="notes-block"><p class="section-title">Notas</p><p>${quote.notes.replace(/\n/g, '<br>')}</p></div>` : ''}
${quote.conditions ? `<div class="notes-block"><p class="section-title">Condiciones</p><p>${quote.conditions.replace(/\n/g, '<br>')}</p></div>` : ''}
</div>` : ''}
<div class="footer"><span class="footer-brand">Cathedral Group</span><span class="footer-meta">cathedralgroup.es · info@cathedralgroup.es</span></div>
</div></body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params
  const supabase = createAdminSupabaseClient()

  if (resource === 'presupuesto-pdf') {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    return buildQuotePdf(id)
  }

  const table = tableFor(resource)
  if (!table || table === 'papelera') return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  if (resource === 'catalog') {
    const { data, error } = await supabase
      .from(table).select('*').eq('active', true)
      .order('chapter_code').order('subcategory').order('description')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (resource === 'quality-coefficients') {
    const { data, error } = await supabase.from(table).select('*').order('coefficient')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'Recurso no soporta GET' }, { status: 405 })
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params
  const table = tableFor(resource)
  if (!table || table === 'papelera') return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const body = await request.json()
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.from(table).insert(body).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params

  // Papelera: restore item (set deleted_at = null)
  if (resource === 'papelera') {
    const { id, table } = await request.json()
    if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })
    if (!SOFT_DELETE_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const table = tableFor(resource)
  if (!table) return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const { id, ...updates } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const payload = resource === 'quality-coefficients'
    ? { ...updates, updated_at: new Date().toISOString() }
    : updates
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params

  // Papelera: permanent delete
  if (resource === 'papelera') {
    const { id, table } = await request.json()
    if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })
    if (!SOFT_DELETE_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const table = tableFor(resource)
  if (!table) return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()

  if (SOFT_DELETE_TABLES.has(table)) {
    // Soft delete
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Hard delete (project_phases, communications)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
