/**
 * GET /api/admin/personal/payroll/[id]/print — B10 minimal
 *
 * Devuelve el HTML imprimible de una nómina (formato legal RD 1620/2011).
 * El usuario lo abre en el navegador → Cmd+P / Ctrl+P → "Guardar como PDF".
 *
 * Ventaja: cero dependencias adicionales (puppeteer/wkhtmltopdf), funciona
 * en cualquier navegador, formato editable por CSS.
 *
 * Auth: admin allow-list + AAL2 + role owner/admin/contable/rh.
 *
 * Futuro (B10 completo): añadir generación PDF binaria con @react-pdf/renderer
 * + envío automático por email al trabajador.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { getActiveCompanyId, getCompanyContextFromUser, CATHEDRAL_INVESTMENT_SL_ID } from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

const escHtml = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmtEur = (n: number | null | undefined): string => {
  if (n == null || isNaN(Number(n))) return '0,00'
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return ''
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const MES_NOMBRE = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  // Resolver company activa
  const ctx = getCompanyContextFromUser(user)
  const activeCompanyId =
    getActiveCompanyId(user, request.headers) ??
    ctx?.active_company_id ??
    CATHEDRAL_INVESTMENT_SL_ID

  const supabase = createAdminSupabaseClient()

  // Verificar role
  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', activeCompanyId)
    .is('revoked_at', null)
    .maybeSingle()
  if (!membership || !['owner', 'admin', 'contable', 'rh'].includes(membership.role as string)) {
    return NextResponse.json(
      { error: 'Forbidden: requiere rol owner/admin/contable/rh' },
      { status: 403 },
    )
  }

  // Cargar nómina + empleado + empresa
  const { data: payroll, error: pErr } = await supabase
    .from('payrolls')
    .select('*')
    .eq('id', id)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()
  if (pErr || !payroll) {
    return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 })
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', payroll.employee_id)
    .maybeSingle()

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', activeCompanyId)
    .single()

  // Construir HTML legal
  const periodoLabel = payroll.periodo_mes && payroll.periodo_anio
    ? `${MES_NOMBRE[payroll.periodo_mes]} ${payroll.periodo_anio}`
    : `${fmtDate(payroll.periodo_desde)} - ${fmtDate(payroll.periodo_hasta)}`

  type DevengoRow = [string, number | null | undefined]
  type DeduccionRow = [string, number | null | undefined, number | null | undefined]

  const devengosRaw: DevengoRow[] = [
    ['Salario base', payroll.salario_base],
    ['Complemento de actividad', payroll.plus_actividad],
    ['Complemento extrasalarial', payroll.plus_extrasalarial],
    ['Plus convenio', payroll.plus_convenio],
    ['Antigüedad', payroll.plus_antiguedad],
    ['Nocturnidad', payroll.plus_nocturnidad],
    ['Peligrosidad', payroll.plus_peligrosidad],
    ['Responsabilidad', payroll.plus_responsabilidad],
    ['Incentivos', payroll.incentivos],
    ['Comisiones', payroll.comisiones],
    ['Horas extra normales', payroll.horas_extra_normales],
    ['Horas extra estructurales', payroll.horas_extra_estructurales],
    ['Paga extra prorrateada', payroll.paga_extra_prorrata],
    ['Paga extra completa', payroll.paga_extra_completa],
    ['Vacaciones no disfrutadas', payroll.vacaciones_no_disfrutadas],
    ['Otras percepciones salariales', payroll.otras_percepciones_salariales],
  ]
  const devengos: DevengoRow[] = devengosRaw.filter((r) => r[1] != null && Number(r[1]) !== 0)

  const noSalarialesRaw: DevengoRow[] = [
    ['Dietas', payroll.dietas],
    ['Plus transporte', payroll.plus_transporte],
    ['Kilometraje', payroll.kilometraje],
    ['Indemnizaciones', payroll.indemnizaciones],
    ['Otras percepciones no salariales', payroll.otras_percepciones_no_salariales],
  ]
  const noSalariales: DevengoRow[] = noSalarialesRaw.filter((r) => r[1] != null && Number(r[1]) !== 0)

  const deduccionesRaw: DeduccionRow[] = [
    ['Contingencias comunes', payroll.ss_cont_comunes_pct, payroll.ss_cont_comunes_importe],
    ['Desempleo', payroll.ss_desempleo_pct, payroll.ss_desempleo_importe],
    ['Formación profesional', payroll.ss_formacion_pct, payroll.ss_formacion_importe],
    ['Horas extra fuerza mayor', payroll.ss_horas_extra_fuerza_mayor_pct, payroll.ss_horas_extra_fuerza_mayor_importe],
    ['Horas extra no estructurales', payroll.ss_horas_extra_no_estructurales_pct, payroll.ss_horas_extra_no_estructurales_importe],
    ['Mecanismo equidad intergeneracional', payroll.ss_solidaridad_pct, payroll.ss_solidaridad_importe],
    ['IRPF', payroll.irpf_porcentaje, payroll.irpf_importe],
  ]
  const deducciones: DeduccionRow[] = deduccionesRaw.filter((r) => r[2] != null && Number(r[2]) !== 0)

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Nómina ${escHtml(employee?.nombre ?? '')} ${periodoLabel}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.4; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 14pt; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; color: #5A5550; }
  h2 { font-size: 11pt; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #B4A898; color: #5A5550; }
  .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #5A5550; }
  .header-empresa h1 { font-size: 16pt; }
  .header-empresa p { margin: 2px 0; font-size: 9pt; color: #555; }
  .header-meta { text-align: right; font-size: 9pt; color: #666; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
  .info-box { background: #fafaf8; border: 1px solid #e8e4dd; padding: 10px 12px; border-radius: 4px; }
  .info-box dt { font-weight: bold; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-top: 6px; }
  .info-box dt:first-child { margin-top: 0; }
  .info-box dd { margin: 0 0 4px; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  table th, table td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 9.5pt; }
  table th { background: #f5f3ef; font-weight: bold; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; color: #5A5550; }
  table td.num, table th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table tfoot td { font-weight: bold; border-top: 2px solid #5A5550; background: #fafaf8; }
  .total-final { background: #5A5550; color: white; padding: 14px 20px; border-radius: 6px; margin: 20px 0 16px; font-size: 14pt; display: flex; justify-content: space-between; align-items: center; }
  .total-final span:first-child { text-transform: uppercase; letter-spacing: 1px; }
  .total-final span:last-child { font-size: 18pt; font-weight: bold; }
  .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; padding-top: 20px; }
  .sign-box { border-top: 1px solid #999; padding-top: 8px; font-size: 9pt; color: #666; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 8pt; color: #888; text-align: center; }
  @media print {
    body { padding: 0; max-width: none; }
    .no-print { display: none !important; }
  }
  .no-print { background: #fff8e1; border: 1px solid #ffd54f; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-size: 10pt; }
  .no-print button { background: #5A5550; color: white; border: 0; padding: 8px 16px; cursor: pointer; border-radius: 4px; font-weight: bold; }
</style>
</head>
<body>
<div class="no-print">
  📄 <strong>Nómina lista para imprimir</strong> — Pulsa <kbd>Cmd+P</kbd> (Mac) o <kbd>Ctrl+P</kbd> (Windows) y elige "Guardar como PDF".
  <button onclick="window.print()" style="margin-left:12px;">Imprimir / PDF</button>
</div>

<div class="header">
  <div class="header-empresa">
    <h1>${escHtml(payroll.empresa_nombre || company?.razon_social || '')}</h1>
    <p>CIF: ${escHtml(payroll.empresa_cif || company?.cif || '')}</p>
    <p>${escHtml(payroll.empresa_domicilio || company?.domicilio_fiscal || '')}</p>
    <p>${escHtml([payroll.empresa_cp, payroll.empresa_localidad].filter(Boolean).join(' '))}</p>
    ${payroll.empresa_cuenta_cotizacion_ss ? `<p>CCC: ${escHtml(payroll.empresa_cuenta_cotizacion_ss)}</p>` : ''}
  </div>
  <div class="header-meta">
    <strong style="font-size: 11pt;">RECIBO DE SALARIOS</strong><br>
    Periodo: <strong>${escHtml(periodoLabel)}</strong><br>
    ${payroll.periodo_dias ? `Días: ${payroll.periodo_dias}` : ''} ${payroll.periodo_horas ? `· Horas: ${payroll.periodo_horas}` : ''}
  </div>
</div>

<h2>Datos del trabajador</h2>
<div class="grid-2">
  <div class="info-box">
    <dl>
      <dt>Nombre</dt><dd>${escHtml(payroll.trabajador_nombre || employee?.nombre || '')}</dd>
      <dt>NIF</dt><dd>${escHtml(payroll.trabajador_nif || employee?.nif || '')}</dd>
      <dt>NAF (Nº afiliación SS)</dt><dd>${escHtml(payroll.trabajador_num_afiliacion_ss || employee?.num_afiliacion_ss || '—')}</dd>
    </dl>
  </div>
  <div class="info-box">
    <dl>
      <dt>Categoría</dt><dd>${escHtml(payroll.trabajador_categoria || employee?.categoria_profesional || '—')}</dd>
      <dt>Grupo cotización</dt><dd>${escHtml(payroll.trabajador_grupo_cotizacion || employee?.grupo_cotizacion || '—')}</dd>
      <dt>Antigüedad</dt><dd>${fmtDate(payroll.trabajador_fecha_antiguedad || employee?.fecha_antiguedad)}</dd>
      ${payroll.trabajador_centro ? `<dt>Centro de trabajo</dt><dd>${escHtml(payroll.trabajador_centro)}</dd>` : ''}
    </dl>
  </div>
</div>

<h2>1. Devengos</h2>

${devengos.length > 0 ? `<h3 style="font-size: 9pt; margin: 8px 0 4px; color: #666; text-transform: uppercase;">a) Percepciones salariales</h3>
<table>
  <thead><tr><th>Concepto</th><th class="num">Importe (€)</th></tr></thead>
  <tbody>
    ${devengos.map(([label, val]) => `<tr><td>${escHtml(label)}</td><td class="num">${fmtEur(val)}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

${noSalariales.length > 0 ? `<h3 style="font-size: 9pt; margin: 8px 0 4px; color: #666; text-transform: uppercase;">b) Percepciones no salariales</h3>
<table>
  <thead><tr><th>Concepto</th><th class="num">Importe (€)</th></tr></thead>
  <tbody>
    ${noSalariales.map(([label, val]) => `<tr><td>${escHtml(label)}</td><td class="num">${fmtEur(val)}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

<table style="margin-top: 4px;">
  <tfoot>
    <tr>
      <td>A. TOTAL DEVENGADO</td>
      <td class="num">${fmtEur(payroll.total_devengado)} €</td>
    </tr>
  </tfoot>
</table>

<h2>2. Deducciones</h2>
<table>
  <thead><tr><th>Concepto</th><th class="num">Base (€)</th><th class="num">% Tipo</th><th class="num">Importe (€)</th></tr></thead>
  <tbody>
    ${deducciones.map(([label, pct, importe]) => `<tr>
      <td>${escHtml(label)}</td>
      <td class="num">${label === 'IRPF' ? fmtEur(payroll.irpf_base) : fmtEur(payroll.ss_cont_comunes_base)}</td>
      <td class="num">${pct != null ? Number(pct).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' %' : '—'}</td>
      <td class="num">${fmtEur(importe)}</td>
    </tr>`).join('')}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3">B. TOTAL A DEDUCIR</td>
      <td class="num">${fmtEur(payroll.total_deducciones)} €</td>
    </tr>
  </tfoot>
</table>

<div class="total-final">
  <span>LÍQUIDO TOTAL A PERCIBIR</span>
  <span>${fmtEur(payroll.liquido_a_percibir)} €</span>
</div>

<h2>Determinación de bases de cotización</h2>
<table>
  <thead>
    <tr>
      <th>Concepto</th>
      <th class="num">Base mensual (€)</th>
      <th class="num">Aportación empresa (€)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Contingencias comunes</td>
      <td class="num">${fmtEur(payroll.ss_cont_comunes_base)}</td>
      <td class="num">${fmtEur(payroll.emp_cont_comunes_importe)}</td>
    </tr>
    <tr>
      <td>AT y EP (accidentes / enfermedades profesionales)</td>
      <td class="num">${fmtEur(payroll.ss_cont_comunes_base)}</td>
      <td class="num">${fmtEur(payroll.emp_at_ep_importe)}</td>
    </tr>
    <tr>
      <td>Desempleo</td>
      <td class="num">${fmtEur(payroll.ss_cont_comunes_base)}</td>
      <td class="num">${fmtEur(payroll.emp_desempleo_importe)}</td>
    </tr>
    <tr>
      <td>FOGASA</td>
      <td class="num">${fmtEur(payroll.ss_cont_comunes_base)}</td>
      <td class="num">${fmtEur(payroll.emp_fogasa_importe)}</td>
    </tr>
    <tr>
      <td>Formación profesional</td>
      <td class="num">${fmtEur(payroll.ss_cont_comunes_base)}</td>
      <td class="num">${fmtEur(payroll.emp_formacion_importe)}</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td colspan="2">Total aportación empresa SS</td>
      <td class="num">${fmtEur(payroll.ss_total_empresa)} €</td>
    </tr>
    <tr>
      <td colspan="2">Coste total empresa (bruto + SS)</td>
      <td class="num">${fmtEur(payroll.coste_total_empresa)} €</td>
    </tr>
  </tfoot>
</table>

<div class="signature">
  <div class="sign-box">
    Firma y sello de la empresa<br>
    <em style="color:#999; font-size: 8pt;">${escHtml(payroll.empresa_nombre || company?.razon_social || '')}</em>
  </div>
  <div class="sign-box">
    Recibí del trabajador<br>
    <em style="color:#999; font-size: 8pt;">${escHtml(payroll.trabajador_nombre || employee?.nombre || '')}</em>
  </div>
</div>

<div class="footer">
  Documento generado electrónicamente el ${fmtDate(new Date().toISOString().slice(0,10))} desde el sistema de gestión Cathedral.<br>
  Cumple Real Decreto 1620/2011 — Modelo oficial recibo de salarios.
</div>

</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}

export const dynamic = 'force-dynamic'
