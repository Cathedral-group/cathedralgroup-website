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

function divisionFor(projectType?: string | null): string | null {
  const map: Record<string, string> = {
    reforma: 'Spaces',
    interiorismo: 'Spaces',
    cambio_uso: 'Spaces',
    obra_nueva: 'Developments',
    promocion: 'Developments',
  }
  return map[projectType ?? ''] ?? null
}

interface ClientData {
  name: string
  nif_cif?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  company_name?: string | null
}

function buildPdfHeader(division: string | null): string {
  const divisionLine = division
    ? `<div class="company-division">${division}</div>`
    : ''
  return `
    <div class="header">
      <div class="company-block">
        <img src="/img/logo.png" alt="Cathedral Group" class="logo" />
        <div class="company-name">Cathedral Group</div>
        ${divisionLine}
        <div class="company-tagline">Reformas y promociones de lujo · Madrid</div>
        <div class="company-detail">Cathedral Group SL · CIF B19761915 · cathedralgroup.es</div>
      </div>
      <div class="doc-slot"><!-- doc block injected per PDF type --></div>
    </div>`
}

function buildClientBlock(client: ClientData | null): string {
  if (!client) return '<div class="meta-block"></div>'
  const lines = [
    `<div class="value client-name">${client.company_name || client.name}</div>`,
    client.nif_cif ? `<div class="client-detail">${client.nif_cif}</div>` : '',
    client.address ? `<div class="client-detail">${client.address}</div>` : '',
    client.email ? `<div class="client-detail">${client.email}</div>` : '',
    client.phone ? `<div class="client-detail">${client.phone}</div>` : '',
  ].filter(Boolean).join('')
  return `<div class="meta-block"><label>Cliente</label>${lines}</div>`
}

