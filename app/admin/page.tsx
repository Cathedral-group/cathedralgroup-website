import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import CashFlowBar from '@/components/admin/CashFlowBar'
import QuickAddButton from '@/components/admin/QuickAddButton'
import PeriodSelector from '@/components/admin/PeriodSelector'
import DashboardCharts from './DashboardCharts'

function formatEUR(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '0,00 \u20ac'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  const d = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00'
  return new Date(d).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  if (isNaN(target.getTime())) return 999
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function dueDateColor(days: number): string {
  if (days < 7) return 'text-red-600'
  if (days <= 15) return 'text-amber-600'
  return 'text-green-600'
}

function dueDateBg(days: number): string {
  if (days < 7) return 'bg-red-50'
  if (days <= 15) return 'bg-amber-50'
  return 'bg-green-50'
}

function marginColor(margin: number | null | undefined): string {
  if (margin == null || isNaN(margin)) return 'text-neutral-400'
  if (margin >= 20) return 'text-green-600'
  if (margin >= 10) return 'text-amber-600'
  return 'text-red-600'
}

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function periodRange(year: number, quarter: number | null, month: number | null) {
  if (month) {
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    return { start, end }
  }
  if (quarter) {
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = quarter * 3
    const lastDay = new Date(year, endMonth, 0).getDate()
    return {
      start: `${year}-${String(startMonth).padStart(2,'0')}-01`,
      end: `${year}-${String(endMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
    }
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

function buildMonthlyMap(year: number, quarter: number | null, month: number | null) {
  const map: Record<string, { ingresos: number; gastos: number }> = {}
  if (month) {
    const key = `${year}-${String(month).padStart(2,'0')}`
    map[key] = { ingresos: 0, gastos: 0 }
  } else if (quarter) {
    for (let m = (quarter - 1) * 3 + 1; m <= quarter * 3; m++) {
      map[`${year}-${String(m).padStart(2,'0')}`] = { ingresos: 0, gastos: 0 }
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      map[`${year}-${String(m).padStart(2,'0')}`] = { ingresos: 0, gastos: 0 }
    }
  }
  return map
}

// Doc types that represent real monetary transactions (exclude presupuesto, contrato, albaran, escritura, etc.)
const FINANCIAL_DOC_TYPES = ['factura','ticket','proforma','certificado','rectificativa','abono','nomina','modelo_fiscal','seguro','justificante_pago'] as const

async function getStats(year: number, quarter: number | null, month: number | null) {
  const supabase = createAdminSupabaseClient()
  const { start, end } = periodRange(year, quarter, month)
  const vatQuarter = quarter ?? Math.ceil((new Date().getMonth() + 1) / 3)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today)
  in30.setDate(in30.getDate() + 30)
  const todayStr = today.toISOString().split('T')[0]
  const in30Str = in30.toISOString().split('T')[0]

  // ── Todas las queries en paralelo ──────────────────────────────────────────
  const [
    { data: emitidas },
    { data: recibidas },
    { count: proyectosActivos },
    pendientesCobro,
    pendientesPago,
    { data: vatData },
    { data: facturasPorVencer },
    { data: projectFinancials },
    { data: recentLeads },
    { data: periodInvoices },
    { data: periodLeads },
  ] = await Promise.all([
    supabase.from('invoices').select('amount_base,vat_amount,amount_total').eq('direction','emitida').in('doc_type',FINANCIAL_DOC_TYPES).is('deleted_at',null).gte('issue_date',start).lte('issue_date',end),
    supabase.from('invoices').select('amount_base,vat_amount,amount_total').eq('direction','recibida').in('doc_type',FINANCIAL_DOC_TYPES).is('deleted_at',null).gte('issue_date',start).lte('issue_date',end),
    supabase.from('projects').select('*',{count:'exact',head:true}).eq('status','en_curso').is('deleted_at',null),
    fetchAllRows<{amount_total:number|null}>((sb) => sb.from('invoices').select('amount_total').eq('direction','emitida').in('doc_type',FINANCIAL_DOC_TYPES).eq('payment_status','pendiente').is('deleted_at',null)),
    fetchAllRows<{amount_total:number|null}>((sb) => sb.from('invoices').select('amount_total').eq('direction','recibida').in('doc_type',FINANCIAL_DOC_TYPES).eq('payment_status','pendiente').is('deleted_at',null)),
    supabase.from('vat_quarterly').select('*').eq('year',year).eq('quarter',vatQuarter).maybeSingle(),
    supabase.from('invoices').select('id,number,concept,amount_total,due_date,direction').in('doc_type',FINANCIAL_DOC_TYPES).eq('payment_status','pendiente').is('deleted_at',null).gte('due_date',todayStr).lte('due_date',in30Str).order('due_date',{ascending:true}),
    supabase.from('project_financials').select('code,name,budget_estimated,sale_price,income_base,expense_base,gross_margin,status').eq('status','en_curso').order('code',{ascending:true}),
    supabase.from('leads').select('id,nombre,email,tipo_proyecto,zona,created_at').is('deleted_at',null).gte('created_at',start).lte('created_at',end+'T23:59:59').order('created_at',{ascending:false}).limit(10),
    supabase.from('invoices').select('amount_base,vat_amount,amount_total,direction,issue_date,payment_status,due_date').in('doc_type',FINANCIAL_DOC_TYPES).is('deleted_at',null).gte('issue_date',start).lte('issue_date',end),
    supabase.from('leads').select('origen').is('deleted_at',null).gte('created_at',start).lte('created_at',end+'T23:59:59'),
  ])
  // ──────────────────────────────────────────────────────────────────────────

  // Usar amount_base (neto sin IVA) igual que P&L — si no existe, derivar de amount_total - vat_amount
  function getNetAmt(i: { amount_base?: number|null; vat_amount?: number|null; amount_total?: number|null }): number {
    if (i.amount_base != null) return Number(i.amount_base)
    if (i.amount_total != null && i.vat_amount != null) return Number(i.amount_total) - Number(i.vat_amount)
    return Number(i.amount_total) || 0
  }
  const facturacionTotal = (emitidas || []).reduce((s,i) => s + getNetAmt(i), 0)
  const gastosTotal = (recibidas || []).reduce((s,i) => s + getNetAmt(i), 0)
  const margenBruto = facturacionTotal - gastosTotal
  const totalPendienteCobro = (pendientesCobro || []).reduce((s,i) => s + (Number(i.amount_total)||0), 0)
  const countPendienteCobro = pendientesCobro?.length || 0
  const totalPendientePago = (pendientesPago || []).reduce((s,i) => s + (Number(i.amount_total)||0), 0)
  const countPendientePago = pendientesPago?.length || 0
  const cashFlow30Income = (facturasPorVencer || []).filter((i: {direction:string}) => i.direction==='emitida').reduce((s:number,i:{amount_total:number|null}) => s+(Number(i.amount_total)||0), 0)
  const cashFlow30Expenses = (facturasPorVencer || []).filter((i: {direction:string}) => i.direction==='recibida').reduce((s:number,i:{amount_total:number|null}) => s+(Number(i.amount_total)||0), 0)

  // Chart: monthly breakdown (use net base amounts, consistent with P&L)
  const monthlyMap = buildMonthlyMap(year, quarter, month)
  for (const inv of periodInvoices || []) {
    if (!inv.issue_date) continue
    const key = inv.issue_date.substring(0, 7)
    if (monthlyMap[key]) {
      const amount = getNetAmt(inv)
      if (inv.direction === 'emitida') monthlyMap[key].ingresos += amount
      else monthlyMap[key].gastos += amount
    }
  }
  const monthlyData = Object.entries(monthlyMap).map(([key, vals]) => {
    const [, m] = key.split('-')
    const margen = vals.ingresos > 0 ? ((vals.ingresos - vals.gastos) / vals.ingresos) * 100 : 0
    return { month: MONTHS_ES[parseInt(m,10) - 1], ...vals, margen: Math.round(margen * 10) / 10 }
  })

  // Chart: estado facturas
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const statusCounts: Record<string,number> = { pagada:0, pendiente:0, vencida:0 }
  for (const inv of periodInvoices || []) {
    if (inv.payment_status === 'pagada' || inv.payment_status === 'cobrada') statusCounts.pagada++
    else if (inv.due_date && new Date(inv.due_date + 'T00:00:00') < now) statusCounts.vencida++
    else statusCounts.pendiente++
  }
  const invoiceStatus = [
    { name:'Pagada', value:statusCounts.pagada, color:'#22c55e' },
    { name:'Pendiente', value:statusCounts.pendiente, color:'#f59e0b' },
    { name:'Vencida', value:statusCounts.vencida, color:'#ef4444' },
  ].filter(s => s.value > 0)

  // Chart: origen leads
  const sourceMap: Record<string,number> = {}
  for (const lead of periodLeads || []) {
    const src = lead.origen || 'Directo'
    sourceMap[src] = (sourceMap[src] || 0) + 1
  }
  const leadSources = Object.entries(sourceMap).map(([name,value]) => ({name,value})).sort((a,b) => b.value - a.value)

  return {
    facturacionTotal, gastosTotal, margenBruto,
    proyectosActivos: proyectosActivos || 0,
    totalPendienteCobro, countPendienteCobro,
    totalPendientePago, countPendientePago,
    vat: vatData, vatQuarter,
    facturasPorVencer: (facturasPorVencer || []).slice(0, 15),
    cashFlow30Income, cashFlow30Expenses,
    projectFinancials: projectFinancials || [],
    recentLeads: recentLeads || [],
    monthlyData, invoiceStatus, leadSources,
  }
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; month?: string }>
}) {
  // Auth check
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const sp = await searchParams
  const currentYear = new Date().getFullYear()
  const year = sp.year ? parseInt(sp.year) : currentYear
  const quarter = sp.quarter ? parseInt(sp.quarter) : null
  const month = sp.month ? parseInt(sp.month) : null

  // Data
  const stats = await getStats(year, quarter, month)

  const margenPct = stats.facturacionTotal > 0
    ? ((stats.margenBruto / stats.facturacionTotal) * 100).toFixed(1)
    : null

  const kpis = [
    {
      label: 'Pendiente de cobro',
      value: formatEUR(stats.totalPendienteCobro),
      sub: `${stats.countPendienteCobro} ${stats.countPendienteCobro === 1 ? 'factura' : 'facturas'} pendientes`,
      color: stats.totalPendienteCobro > 0 ? 'text-amber-600' : 'text-neutral-900',
      href: '/admin/facturas',
    },
    {
      label: 'Facturación total',
      value: formatEUR(stats.facturacionTotal),
      color: 'text-neutral-900',
      href: '/admin/facturas',
    },
    {
      label: 'Margen bruto',
      value: formatEUR(stats.margenBruto),
      sub: margenPct ? `${margenPct}% sobre facturación` : undefined,
      color: stats.margenBruto >= 0 ? 'text-green-600' : 'text-red-600',
      href: '/admin/informes',
    },
    {
      label: 'Pendiente de pago',
      value: formatEUR(stats.totalPendientePago),
      sub: `${stats.countPendientePago} ${stats.countPendientePago === 1 ? 'factura' : 'facturas'} por pagar`,
      color: stats.totalPendientePago > 0 ? 'text-amber-600' : 'text-neutral-900',
      href: '/admin/facturas',
    },
    {
      label: 'Proyectos activos',
      value: String(stats.proyectosActivos),
      sub: 'en curso actualmente',
      color: 'text-neutral-900',
      href: '/admin/proyectos',
    },
    {
      label: 'Gastos totales',
      value: formatEUR(stats.gastosTotal),
      color: 'text-neutral-900',
      href: '/admin/facturas',
    },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-xl font-medium uppercase tracking-wide">Dashboard</h1>
          <p className="text-xs text-neutral-400 uppercase tracking-widest mt-1">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={null}>
            <PeriodSelector year={year} quarter={quarter} month={month} />
          </Suspense>
          <QuickAddButton />
        </div>
      </div>

      {/* ── KPI Cards (clickable) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-10">
        {kpis.map(({ label, value, color, sub, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white p-5 border border-neutral-100 rounded hover:border-primary hover:shadow-sm transition-all group"
          >
            <p className={`text-xl font-bold ${color} leading-tight`}>{value}</p>
            {sub && (
              <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-2 group-hover:text-primary transition-colors">
              {label} →
            </p>
          </Link>
        ))}
      </div>

      {/* ── Facturas por vencer ── */}
      <div className="bg-white border border-neutral-100 rounded mb-10">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Facturas por vencer &mdash; pr&oacute;ximos 30 d&iacute;as
          </h2>
          <Link
            href="/admin/facturas"
            className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest hover:text-neutral-600 transition-colors"
          >
            Ver todas
          </Link>
        </div>
        {stats.facturasPorVencer.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            No hay facturas pr&oacute;ximas a vencer
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  <th className="text-left px-5 py-3">N&uacute;mero</th>
                  <th className="text-left px-5 py-3">Concepto</th>
                  <th className="text-left px-5 py-3">Tipo</th>
                  <th className="text-right px-5 py-3">Importe</th>
                  <th className="text-right px-5 py-3">Vencimiento</th>
                  <th className="text-right px-5 py-3">D&iacute;as</th>
                </tr>
              </thead>
              <tbody>
                {stats.facturasPorVencer.map(
                  (
                    inv: {
                      id: string
                      number: string | null
                      concept: string | null
                      amount_total: number | null
                      due_date: string
                      direction: string
                    },
                    i: number
                  ) => {
                    const days = daysUntil(inv.due_date)
                    return (
                      <tr
                        key={inv.id}
                        className={i % 2 === 1 ? 'bg-neutral-50' : ''}
                      >
                        <td className="px-5 py-3 font-medium">
                          {inv.number || '\u2014'}
                        </td>
                        <td className="px-5 py-3 text-neutral-600 max-w-[250px] truncate">
                          {inv.concept || '\u2014'}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                              inv.direction === 'emitida'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-orange-50 text-orange-600'
                            }`}
                          >
                            {inv.direction === 'emitida' ? 'Cobro' : 'Pago'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium">
                          {formatEUR(inv.amount_total)}
                        </td>
                        <td className="px-5 py-3 text-right text-neutral-500">
                          {formatDate(inv.due_date)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${dueDateBg(days)} ${dueDateColor(days)}`}
                          >
                            {days}d
                          </span>
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Proyectos activos con rentabilidad ── */}

      <div className="bg-white border border-neutral-100 rounded mb-10">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Proyectos activos &mdash; rentabilidad
          </h2>
          <Link
            href="/admin/proyectos"
            className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest hover:text-neutral-600 transition-colors"
          >
            Ver todos
          </Link>
        </div>
        {stats.projectFinancials.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            No hay proyectos en curso
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  <th className="text-left px-5 py-3">C&oacute;digo</th>
                  <th className="text-left px-5 py-3">Nombre</th>
                  <th className="text-right px-5 py-3">Presupuesto</th>
                  <th className="text-right px-5 py-3">Facturado</th>
                  <th className="text-right px-5 py-3">Gastado</th>
                  <th className="text-right px-5 py-3">Margen</th>
                  <th className="text-right px-5 py-3">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {stats.projectFinancials.map(
                  (
                    p: {
                      code: string | null
                      name: string | null
                      budget_estimated: number | null
                      sale_price: number | null
                      income_base: number | null
                      expense_base: number | null
                      gross_margin: number | null
                      status: string
                    },
                    i: number
                  ) => {
                    const incomeBase = Number(p.income_base) || 0
                    const marginPct =
                      incomeBase > 0
                        ? ((Number(p.gross_margin) || 0) / incomeBase) * 100
                        : 0
                    return (
                      <tr
                        key={p.code || i}
                        className={i % 2 === 1 ? 'bg-neutral-50' : ''}
                      >
                        <td className="px-5 py-3 font-medium font-mono text-xs">
                          {p.code || '\u2014'}
                        </td>
                        <td className="px-5 py-3 text-neutral-700 max-w-[200px] truncate">
                          {p.name || '\u2014'}
                        </td>
                        <td className="px-5 py-3 text-right text-neutral-500">
                          {formatEUR(p.budget_estimated ?? p.sale_price)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium">
                          {formatEUR(p.income_base)}
                        </td>
                        <td className="px-5 py-3 text-right text-neutral-500">
                          {formatEUR(p.expense_base)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium">
                          <span
                            className={
                              (Number(p.gross_margin) || 0) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }
                          >
                            {formatEUR(p.gross_margin)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${marginColor(marginPct)} ${
                              marginPct >= 20
                                ? 'bg-green-50'
                                : marginPct >= 10
                                  ? 'bg-amber-50'
                                  : 'bg-red-50'
                            }`}
                          >
                            {marginPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Charts ── */}
      <DashboardCharts
        monthlyData={stats.monthlyData}
        invoiceStatus={stats.invoiceStatus}
        leadSources={stats.leadSources}
      />

      {/* ── Two-column: IVA + Flujo de Caja ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* IVA Trimestral */}
        <Link href="/admin/informes" className="bg-white border border-neutral-100 rounded block hover:border-primary transition-colors">
          <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              IVA &mdash; Q{stats.vatQuarter} {year}
            </h2>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Ver informes →</span>
          </div>
          <div className="p-5">
            {stats.vat ? (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-neutral-900">
                    {formatEUR(stats.vat.vat_repercutido)}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">
                    Repercutido
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold text-neutral-900">
                    {formatEUR(stats.vat.vat_soportado)}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">
                    Soportado
                  </p>
                </div>
                <div>
                  <p
                    className={`text-lg font-bold ${
                      (stats.vat.cuota_a_ingresar ?? 0) >= 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {formatEUR(stats.vat.cuota_a_ingresar)}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">
                    Cuota a ingresar
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400 text-center py-4">
                Sin datos de IVA para este trimestre
              </p>
            )}
          </div>
        </Link>

        {/* Flujo de Caja - próximos 30 días */}
        <Link href="/admin/informes" className="bg-white border border-neutral-100 rounded block hover:border-primary transition-colors">
          <div className="p-5 border-b border-neutral-100 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Flujo de Caja &mdash; próximos 30 días
            </h2>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Ver informes →</span>
          </div>
          <div className="p-5">
            <CashFlowBar income={stats.cashFlow30Income} expenses={stats.cashFlow30Expenses} />
          </div>
        </Link>
      </div>

      {/* ── Leads recientes ── */}
      <div className="bg-white border border-neutral-100 rounded">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Leads &mdash; {month ? MONTHS_ES[month-1] : quarter ? `Q${quarter}` : 'Año'} {year}
          </h2>
          <Link
            href="/admin/leads"
            className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest hover:text-neutral-600 transition-colors"
          >
            Ver todos
          </Link>
        </div>
        {stats.recentLeads.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            No hay leads en este periodo
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  <th className="text-left px-5 py-3">Nombre</th>
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Tipo proyecto</th>
                  <th className="text-left px-5 py-3">Zona</th>
                  <th className="text-right px-5 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentLeads.map(
                  (
                    lead: {
                      id: string
                      nombre: string | null
                      email: string | null
                      tipo_proyecto: string | null
                      zona: string | null
                      created_at: string
                    },
                    i: number
                  ) => (
                    <tr
                      key={lead.id}
                      className={i % 2 === 1 ? 'bg-neutral-50' : ''}
                    >
                      <td className="px-5 py-3 font-medium">
                        {lead.nombre || '\u2014'}
                      </td>
                      <td className="px-5 py-3 text-neutral-500">
                        {lead.email || '\u2014'}
                      </td>
                      <td className="px-5 py-3 text-neutral-600">
                        {lead.tipo_proyecto || '\u2014'}
                      </td>
                      <td className="px-5 py-3 text-neutral-600">
                        {lead.zona || '\u2014'}
                      </td>
                      <td className="px-5 py-3 text-right text-neutral-400">
                        {formatDate(lead.created_at)}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
