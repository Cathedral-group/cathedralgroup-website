import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface QuoteItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  vat_pct: number
  total: number
}

function formatEur(val: number): string {
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const { id } = await params
  const supabase = createAdminSupabaseClient()

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !quote) {
    return new NextResponse('Presupuesto no encontrado', { status: 404 })
  }

  // Fetch client and project names
  let clientName = ''
  let projectCode = ''
  if (quote.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', quote.client_id)
      .single()
    clientName = client?.name ?? ''
  }
  if (quote.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('code, name')
      .eq('id', quote.project_id)
      .single()
    projectCode = project ? `${project.code} — ${project.name}` : ''
  }

  const qualityLabels: Record<string, string> = {
    estandar: 'Estándar',
    premium: 'Premium',
    lujo: 'Lujo',
  }

  const items: QuoteItem[] = Array.isArray(quote.items) ? quote.items : []

  const itemRows = items
    .filter((it) => it.description)
    .map((it, i) => `
      <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="td-desc">${it.description}</td>
        <td class="td-num">${it.quantity}</td>
        <td class="td-center">${it.unit}</td>
        <td class="td-num">${formatEur(it.unit_price)}</td>
        <td class="td-center">${it.vat_pct}%</td>
        <td class="td-num bold">${formatEur(it.total)}</td>
      </tr>
    `)
    .join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presupuesto ${quote.number} — Cathedral Group</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      background: #fff;
      padding: 0;
    }

    .page {
      max-width: 794px;
      margin: 0 auto;
      padding: 48px 56px;
      min-height: 100vh;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 28px;
      border-bottom: 2px solid #B4A898;
    }

    .company-block {}

    .company-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #1a1a1a;
    }

    .company-tagline {
      font-size: 10px;
      font-weight: 400;
      color: #888;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-top: 3px;
    }

    .doc-block {
      text-align: right;
    }

    .doc-type {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #B4A898;
      margin-bottom: 4px;
    }

    .doc-number {
      font-size: 22px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #1a1a1a;
    }

    /* Meta section */
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }

    .meta-block label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 4px;
    }

    .meta-block .value {
      font-size: 12px;
      font-weight: 500;
      color: #1a1a1a;
    }

    .quality-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 3px;
    }

    .quality-estandar { background: #f0eeec; color: #6b5e52; }
    .quality-premium  { background: #dbeafe; color: #1d4ed8; }
    .quality-lujo     { background: #fef3c7; color: #92400e; }

    /* Items table */
    .section-title {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #B4A898;
      margin-bottom: 10px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    thead tr {
      border-bottom: 1px solid #e5e1dc;
      border-top: 1px solid #e5e1dc;
    }

    th {
      text-align: left;
      padding: 7px 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #999;
    }

    th.th-num, td.td-num { text-align: right; }
    th.th-center, td.td-center { text-align: center; }

    td {
      padding: 7px 8px;
      font-size: 11px;
      color: #2a2a2a;
      vertical-align: top;
    }

    td.td-desc { max-width: 280px; }
    td.bold { font-weight: 600; }

    .row-even { background: #fff; }
    .row-odd  { background: #faf9f8; }

    tbody tr:last-child { border-bottom: 1px solid #e5e1dc; }

    /* Totals */
    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }

    .totals-table {
      width: 260px;
    }

    .totals-table td {
      padding: 4px 8px;
    }

    .totals-table .label-cell {
      font-size: 11px;
      color: #666;
    }

    .totals-table .amount-cell {
      text-align: right;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }

    .total-row td {
      border-top: 2px solid #B4A898;
      padding-top: 8px;
      margin-top: 4px;
    }

    .total-row .label-cell {
      font-size: 13px;
      font-weight: 700;
      color: #1a1a1a;
    }

    .total-row .amount-cell {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
    }

    /* Notes / conditions */
    .notes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 40px;
    }

    .notes-block p {
      font-size: 10px;
      color: #555;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    /* Footer */
    .footer {
      padding-top: 20px;
      border-top: 1px solid #e5e1dc;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-brand {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #B4A898;
    }

    .footer-meta {
      font-size: 9px;
      color: #aaa;
    }

    @media print {
      body { padding: 0; }
      .page { padding: 28px 40px; max-width: none; min-height: auto; }
      .no-print { display: none !important; }
    }

    /* Print button (screen only) */
    .print-bar {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: #1a1a1a;
      color: #fff;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 100;
    }

    .print-bar span {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
    }

    .btn-print {
      background: #B4A898;
      color: #fff;
      border: 0;
      padding: 7px 18px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 3px;
    }

    .btn-print:hover { background: #9A8D7C; }

    @media print {
      .print-bar { display: none !important; }
      body { padding-top: 0 !important; }
    }

    body { padding-top: 48px; }
  </style>
</head>
<body>

  <div class="print-bar no-print">
    <span>Presupuesto ${quote.number} — Cathedral Group</span>
    <button class="btn-print" onclick="window.print()">⬇ Guardar como PDF</button>
  </div>

  <div class="page">

    <!-- HEADER -->
    <div class="header">
      <div class="company-block">
        <div class="company-name">Cathedral Group</div>
        <div class="company-tagline">Reformas de alta calidad · Madrid</div>
      </div>
      <div class="doc-block">
        <div class="doc-type">Presupuesto</div>
        <div class="doc-number">${quote.number}</div>
      </div>
    </div>

    <!-- META -->
    <div class="meta">
      ${clientName ? `<div class="meta-block">
        <label>Cliente</label>
        <div class="value">${clientName}</div>
      </div>` : '<div class="meta-block"></div>'}

      <div class="meta-block">
        <label>Fecha de emisión</label>
        <div class="value">${formatDate(quote.created_at)}</div>
      </div>

      <div class="meta-block">
        <label>Válido hasta</label>
        <div class="value">${formatDate(quote.valid_until)}</div>
      </div>

      ${projectCode ? `<div class="meta-block">
        <label>Proyecto</label>
        <div class="value">${projectCode}</div>
      </div>` : ''}

      ${quote.quality_level ? `<div class="meta-block">
        <label>Nivel de calidad</label>
        <div class="value">
          <span class="quality-badge quality-${quote.quality_level}">${qualityLabels[quote.quality_level] ?? quote.quality_level}</span>
        </div>
      </div>` : ''}
    </div>

    <!-- ITEMS -->
    <p class="section-title">Partidas del presupuesto</p>
    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="th-num">Cant.</th>
          <th class="th-center">Ud.</th>
          <th class="th-num">Precio ud.</th>
          <th class="th-center">IVA</th>
          <th class="th-num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px">Sin partidas</td></tr>'}
      </tbody>
    </table>

    <!-- TOTALS -->
    <div class="totals">
      <table class="totals-table">
        <tbody>
          <tr>
            <td class="label-cell">Base imponible</td>
            <td class="amount-cell">${formatEur(quote.subtotal ?? 0)}</td>
          </tr>
          <tr>
            <td class="label-cell">IVA</td>
            <td class="amount-cell">${formatEur(quote.vat_total ?? 0)}</td>
          </tr>
          <tr class="total-row">
            <td class="label-cell">Total presupuesto</td>
            <td class="amount-cell">${formatEur(quote.total ?? 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- NOTES & CONDITIONS -->
    ${(quote.notes || quote.conditions) ? `
    <div class="notes-grid">
      ${quote.notes ? `<div class="notes-block">
        <p class="section-title">Notas</p>
        <p>${quote.notes.replace(/\n/g, '<br>')}</p>
      </div>` : ''}
      ${quote.conditions ? `<div class="notes-block">
        <p class="section-title">Condiciones</p>
        <p>${quote.conditions.replace(/\n/g, '<br>')}</p>
      </div>` : ''}
    </div>
    ` : ''}

    <!-- FOOTER -->
    <div class="footer">
      <span class="footer-brand">Cathedral Group</span>
      <span class="footer-meta">cathedralhousegroup.com · info@cathedralgroup.es</span>
    </div>

  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