const PDF_COMMON_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;padding-top:48px}
.page{max-width:860px;margin:0 auto;padding:48px 56px;min-height:100vh}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #B4A898}
.logo{height:36px;width:auto;margin-bottom:8px;display:block}
.company-name{font-size:18px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.company-division{font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#B4A898;margin-top:2px}
.company-tagline{font-size:10px;color:#888;letter-spacing:.10em;text-transform:uppercase;margin-top:4px}
.company-detail{font-size:9px;color:#aaa;margin-top:2px}
.doc-block{text-align:right}
.doc-type{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#B4A898;margin-bottom:4px}
.doc-number{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.doc-sub{font-size:10px;color:#888;margin-top:4px}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:32px}
.meta-block label{display:block;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#999;margin-bottom:4px}
.meta-block .value{font-size:12px;font-weight:500}
.meta-block .client-name{font-size:12px;font-weight:600}
.meta-block .client-detail{font-size:10px;color:#666;margin-top:1px}
.section-title{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#B4A898;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
thead tr{border-bottom:1px solid #e5e1dc;border-top:1px solid #e5e1dc}
th{text-align:left;padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#999}
th.th-num,td.td-num{text-align:right}th.th-center,td.td-center{text-align:center}
td{padding:7px 8px;font-size:11px;color:#2a2a2a;vertical-align:top}
td.td-desc{word-wrap:break-word;overflow-wrap:break-word;white-space:normal}
td.bold{font-weight:600}
.row-even{background:#fff}.row-odd{background:#faf9f8}
tbody tr:last-child{border-bottom:1px solid #e5e1dc}
.totals{display:flex;justify-content:flex-end;margin-bottom:32px}.totals-table{width:280px}
.totals-table td{padding:4px 8px}.totals-table .label-cell{font-size:11px;color:#666}
.totals-table .amount-cell{text-align:right;font-size:11px;font-variant-numeric:tabular-nums}
.total-row td{border-top:2px solid #B4A898;padding-top:8px}
.total-row .label-cell{font-size:13px;font-weight:700;color:#1a1a1a}
.total-row .amount-cell{font-size:14px;font-weight:700;color:#1a1a1a}
.notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:40px}
.notes-block p{font-size:10px;color:#555;line-height:1.6;white-space:pre-wrap}
.footer{padding-top:16px;border-top:1px solid #e5e1dc;display:flex;flex-direction:column;gap:4px}
.footer-top{display:flex;justify-content:space-between;align-items:center}
.footer-brand{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#B4A898}
.footer-meta{font-size:9px;color:#aaa}
.footer-chi{font-size:8px;color:#ccc;text-align:center;letter-spacing:.06em}
.print-bar{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100}
.print-bar span{font-size:11px;font-weight:600;letter-spacing:.06em}
.btn-print{background:#B4A898;color:#fff;border:0;padding:7px 18px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:3px}
.btn-print:hover{background:#9A8D7C}
@media print{body{padding-top:0}.page{padding:28px 40px;max-width:none;min-height:auto}.print-bar{display:none!important}}
`

async function buildCertificationPdf(id: string): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient()
  const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', id).single()
  if (error || !quote) return new NextResponse('Presupuesto no encontrado', { status: 404 })

  let client: ClientData | null = null
  let projectCode = ''
  let projectType: string | null = null
  if (quote.client_id) {
    const { data: c } = await supabase.from('clients').select('name,nif_cif,email,phone,address,company_name').eq('id', quote.client_id).single()
    if (c) client = c as ClientData
  }
  if (quote.project_id) {
    const { data: p } = await supabase.from('projects').select('code, name, type').eq('id', quote.project_id).single()
    if (p) { projectCode = `${p.code} — ${p.name}`; projectType = p.type ?? null }
  }

  const division = divisionFor(projectType)
  const items: { description: string; total: number; certified_pct: number; invoiced_pct: number }[] = Array.isArray(quote.items) ? quote.items : []

  const totalBudget = items.reduce((s, it) => s + (it.total || 0), 0)
  const totalCertified = items.reduce((s, it) => s + Math.round((it.total || 0) * ((it.certified_pct || 0) / 100) * 100) / 100, 0)
  const totalInvoiced = items.reduce((s, it) => s + Math.round((it.total || 0) * ((it.invoiced_pct || 0) / 100) * 100) / 100, 0)
  const totalPending = Math.round((totalCertified - totalInvoiced) * 100) / 100
  const certPct = totalBudget > 0 ? Math.round((totalCertified / totalBudget) * 100) : 0

  const itemRows = items.filter((it) => it.description).map((it, i) => {
    const certAmt = Math.round((it.total || 0) * ((it.certified_pct || 0) / 100) * 100) / 100
    const invAmt = Math.round((it.total || 0) * ((it.invoiced_pct || 0) / 100) * 100) / 100
    const pending = Math.round((certAmt - invAmt) * 100) / 100
    const rowBg = it.invoiced_pct >= 100 ? '#f0fdf4' : it.certified_pct > it.invoiced_pct ? '#fffbeb' : (i % 2 === 0 ? '#fff' : '#faf9f8')
    return `<tr style="background:${rowBg}">
      <td class="td-desc">${it.description}</td>
      <td class="td-num">${fmtEur(it.total || 0)}</td>
      <td class="td-center">${it.certified_pct || 0}%</td>
      <td class="td-num">${fmtEur(certAmt)}</td>
      <td class="td-center">${it.invoiced_pct || 0}%</td>
      <td class="td-num">${fmtEur(invAmt)}</td>
      <td class="td-num bold${pending > 0 ? ' pending-positive' : ''}">${fmtEur(pending)}</td>
    </tr>`
  }).join('')

  const divisionCss = division
    ? `.company-division{font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#B4A898;margin-top:2px}`
    : ''

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificación ${quote.number} — Cathedral Group</title>
<style>${PDF_COMMON_CSS}
td.pending-positive{color:#16a34a}
.progress-bar-wrap{background:#e5e7eb;border-radius:4px;height:8px;margin-bottom:24px;overflow:hidden}
.progress-bar-fill{height:8px;border-radius:4px;background:#22c55e}
.progress-label{font-size:11px;color:#555;margin-bottom:6px}
.total-row .amount-cell{color:#16a34a !important}
${divisionCss}
</style></head><body>
<div class="print-bar"><span>Certificación ${quote.number} — Cathedral Group${division ? ' · ' + division : ''}</span><button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button></div>
<div class="page">
  <div class="header">
    <div class="company-block">
      <img src="/img/logo.png" alt="Cathedral Group" class="logo" />
      <div class="company-name">Cathedral Group</div>
      ${division ? `<div class="company-division">${division}</div>` : ''}
      <div class="company-tagline">Reformas y promociones de lujo · Madrid</div>
      <div class="company-detail">Cathedral Group SL · CIF B19761915 · cathedralgroup.es</div>
    </div>
    <div class="doc-block">
      <div class="doc-type">Certificación Parcial</div>
      <div class="doc-number">${quote.number}</div>
      <div class="doc-sub">Presupuesto de referencia</div>
    </div>
  </div>
  <div class="meta">
    ${buildClientBlock(client)}
    <div class="meta-block"><label>Fecha de certificación</label><div class="value">${fmtDate(new Date().toISOString())}</div></div>
    ${projectCode ? `<div class="meta-block"><label>Proyecto</label><div class="value">${projectCode}</div></div>` : '<div class="meta-block"></div>'}
  </div>
  <p class="progress-label"><strong>Avance global certificado: ${certPct}%</strong> — ${fmtEur(Math.round(totalCertified * 100) / 100)} de ${fmtEur(Math.round(totalBudget * 100) / 100)}</p>
  <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${Math.min(certPct, 100)}%"></div></div>
  <p class="section-title">Resumen de certificación por partidas</p>
  <table>
    <thead><tr>
      <th>Descripción</th><th class="th-num">Total presup.</th>
      <th class="th-center">% Cert.</th><th class="th-num">Importe cert.</th>
      <th class="th-center">% Fact.</th><th class="th-num">Importe fact.</th>
      <th class="th-num">Pendiente</th>
    </tr></thead>
    <tbody>${itemRows || '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:16px">Sin partidas</td></tr>'}</tbody>
  </table>
  <div class="totals"><table class="totals-table"><tbody>
    <tr><td class="label-cell">Total presupuesto</td><td class="amount-cell">${fmtEur(Math.round(totalBudget * 100) / 100)}</td></tr>
    <tr><td class="label-cell">Total certificado (${certPct}%)</td><td class="amount-cell">${fmtEur(Math.round(totalCertified * 100) / 100)}</td></tr>
    <tr><td class="label-cell">Total facturado</td><td class="amount-cell">${fmtEur(Math.round(totalInvoiced * 100) / 100)}</td></tr>
    <tr class="total-row"><td class="label-cell">Pendiente de facturar</td><td class="amount-cell">${fmtEur(totalPending)}</td></tr>
  </tbody></table></div>
  <div class="footer">
    <div class="footer-top">
      <span class="footer-brand">Cathedral Group${division ? ' · ' + division : ''}</span>
      <span class="footer-meta">${fmtDate(new Date().toISOString())}</span>
    </div>
    <div class="footer-chi">Cathedral House Investment · CIF B19761915 · cathedralgroup.es · info@cathedralgroup.es</div>
  </div>
</div></body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function buildQuotePdf(id: string): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient()
  const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', id).single()
  if (error || !quote) return new NextResponse('Presupuesto no encontrado', { status: 404 })

  let client: ClientData | null = null
  let projectCode = ''
  let projectType: string | null = null
  if (quote.client_id) {
    const { data: c } = await supabase.from('clients').select('name,nif_cif,email,phone,address,company_name').eq('id', quote.client_id).single()
    if (c) client = c as ClientData
  }
  if (quote.project_id) {
    const { data: p } = await supabase.from('projects').select('code, name, type').eq('id', quote.project_id).single()
    if (p) { projectCode = `${p.code} — ${p.name}`; projectType = p.type ?? null }
  }

  const division = divisionFor(projectType)
  const qualityLabels: Record<string, string> = { estandar: 'Estándar', premium: 'Premium', lujo: 'Lujo' }
  const items: { description: string; quantity: number; unit: string; unit_price: number; vat_pct: number; total: number }[] = Array.isArray(quote.items) ? quote.items : []

  const itemRows = items.filter((it) => it.description).map((it, i) => `
    <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
      <td class="td-desc">${it.description}</td>
      <td class="td-num">${it.quantity}</td>
      <td class="td-center">${it.unit}</td>
      <td class="td-num">${fmtEur(it.unit_price)}</td>
      <td class="td-center">${it.vat_pct}%</td>
      <td class="td-num bold">${fmtEur(it.total)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Presupuesto ${quote.number} — Cathedral Group</title>
<style>${PDF_COMMON_CSS}
.quality-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;border-radius:3px}
.quality-estandar{background:#f0eeec;color:#6b5e52}.quality-premium{background:#dbeafe;color:#1d4ed8}.quality-lujo{background:#fef3c7;color:#92400e}
</style></head><body>
<div class="print-bar"><span>Presupuesto ${quote.number} — Cathedral Group${division ? ' · ' + division : ''}</span><button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button></div>
<div class="page">
  <div class="header">
    <div class="company-block">
      <img src="/img/logo.png" alt="Cathedral Group" class="logo" />
      <div class="company-name">Cathedral Group</div>
      ${division ? `<div class="company-division">${division}</div>` : ''}
      <div class="company-tagline">Reformas y promociones de lujo · Madrid</div>
      <div class="company-detail">Cathedral Group SL · CIF B19761915 · cathedralgroup.es</div>
    </div>
    <div class="doc-block">
      <div class="doc-type">Presupuesto</div>
      <div class="doc-number">${quote.number}</div>
    </div>
  </div>
  <div class="meta">
    ${buildClientBlock(client)}
    <div class="meta-block"><label>Fecha de emisión</label><div class="value">${fmtDate(quote.created_at)}</div></div>
    <div class="meta-block"><label>Válido hasta</label><div class="value">${fmtDate(quote.valid_until)}</div></div>
    ${projectCode ? `<div class="meta-block"><label>Proyecto</label><div class="value">${projectCode}</div></div>` : ''}
    ${quote.quality_level ? `<div class="meta-block"><label>Nivel de calidad</label><div class="value"><span class="quality-badge quality-${quote.quality_level}">${qualityLabels[quote.quality_level] ?? quote.quality_level}</span></div></div>` : ''}
  </div>
  <p class="section-title">Partidas del presupuesto</p>
  <table>
    <thead><tr>
      <th>Descripción</th><th class="th-num">Cant.</th><th class="th-center">Ud.</th>
      <th class="th-num">Precio ud.</th><th class="th-center">IVA</th><th class="th-num">Total</th>
    </tr></thead>
    <tbody>${itemRows || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px">Sin partidas</td></tr>'}</tbody>
  </table>
  <div class="totals"><table class="totals-table"><tbody>
    <tr><td class="label-cell">Base imponible</td><td class="amount-cell">${fmtEur(quote.subtotal ?? 0)}</td></tr>
    <tr><td class="label-cell">IVA</td><td class="amount-cell">${fmtEur(quote.vat_total ?? 0)}</td></tr>
    <tr class="total-row"><td class="label-cell">Total presupuesto</td><td class="amount-cell">${fmtEur(quote.total ?? 0)}</td></tr>
  </tbody></table></div>
  ${(quote.notes || quote.conditions) ? `<div class="notes-grid">
    ${quote.notes ? `<div class="notes-block"><p class="section-title">Notas</p><p>${quote.notes.replace(/\n/g, '<br>')}</p></div>` : ''}
    ${quote.conditions ? `<div class="notes-block"><p class="section-title">Condiciones</p><p>${quote.conditions.replace(/\n/g, '<br>')}</p></div>` : ''}
  </div>` : ''}
  <div class="footer">
    <div class="footer-top">
      <span class="footer-brand">Cathedral Group${division ? ' · ' + division : ''}</span>
      <span class="footer-meta">Presupuesto válido hasta ${fmtDate(quote.valid_until)}</span>
    </div>
    <div class="footer-chi">Cathedral House Investment · CIF B19761915 · cathedralgroup.es · info@cathedralgroup.es</div>
  </div>
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
    const type = request.nextUrl.searchParams.get('type')
    if (type === 'certificacion') return buildCertificationPdf(id)
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

  if (error) {
    console.error(`[PATCH ${table}] id=${id} error:`, error.message, error.details, error.hint)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
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
