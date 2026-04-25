import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import QRCode from 'qrcode'

function escapeHtml(text: string | null | undefined): string {
  if (text == null) return ''
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(text).replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Verifica que el request tiene una sesión válida con:
 *   1. Usuario autenticado
 *   2. Email en la allow-list (`lib/auth-allowlist.ts`)
 *   3. MFA verificada en esta sesión (AAL2 — Google Authenticator)
 *
 * Devuelve `null` si CUALQUIER condición falla. La razón concreta NO se devuelve
 * al cliente para no facilitar enumeration. Solo se loggea server-side.
 */
async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null

  // Allow-list de emails: defensa adicional contra usuarios huérfanos
  if (!isAdminEmail(data.user.email)) {
    console.warn('[authCheck] email NOT in allow-list:', data.user.email)
    return null
  }

  // AAL2: el usuario debe haber verificado MFA en esta sesión.
  // Sin esto, una cookie robada permitiría operar la API sin TOTP.
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') {
    console.warn('[authCheck] AAL2 not satisfied:', { user: data.user.email, currentLevel: aal?.currentLevel, nextLevel: aal?.nextLevel })
    return null
  }

  return data.user
}

function auditLog(
  userEmail: string,
  action: 'create' | 'update' | 'delete' | 'restore' | 'permanent_delete' | 'permanent_delete_bulk',
  tableName: string,
  recordId: string | null,
  ip: string,
) {
  const supabase = createAdminSupabaseClient()
  void supabase.from('admin_audit_log').insert({
    user_email: userEmail,
    action,
    table_name: tableName,
    record_id: recordId,
    ip,
  }) // fire-and-forget: never blocks the main request
}

// Resources that support soft delete (deleted_at field)
const SOFT_DELETE_TABLES = new Set(['leads', 'clients', 'suppliers', 'projects', 'invoices', 'quotes', 'flipping_operations', 'mortgages', 'operation_costs', 'documents'])

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
    'flipping-operations': 'flipping_operations',
    mortgages: 'mortgages',
    'operation-costs': 'operation_costs',
    documents: 'documents',
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
    `<div class="value client-name">${escapeHtml(client.company_name || client.name)}</div>`,
    client.nif_cif ? `<div class="client-detail">${escapeHtml(client.nif_cif)}</div>` : '',
    client.address ? `<div class="client-detail">${escapeHtml(client.address)}</div>` : '',
    client.email ? `<div class="client-detail">${escapeHtml(client.email)}</div>` : '',
    client.phone ? `<div class="client-detail">${escapeHtml(client.phone)}</div>` : '',
  ].filter(Boolean).join('')
  return `<div class="meta-block"><label>Cliente</label>${lines}</div>`
}

const PDF_COMMON_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;padding-top:48px}
.page{max-width:860px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}
.header{background:#f5f2ee;padding:26px 56px;display:flex;justify-content:space-between;align-items:center}
.company-identity{display:flex;align-items:center;gap:14px}
.logo{height:28px;width:auto;flex-none}
.company-name{font-size:14px;font-weight:300;letter-spacing:.16em;text-transform:uppercase;color:#1a1a1a}
.company-detail{font-size:9px;color:#6b5e52;margin-top:6px;letter-spacing:.06em;font-weight:500}
.company-address{font-size:9px;color:#6b5e52;margin-top:1px;letter-spacing:.04em}
.company-web{font-size:8px;color:#bbb;margin-top:2px;letter-spacing:.04em}
.bank-section{margin-top:24px;padding:16px 18px;background:#f5f2ee;border-left:3px solid #B4A898}
.bank-section .section-title{margin-bottom:10px}
.bank-row{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid #e8e4e0}
.bank-row:last-of-type{border-bottom:none}
.bank-name{font-size:10px;font-weight:600;color:#1a1a1a}
.bank-iban{font-size:10px;font-family:monospace;color:#3a3a3a;letter-spacing:.04em}
.bank-beneficiary{font-size:9px;color:#6b5e52;margin-top:8px;font-style:italic}
.doc-block{text-align:right}
.doc-type{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#B4A898;margin-bottom:4px}
.doc-number{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.doc-sub{font-size:10px;color:#888;margin-top:4px}
.content{padding:32px 56px;flex:1}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #ece9e5}
.meta-block label{display:block;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#B4A898;margin-bottom:4px}
.meta-block .value{font-size:12px;font-weight:400;color:#1a1a1a}
.meta-block .client-name{font-size:13px;font-weight:600}
.meta-block .client-detail{font-size:10px;color:#666;margin-top:1px}
.section-title{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#B4A898;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
thead tr{background:#f5f2ee}
th{text-align:left;padding:8px 10px;font-size:9px;font-weight:600;letter-spacing:.10em;text-transform:uppercase;color:#6b5e52}
th.th-num,td.td-num{text-align:right}th.th-center,td.td-center{text-align:center}
td{padding:8px 10px;font-size:11px;color:#2a2a2a;vertical-align:top;border-bottom:1px solid #f0ede9}
td.td-desc{word-wrap:break-word;overflow-wrap:break-word;white-space:normal}
td.bold{font-weight:600}
.row-even,.row-odd{background:#fff}
.totals{display:flex;justify-content:flex-end;margin-bottom:28px}.totals-table{width:260px}
.totals-table td{padding:5px 10px;border-bottom:none}.totals-table .label-cell{font-size:11px;color:#666}
.totals-table .amount-cell{text-align:right;font-size:11px;font-variant-numeric:tabular-nums}
.total-row td{border-top:1px solid #B4A898;padding-top:10px;padding-bottom:10px;background:#f5f2ee}
.total-row .label-cell{font-size:12px;font-weight:600;color:#1a1a1a}
.total-row .amount-cell{font-size:13px;font-weight:700;color:#1a1a1a}
.notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
.notes-block p{font-size:8.5px;color:#777;line-height:1.7;white-space:pre-wrap}
.conditions-page{page-break-before:always;break-before:page;padding:32px 56px 48px;margin-top:48px;border-top:2px solid #e8e4e0}
.conditions-page .section-title{margin-bottom:16px}
@media print{.conditions-page{margin-top:0;border-top:none;padding:48px 56px}}
.footer{background:#f5f2ee;padding:14px 56px;display:flex;justify-content:space-between;align-items:center;margin-top:auto}
.footer-brand{font-size:9px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:#6b5e52}
.footer-meta{font-size:9px;color:#999;letter-spacing:.04em}
.vat-note{font-size:9px;color:#9b8f84;margin-top:16px;font-style:italic}
.print-bar{position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100}
.print-bar span{font-size:11px;font-weight:600;letter-spacing:.06em}
.btn-print{background:#B4A898;color:#fff;border:0;padding:7px 18px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
@media print{body{padding-top:0}.print-bar{display:none!important}}
`

async function buildCertificationPdf(id: string, certNumber?: number): Promise<NextResponse> {
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

  // QR code for client portal (same token as the quote)
  const certPortalToken = quote.portal_token as string | undefined
  const certPortalUrl = certPortalToken ? `https://cathedralgroup.es/portal/${certPortalToken}` : null
  const certQrDataUrl = certPortalUrl
    ? await QRCode.toDataURL(certPortalUrl, { width: 96, margin: 1, color: { dark: '#6b5e52', light: '#ffffff' } })
    : null

  let items: { description: string; total: number; certified_pct: number; invoiced_pct: number }[]
  if (certNumber) {
    const phases: { number: number; items: typeof items; total_certified: number }[] = Array.isArray(quote.certifications) ? quote.certifications : []
    const phase = phases.find((p) => p.number === certNumber)
    if (!phase) return new NextResponse('Certificación no encontrada', { status: 404 })
    items = phase.items ?? []
  } else {
    items = Array.isArray(quote.items) ? quote.items : []
  }

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
      <td class="td-desc">${escapeHtml(it.description)}</td>
      <td class="td-num">${fmtEur(it.total || 0)}</td>
      <td class="td-center">${it.certified_pct || 0}%</td>
      <td class="td-num">${fmtEur(certAmt)}</td>
      <td class="td-center">${it.invoiced_pct || 0}%</td>
      <td class="td-num">${fmtEur(invAmt)}</td>
      <td class="td-num bold${pending > 0 ? ' pending-positive' : ''}">${fmtEur(pending)}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificación ${certNumber ?? ''} — ${quote.number} — Cathedral Group</title>
<style>${PDF_COMMON_CSS}
td.pending-positive{color:#16a34a}
.progress-bar-wrap{background:#e5e7eb;border-radius:4px;height:8px;margin-bottom:24px;overflow:hidden}
.progress-bar-fill{height:8px;border-radius:4px;background:#22c55e}
.progress-label{font-size:11px;color:#555;margin-bottom:6px}
.total-row .amount-cell{color:#16a34a !important}
.qr-section{display:flex;align-items:center;gap:14px;margin-top:28px;padding:14px 16px;border:1px solid #e8e4e0;border-radius:4px;background:#faf9f8}
.qr-img{width:72px;height:72px;flex-shrink:0;display:block}
.qr-label{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b5e52;margin-bottom:3px}
.qr-hint{font-size:9px;color:#9b8f84;margin-bottom:4px}
.qr-url{font-size:8px;color:#B4A898;word-break:break-all}
</style></head><body>
<div class="print-bar"><span>Certificación ${certNumber ?? ''} — ${quote.number} — Cathedral Group${division ? ' · ' + division : ''}</span><button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button></div>
<div class="page">
  <div class="header">
    <div>
      <div class="company-identity">
        <img src="/img/logo.png" alt="Cathedral Group" class="logo" />
        <div class="company-name">Cathedral Group${division ? ` · ${division}` : ''}</div>
      </div>
      <div class="company-detail">Cathedral House Investment S.L. · CIF B19761915</div>
      <div class="company-address">Pº Castellana 40, 8º · 28046 Madrid</div>
      <div class="company-web">cathedralgroup.es · administracion@cathedralgroup.es</div>
    </div>
    <div class="doc-block">
      <div class="doc-type">${certNumber ? `Certificación ${certNumber}` : 'Certificación Parcial'}</div>
      <div class="doc-number">${quote.number}</div>
      <div class="doc-sub">Presupuesto de referencia</div>
    </div>
  </div>
  <div class="content">
    <div class="meta">
      ${buildClientBlock(client)}
      <div class="meta-block"><label>Fecha de certificación</label><div class="value">${fmtDate(new Date().toISOString())}</div></div>
      ${projectCode ? `<div class="meta-block"><label>Proyecto</label><div class="value">${escapeHtml(projectCode)}</div></div>` : '<div class="meta-block"></div>'}
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
    <p class="vat-note">* Los importes indicados no incluyen IVA.</p>
    ${certQrDataUrl ? `<div class="qr-section">
      <img src="${certQrDataUrl}" class="qr-img" alt="QR Área de cliente" />
      <div>
        <p class="qr-label">Área de cliente</p>
        <p class="qr-hint">Escanea para ver y descargar tus documentos en cualquier momento</p>
        <p class="qr-url">${certPortalUrl}</p>
      </div>
    </div>` : ''}
  </div>
  <div class="footer">
    <span class="footer-brand">Cathedral House Investment SL</span>
    <span class="footer-meta">Pº Castellana 40, 8º · 28046 Madrid · CIF B19761915</span>
  </div>
</div></body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function buildInvoicePdf(id: string): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient()
  const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (error || !inv) return new NextResponse('Factura no encontrada', { status: 404 })

  // Try to get client info via project
  let client: ClientData | null = null
  let projectType: string | null = null
  let projectId: string | null = null
  if (inv.proyecto_code) {
    const { data: proj } = await supabase.from('projects').select('id, type, client_id').eq('code', inv.proyecto_code).single()
    if (proj) {
      projectType = proj.type ?? null
      projectId = proj.id ?? null
      if (proj.client_id) {
        const { data: c } = await supabase.from('clients').select('name,nif_cif,email,phone,address,company_name').eq('id', proj.client_id).single()
        if (c) client = c as ClientData
      }
    }
  }

  // QR code via project's quote portal_token
  let invQrDataUrl: string | null = null
  let invPortalUrl: string | null = null
  if (projectId) {
    const { data: q } = await supabase.from('quotes').select('portal_token').eq('project_id', projectId).not('portal_token', 'is', null).order('created_at', { ascending: false }).limit(1).single()
    if (q?.portal_token) {
      invPortalUrl = `https://cathedralgroup.es/portal/${q.portal_token}`
      invQrDataUrl = await QRCode.toDataURL(invPortalUrl, { width: 96, margin: 1, color: { dark: '#6b5e52', light: '#ffffff' } })
    }
  }

  // For recibida invoices, get supplier info as the "other party"
  let supplierName = ''
  let supplierNif = ''
  if (inv.direction === 'recibida' && inv.supplier_nif) {
    const { data: sup } = await supabase.from('suppliers').select('name, nif').eq('nif', inv.supplier_nif).single()
    if (sup) { supplierName = sup.name; supplierNif = sup.nif }
  }

  const division = divisionFor(projectType)

  const docTypeLabels: Record<string, string> = {
    factura: 'Factura', proforma: 'Proforma', rectificativa: 'Factura Rectificativa',
    abono: 'Abono', otro: 'Documento',
  }
  const docTypeLabel = docTypeLabels[inv.doc_type ?? 'factura'] ?? 'Factura'
  const isEmitida = inv.direction === 'emitida'

  const paymentStatusLabels: Record<string, string> = {
    pendiente: 'Pendiente', pagada: 'Pagada', vencida: 'Vencida', parcial: 'Pago parcial', cancelada: 'Cancelada',
  }
  const paymentStatusColors: Record<string, string> = {
    pendiente: '#f59e0b', pagada: '#16a34a', vencida: '#dc2626', parcial: '#3b82f6', cancelada: '#9ca3af',
  }
  const statusLabel = paymentStatusLabels[inv.payment_status ?? 'pendiente'] ?? 'Pendiente'
  const statusColor = paymentStatusColors[inv.payment_status ?? 'pendiente'] ?? '#f59e0b'

  const base = inv.amount_base ?? inv.subtotal ?? 0
  const vatAmt = inv.vat_amount ?? inv.vat_total ?? 0
  const irpfAmt = inv.irpf_amount ?? 0
  const total = inv.amount_total ?? inv.total ?? 0
  const vatPct = inv.vat_pct ?? inv.vat_rate ?? 21
  const irpfRate = inv.irpf_rate ?? 0

  // Other party block (client for emitida, supplier for recibida)
  let partyBlock = ''
  if (isEmitida && client) {
    partyBlock = buildClientBlock(client)
  } else if (!isEmitida && supplierName) {
    partyBlock = `<div class="meta-block"><label>Proveedor</label>
      <div class="value client-name">${escapeHtml(supplierName)}</div>
      ${supplierNif ? `<div class="client-detail">${escapeHtml(supplierNif)}</div>` : ''}
    </div>`
  } else {
    partyBlock = '<div class="meta-block"></div>'
  }

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docTypeLabel} ${inv.number ?? ''} — Cathedral Group</title>
<style>${PDF_COMMON_CSS}
.status-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:3px 8px;border-radius:3px;color:#fff;margin-top:6px}
.concept-row td{font-size:13px;font-weight:500;color:#1a1a1a;padding:16px 10px}
.qr-section{display:flex;align-items:center;gap:14px;margin-top:28px;padding:14px 16px;border:1px solid #e8e4e0;border-radius:4px;background:#faf9f8}
.qr-img{width:72px;height:72px;flex-shrink:0;display:block}
.qr-label{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b5e52;margin-bottom:3px}
.qr-hint{font-size:9px;color:#9b8f84;margin-bottom:4px}
.qr-url{font-size:8px;color:#B4A898;word-break:break-all}
</style></head><body>
<div class="print-bar"><span>${docTypeLabel} ${inv.number ?? ''} — Cathedral Group${division ? ' · ' + division : ''}</span><button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button></div>
<div class="page">
  <div class="header">
    <div>
      <div class="company-identity">
        <img src="/img/logo.png" alt="Cathedral Group" class="logo" />
        <div class="company-name">Cathedral Group${division ? ` · ${division}` : ''}</div>
      </div>
      <div class="company-detail">Cathedral House Investment S.L. · CIF B19761915</div>
      <div class="company-address">Pº Castellana 40, 8º · 28046 Madrid</div>
      <div class="company-web">cathedralgroup.es · administracion@cathedralgroup.es</div>
    </div>
    <div class="doc-block">
      <div class="doc-type">${isEmitida ? docTypeLabel : `${docTypeLabel} recibida`}</div>
      <div class="doc-number">${inv.number ?? '—'}</div>
      <div class="doc-sub">Emitida el ${fmtDate(inv.issue_date)}</div>
      <div class="status-badge" style="background:${statusColor}">${statusLabel}</div>
    </div>
  </div>
  <div class="content">
    <div class="meta">
      ${partyBlock}
      <div class="meta-block">
        <label>Fecha de emisión</label><div class="value">${fmtDate(inv.issue_date)}</div>
        ${inv.due_date ? `<label style="margin-top:10px;display:block">Vencimiento</label><div class="value">${fmtDate(inv.due_date)}</div>` : ''}
        ${inv.payment_date ? `<label style="margin-top:10px;display:block">Fecha de pago</label><div class="value">${fmtDate(inv.payment_date)}</div>` : ''}
      </div>
      <div class="meta-block">
        ${inv.proyecto_code ? `<label>Proyecto</label><div class="value">${escapeHtml(inv.proyecto_code)}</div>` : ''}
        ${inv.payment_method ? `<label style="margin-top:10px;display:block">Forma de pago</label><div class="value">${escapeHtml(inv.payment_method)}</div>` : ''}
      </div>
    </div>
    <p class="section-title">Concepto</p>
    <table>
      <thead><tr>
        <th>Descripción</th><th class="th-center">IVA</th><th class="th-num">Base imponible</th>
      </tr></thead>
      <tbody>
        <tr class="concept-row">
          <td class="td-desc">${escapeHtml(inv.concept) || '—'}</td>
          <td class="td-center">${vatPct}%</td>
          <td class="td-num bold">${fmtEur(base)}</td>
        </tr>
      </tbody>
    </table>
    <div class="totals"><table class="totals-table"><tbody>
      <tr><td class="label-cell">Base imponible</td><td class="amount-cell">${fmtEur(base)}</td></tr>
      <tr><td class="label-cell">IVA (${vatPct}%)</td><td class="amount-cell">${fmtEur(vatAmt)}</td></tr>
      ${irpfRate > 0 ? `<tr><td class="label-cell">IRPF (${irpfRate}%)</td><td class="amount-cell" style="color:#dc2626">−${fmtEur(irpfAmt)}</td></tr>` : ''}
      <tr class="total-row"><td class="label-cell">Total</td><td class="amount-cell">${fmtEur(total)}</td></tr>
    </tbody></table></div>
    ${inv.notes ? `<div class="notes-grid"><div class="notes-block"><p class="section-title">Notas</p><p>${escapeHtml(inv.notes).replace(/\n/g, '<br>')}</p></div></div>` : ''}
    ${isEmitida ? `<div class="bank-section">
      <p class="section-title">Datos de pago</p>
      <div class="bank-row">
        <span class="bank-name">Banco Sabadell</span>
        <span class="bank-iban">ES90 0081 1539 8900 0169 3570</span>
      </div>
      <div class="bank-row">
        <span class="bank-name">Eurocaja Rural</span>
        <span class="bank-iban">ES44 3081 0453 9250 0066 1445</span>
      </div>
      <p class="bank-beneficiary">Beneficiario: Cathedral House Investment S.L.</p>
    </div>` : ''}
    ${invQrDataUrl ? `<div class="qr-section">
      <img src="${invQrDataUrl}" class="qr-img" alt="QR Área de cliente" />
      <div>
        <p class="qr-label">Área de cliente</p>
        <p class="qr-hint">Escanea para ver y descargar tus documentos en cualquier momento</p>
        <p class="qr-url">${invPortalUrl}</p>
      </div>
    </div>` : ''}
  </div>
  <div class="footer">
    <span class="footer-brand">Cathedral House Investment SL</span>
    <span class="footer-meta">Pº Castellana 40, 8º · 28046 Madrid · CIF B19761915</span>
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
  const items: { description: string; quantity: number; unit: string; unit_price: number; vat_pct: number; total: number; chapter_code?: string; chapter_name?: string; notes?: string }[] = Array.isArray(quote.items) ? quote.items : []

  // QR code for client portal
  const portalToken = quote.portal_token as string | undefined
  const portalUrl = portalToken ? `https://cathedralgroup.es/portal/${portalToken}` : null
  const qrDataUrl = portalUrl
    ? await QRCode.toDataURL(portalUrl, { width: 96, margin: 1, color: { dark: '#6b5e52', light: '#ffffff' } })
    : null

  // Build sequential chapter numbering
  const chapterOrder: string[] = []
  const chapterTotals: Record<string, number> = {}
  items.filter((it) => it.description).forEach((it) => {
    const code = it.chapter_code ?? ''
    if (code && !chapterOrder.includes(code)) chapterOrder.push(code)
    if (code) chapterTotals[code] = (chapterTotals[code] || 0) + (it.total || 0)
  })
  const chapterSeq: Record<string, string> = {}
  chapterOrder.forEach((code, i) => { chapterSeq[code] = String(i + 1).padStart(2, '0') })

  // Sort items: group by chapter_code preserving first-appearance order; no-chapter items last
  const filtered = items.filter((it) => it.description).sort((a, b) => {
    const ai = a.chapter_code ? chapterOrder.indexOf(a.chapter_code) : Infinity
    const bi = b.chapter_code ? chapterOrder.indexOf(b.chapter_code) : Infinity
    return ai - bi
  })
  let lastChapterCode: string | undefined = undefined
  const itemRows = filtered.flatMap((it, i) => {
    const showHeader = !!(it.chapter_code && it.chapter_code !== lastChapterCode)
    if (it.chapter_code) lastChapterCode = it.chapter_code
    const nextWithChapter = filtered.slice(i + 1).find((x) => x.chapter_code)
    const showSubtotal = !!(it.chapter_code && nextWithChapter?.chapter_code !== it.chapter_code)
    const rows: string[] = []
    if (showHeader) {
      rows.push(`<tr class="chapter-header"><td colspan="5">${escapeHtml(String(chapterSeq[it.chapter_code!]))} — ${escapeHtml(it.chapter_name ?? it.chapter_code)}</td></tr>`)
    }
    rows.push(`<tr>
      <td class="td-desc">${escapeHtml(it.description)}${it.notes ? `<br><span style="font-size:8px;color:#9b8f84;font-style:italic">${escapeHtml(it.notes)}</span>` : ''}</td>
      <td class="td-num">${escapeHtml(String(it.quantity))}</td>
      <td class="td-center">${escapeHtml(it.unit)}</td>
      <td class="td-num">${fmtEur(it.unit_price)}</td>
      <td class="td-num bold">${fmtEur(it.total)}</td>
    </tr>`)
    if (showSubtotal) {
      const chTotal = chapterTotals[it.chapter_code!] ?? 0
      rows.push(`<tr class="chapter-subtotal"><td colspan="4" class="subtotal-label">Subtotal</td><td class="td-num subtotal-amount">${fmtEur(chTotal)}</td></tr>`)
    }
    return rows
  })
  const itemRowsHtml = itemRows.join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Presupuesto ${quote.number} — Cathedral Group</title>
<style>${PDF_COMMON_CSS}
.quality-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;border-radius:3px}
.quality-estandar{background:#f0eeec;color:#6b5e52}.quality-premium{background:#dbeafe;color:#1d4ed8}.quality-lujo{background:#fef3c7;color:#92400e}
.chapter-header td{background:#f5f2ee;padding:10px 10px 8px;font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#6b5e52;border-top:1px solid #ddd9d4;border-bottom:none}
.chapter-subtotal td{background:#fff;border-top:2px solid #B4A898;border-bottom:none;padding:8px 10px}
.subtotal-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#B4A898}
.subtotal-amount{font-size:12px;font-weight:700;color:#1a1a1a}
.qr-section{display:flex;align-items:center;gap:14px;margin-top:28px;padding:14px 16px;border:1px solid #e8e4e0;border-radius:4px;background:#faf9f8}
.qr-img{width:72px;height:72px;flex-shrink:0;display:block}
.qr-label{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b5e52;margin-bottom:3px}
.qr-hint{font-size:9px;color:#9b8f84;margin-bottom:4px}
.qr-url{font-size:8px;color:#B4A898;word-break:break-all}
</style></head><body>
<div class="print-bar"><span>Presupuesto ${quote.number} — Cathedral Group${division ? ' · ' + division : ''}</span><button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button></div>
<div class="page">
  <div class="header">
    <div>
      <div class="company-identity">
        <img src="/img/logo.png" alt="Cathedral Group" class="logo" />
        <div class="company-name">Cathedral Group${division ? ` · ${division}` : ''}</div>
      </div>
      <div class="company-detail">Cathedral House Investment S.L. · CIF B19761915</div>
      <div class="company-address">Pº Castellana 40, 8º · 28046 Madrid</div>
      <div class="company-web">cathedralgroup.es · administracion@cathedralgroup.es</div>
    </div>
    <div class="doc-block">
      <div class="doc-type">Presupuesto</div>
      <div class="doc-number">${quote.number}</div>
    </div>
  </div>
  <div class="content">
    <div class="meta">
      ${buildClientBlock(client)}
      <div class="meta-block"><label>Fecha de emisión</label><div class="value">${fmtDate(quote.created_at)}</div></div>
      <div class="meta-block"><label>Válido hasta</label><div class="value">${fmtDate(quote.valid_until)}</div></div>
      ${projectCode ? `<div class="meta-block"><label>Proyecto</label><div class="value">${escapeHtml(projectCode)}</div></div>` : ''}
    </div>
    <p class="section-title">Partidas del presupuesto</p>
    <table>
      <thead><tr>
        <th>Descripción</th><th class="th-num">Cant.</th><th class="th-center">Ud.</th>
        <th class="th-num">Precio ud.</th><th class="th-num">Total</th>
      </tr></thead>
      <tbody>${itemRowsHtml || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:16px">Sin partidas</td></tr>'}</tbody>
    </table>
    <div class="totals"><table class="totals-table"><tbody>
      <tr class="total-row"><td class="label-cell">Total presupuesto</td><td class="amount-cell">${fmtEur(quote.subtotal ?? 0)}</td></tr>
    </tbody></table></div>
    <p class="vat-note">* Los importes indicados en este presupuesto no incluyen IVA.</p>
    ${quote.notes ? `<div class="notes-grid"><div class="notes-block"><p class="section-title">Notas</p><p>${escapeHtml(quote.notes).replace(/\n/g, '<br>')}</p></div></div>` : ''}
    ${qrDataUrl ? `<div class="qr-section">
      <img src="${qrDataUrl}" class="qr-img" alt="QR Área de cliente" />
      <div>
        <p class="qr-label">Área de cliente</p>
        <p class="qr-hint">Escanea para ver y descargar tus documentos en cualquier momento</p>
        <p class="qr-url">${portalUrl}</p>
      </div>
    </div>` : ''}
  </div>
  ${quote.conditions ? `<div class="conditions-page">
    <p class="section-title">Condiciones generales</p>
    <p class="notes-block" style="font-size:8.5px;color:#777;line-height:1.7;white-space:pre-wrap">${escapeHtml(quote.conditions).replace(/\n/g, '<br>')}</p>
  </div>` : ''}
  <div class="footer">
    <span class="footer-brand">Cathedral House Investment SL</span>
    <span class="footer-meta">Pº Castellana 40, 8º · 28046 Madrid · CIF B19761915</span>
  </div>
</div></body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const { resource } = await ctx.params

  // presupuesto-pdf: session auth OR portal_token (public access)
  if (resource === 'presupuesto-pdf') {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const portalToken = request.nextUrl.searchParams.get('portal_token')
    if (portalToken) {
      // Verify token matches this quote AND hasn't expired (lifecycle-based, see migration
      // 20260425190000_portal_token_expiry.sql). No session required for portal access.
      const supabase = createAdminSupabaseClient()
      const { data: q } = await supabase
        .from('quotes')
        .select('portal_token, portal_token_expires_at')
        .eq('id', id)
        .single()
      if (!q || q.portal_token !== portalToken) {
        return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
      }
      if (q.portal_token_expires_at && new Date(q.portal_token_expires_at) < new Date()) {
        return NextResponse.json({ error: 'Enlace expirado' }, { status: 410 })
      }
    } else {
      const user = await authCheck()
      if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const type = request.nextUrl.searchParams.get('type')
    if (type === 'certificacion') {
      const certParam = request.nextUrl.searchParams.get('cert')
      const certNumber = certParam ? parseInt(certParam, 10) : undefined
      return buildCertificationPdf(id, certNumber)
    }
    return buildQuotePdf(id)
  }

  // next-number: returns next consecutive document number for a series
  if (resource === 'next-number') {
    const user = await authCheck()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const type = request.nextUrl.searchParams.get('type') // quote | invoice | certification
    const year = new Date().getFullYear()
    const supabase = createAdminSupabaseClient()
    const prefix = type === 'quote' ? 'P' : type === 'invoice' ? 'F' : 'C'
    const pattern = `${prefix}-${year}-%`
    const table = type === 'invoice' ? 'invoices' : 'quotes'
    const { data } = await supabase.from(table).select('number').like('number', pattern).order('number', { ascending: false }).limit(1)
    let nextNum = 1
    if (data && data.length > 0) {
      const parts = (data[0].number as string).split('-')
      const last = parseInt(parts[2] || '0', 10)
      if (!isNaN(last)) nextNum = last + 1
    }
    const number = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`
    return NextResponse.json({ number })
  }

  // factura-pdf: admin session required
  if (resource === 'factura-pdf') {
    const user = await authCheck()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    return buildInvoicePdf(id)
  }

  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createAdminSupabaseClient()

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

  // Single-record fetch by id (for any table)
  const id = request.nextUrl.searchParams.get('id')
  if (id) {
    let query = supabase.from(table).select('*').eq('id', id)
    if (SOFT_DELETE_TABLES.has(table)) query = query.is('deleted_at', null)
    const { data, error } = await query.single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ data })
  }

  // Fetch project by code (used by invoice form to pre-fill client contact)
  const code = request.nextUrl.searchParams.get('code')
  if (code && resource === 'projects') {
    let query = supabase.from(table).select('*').eq('code', code)
    if (SOFT_DELETE_TABLES.has(table)) query = query.is('deleted_at', null)
    const { data, error } = await query.single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
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

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const body = await request.json()
  const supabase = createAdminSupabaseClient()

  // Upsert support: if _upsert_on_conflict is set, use upsert with ignoreDuplicates
  if (body._upsert_on_conflict) {
    const { _upsert_on_conflict, ...payload } = body
    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: _upsert_on_conflict, ignoreDuplicates: true })
      .select()
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    auditLog(user.email ?? user.id, 'create', table, (data as Record<string, unknown>)?.id as string ?? null, ip)
    return NextResponse.json({ data })
  }

  const { data, error } = await supabase.from(table).insert(body).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  auditLog(user.email ?? user.id, 'create', table, (data as Record<string, unknown>)?.id as string ?? null, ip)
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // Papelera: restore item (set deleted_at = null)
  if (resource === 'papelera') {
    const { id, table } = await request.json()
    if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })
    if (!SOFT_DELETE_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    auditLog(user.email ?? user.id, 'restore', table, id, ip)
    return NextResponse.json({ ok: true })
  }

  const table = tableFor(resource)
  if (!table) return NextResponse.json({ error: 'Ruta no válida' }, { status: 404 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  // Verbose logging only in dev — production logs solo errores
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[PATCH ${table}] id=${id} keys=${Object.keys(updates).join(',')}`)
  }

  const supabase = createAdminSupabaseClient()
  const payload = resource === 'quality-coefficients'
    ? { ...updates, updated_at: new Date().toISOString() }
    : updates
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()

  if (error) {
    // Loggear server-side con detalle completo (Vercel logs), devolver mensaje genérico al cliente
    console.error(`[PATCH ${table}] id=${id} error:`, error.message, error.details, error.hint, 'code:', error.code)
    return NextResponse.json({ error: 'Error al actualizar el registro' }, { status: 500 })
  }
  auditLog(user.email ?? user.id, 'update', table, id, ip)
  return NextResponse.json({ ok: true, data })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { resource } = await ctx.params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // Papelera: permanent delete (single or bulk).
  // CRÍTICO: solo se permite borrar registros previamente soft-deleted (deleted_at IS NOT NULL).
  // Esto evita que un atacante con sesión válida borre registros activos vía /api/db/papelera.
  if (resource === 'papelera') {
    const body = await request.json()
    const supabase = createAdminSupabaseClient()

    // Bulk delete: { items: [{id, table}] }
    if (Array.isArray(body.items)) {
      const grouped: Record<string, string[]> = {}
      for (const item of body.items) {
        if (!item.id || !item.table || !SOFT_DELETE_TABLES.has(item.table)) continue
        if (!grouped[item.table]) grouped[item.table] = []
        grouped[item.table].push(item.id)
      }
      let totalDeleted = 0
      for (const [tbl, ids] of Object.entries(grouped)) {
        // Solo borrar permanentemente registros que YA estén en papelera
        const { error, count } = await supabase
          .from(tbl)
          .delete({ count: 'exact' })
          .in('id', ids)
          .not('deleted_at', 'is', null)
        if (error) {
          console.error(`[DELETE papelera bulk ${tbl}]`, error.message, error.details)
          return NextResponse.json({ error: 'Error al vaciar papelera' }, { status: 500 })
        }
        totalDeleted += count ?? 0
        auditLog(user.email ?? user.id, 'permanent_delete_bulk', tbl, ids.join(','), ip)
      }
      return NextResponse.json({ ok: true, deleted: totalDeleted })
    }

    // Single delete: { id, table }
    const { id, table } = body
    if (!id || !table) return NextResponse.json({ error: 'ID y tabla requeridos' }, { status: 400 })
    if (!SOFT_DELETE_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', id)
      .not('deleted_at', 'is', null)
    if (error) {
      console.error(`[DELETE papelera single ${table}]`, error.message, error.details)
      return NextResponse.json({ error: 'Error al eliminar el registro' }, { status: 500 })
    }
    if (count === 0) {
      return NextResponse.json({ error: 'El registro no está en la papelera' }, { status: 400 })
    }
    auditLog(user.email ?? user.id, 'permanent_delete', table, id, ip)
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

  auditLog(user.email ?? user.id, 'delete', table, id, ip)
  return NextResponse.json({ ok: true })
}
