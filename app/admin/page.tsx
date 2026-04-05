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


const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function periodRange(year: number, quarter: number | null, month: number | null, all?: boolean) {
  if (all) return { start: '2000-01-01', end: '2099-12-31' }
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

function buildMonthlyMap(year: number, quarter: number | null, month: number | null, all?: boolean) {
  const map: Record<string, { ingresos: number; gastos: number }> = {}
  if (all) {
    // Show last 12 months rolling for "all time" view
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`
      map[key] = { ingresos: 0, gastos: 0 }
    }
  } else if (month) {
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

async function getStats(year: number, quarter: number | null, month: number | null, all?: boolean) {
  const supabase = createAdminSupabaseClient()
  const { start, end } = periodRange(year, quarter, month, all)
  const vatQuarter = quarter ?? Math.ceil((new Date().getMonth() + 1) / 3)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today)
  in30.setDate(in30.getDate() + 30)
  const in15 = new Date(today)
  in15.setDate(in15.getDate() + 15)
  const todayStr = today.toISOString().split('T')[0]
  const in30Str = in30.toISOString().split('T')[0]
  const in15Str = in15.toISOString().split('T')[0]

  // ── Todas las queries en paralelo ──────────────────────────────────────────
  const [
    { data: emitidas },
    { data: recibidas },
    pendientesCobro,
    pendientesPago,
    { data: vatData },
    { data: cashFlowInvoices },
    { data: recentLeads },
    { data: periodInvoices },
    { data: periodLeads },
    { data: docsExpiringSoon },
    { data: docsExpired },
  ] = await Promise.all([
    supabase.from('invoices').select('amount_base,vat_amount,amount_total').eq('direction','emitida').in('doc_type',FINANCIAL_DOC_TYPES).is('deleted_at',null).gte('issue_date',start).lte('issue_date',end),
    supabase.from('invoices').select('amount_base,vat_amount,amount_total').eq('direction','recibida').in('doc_type',FINANCIAL_DOC_TYPES).is('deleted_at',null).gte('issue_date',start).lte('issue_date',end),
    fetchAllRows<{amount_total:number|null}>((sb) => sb.from('invoices').select('amount_total').eq('direction','emitida').in('doc_type',FINANCIAL_DOC_TYPES).eq('payment_status','pendiente').is('deleted_at',null)),
    fetchAllRows<{amount_total:number|null}>((sb) => sb.from('invoices').select('amount_total').eq('direction','recibida').in('doc_type',FINANCIAL_DOC_TYPES).eq('payment_status','pendiente').is('deleted_at',null)),
    supabase.from('vat_quarterly').select('*').eq('year',year).eq('quarter',vatQuarter).maybeSingle(),
    supabase.from('invoices').select('amount_total,due_date,direction').in('doc_type',FINANCIAL_DOC_TYPES).eq('payment_status','pendiente').is('deleted_at',null).gte('due_date',todayStr).lte('due_date',in30Str),
    supabase.from('leads').select('id,nombre,email,tipo_proyecto,zona,created_at').is('deleted_at',null).gte('created_at',start).lte('created_at',end+'T23:59:59').order('created_at',{ascending:false}).limit(10),
    supabase.from('invoices').select('amount_base,vat_amount,amount_total,direction,issue_date,payment_status,due_date').in('doc_type',FINANCIAL_DOC_TYPES).is('deleted_at',null).gte('issue_date',start).lte('issue_date',end),
    supabase.from('leads').select('origen').is('deleted_at',null).gte('created_at',start).lte('created_at',end+'T23:59:59'),
    // Documentos que vencen en los próximos 15 días (siempre, independiente del periodo)
    supabase.from('documents').select('id,titulo,doc_category,doc_type,fecha_vencimiento,estado').is('deleted_at',null).not('fecha_vencimiento','is',null).gte('fecha_vencimiento',todayStr).lte('fecha_vencimiento',in15Str).not('estado','in','(cancelado,caducado)').order('fecha_vencimiento',{ascending:true}),
    // Documentos ya vencidos (vencimiento pasado, no cancelados)
    supabase.from('documents').select('id,titulo,doc_category,doc_type,fecha_vencimiento,estado').is('deleted_at',null).not('fecha_vencimiento','is',null).lt('fecha_vencimiento',todayStr).not('estado','in','(cancelado,caducado)').order('fecha_vencimiento',{ascending:false}).limit(10),
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
  const cashFlow30Income = (cashFlowInvoices || []).filter((i: {direction:string}) => i.direction==='emitida').reduce((s:number,i:{amount_total:number|null}) => s+(Number(i.amount_total)||0), 0)
  const cashFlow30Expenses = (cashFlowInvoices || []).filter((i: {direction:string}) => i.direction==='recibida').reduce((s:number,i:{amount_total:number|null}) => s+(Number(i.amount_total)||0), 0)

  // Chart: monthly breakdown (use net base amounts, consistent with P&L)
  const monthlyMap = buildMonthlyMap(year, quarter, month, all)
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
    totalPendienteCobro, countPendienteCobro,
    totalPendientePago, countPendientePago,
    vat: vatData, vatQuarter,
    cashFlow30Income, cashFlow30Expenses,
    recentLeads: recentLeads || [],
    monthlyData, invoiceStatus, leadSources,
    docsExpiringSoon: docsExpiringSoon || [],
    docsExpired: docsExpired || [],
  }
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; month?: string; all?: string }>
}) {
  // Auth check
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const sp = await searchParams
  const currentYear = new Date().getFullYear()
  const all = sp.all === '1'
  const year = sp.year ? parseInt(sp.year) : currentYear
  const quarter = sp.quarter ? parseInt(sp.quarter) : null
  const month = sp.month ? parseInt(sp.month) : null

  // Data
  const stats = await getStats(year, quarter, month, all)

  const margenPct = stats.facturacionTotal > 0
    ? ((stats.margenBruto / stats.facturacionTotal) * 100).toFixed(1)
    : null

  const kpis = [
    {
      label: 'Facturación total',
      value: formatEUR(stats.facturacionTotal),
      sub: 'Ingresos netos (sin IVA)',
      color: 'text-neutral-900',
      href: '/admin/facturas',
    },
    {
      label: 'Gastos totales',
      value: formatEUR(stats.gastosTotal),
      sub: 'Costes netos (sin IVA)',
      color: 'text-neutral-900',
      href: '/admin/facturas',
    },
    {
      label: 'Margen bruto',
      value: formatEUR(stats.margenBruto),
      sub: margenPct ? `${margenPct}% sobre facturación` : 'Sin ingresos en el periodo',
      color: stats.margenBruto >= 0 ? 'text-green-600' : 'text-red-600',
      href: '/admin/informes',
    },
    {
      label: 'Por cobrar',
      value: formatEUR(stats.totalPendienteCobro),
      sub: `${stats.countPendienteCobro} ${stats.countPendienteCobro === 1 ? 'factura pendiente' : 'facturas pendientes'}`,
      color: stats.totalPendienteCobro > 0 ? 'text-amber-600' : 'text-green-600',
      href: '/admin/facturas',
    },
    {
      label: 'Por pagar',
      value: formatEUR(stats.totalPendientePago),
      sub: `${stats.countPendientePago} ${stats.countPendientePago === 1 ? 'factura por pagar' : 'facturas por pagar'}`,
      color: stats.totalPendientePago > 0 ? 'text-amber-600' : 'text-green-600',
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
            <PeriodSelector year={year} quarter={quarter} month={month} all={all} />
          </Suspense>
          <QuickAddButton />
        </div>
      </div>

      {/* ── Alertas: documentos por vencer / vencidos ── */}
      {(stats.docsExpired.length > 0 || stats.docsExpiringSoon.length > 0) && (
        <div className="mb-8 space-y-2">
          {/* Vencidos */}
          {stats.docsExpired.map((doc: {
            id: string; titulo: string | null; doc_category: string | null
            doc_type: string; fecha_vencimiento: string; estado: string | null
          }) => {
            const days = Math.abs(Math.ceil((new Date(doc.fecha_vencimiento + 'T00:00:00').getTime() - Date.now()) / 86400000))
            const href = doc.doc_category ? `/admin/documentos/${doc.doc_category}` : '/admin/documentos/escrituras'
            return (
              <Link key={doc.id} href={href} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded px-4 py-3 hover:bg-red-100 transition-colors group">
                <span className="text-red-500 flex-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-red-800">{doc.titulo || doc.doc_type}</span>
                  <span className="text-xs text-red-500 ml-2 uppercase tracking-wider">{doc.doc_category}</span>
                </div>
                <span className="text-xs font-bold text-red-700 whitespace-nowrap">Venció hace {days}d</span>
                <span className="text-red-400 text-xs group-hover:text-red-600">→</span>
              </Link>
            )
          })}
          {/* Por vencer en 15 días */}
          {stats.docsExpiringSoon.map((doc: {
            id: string; titulo: string | null; doc_category: string | null
            doc_type: string; fecha_vencimiento: string; estado: string | null
          }) => {
            const days = Math.ceil((new Date(doc.fecha_vencimiento + 'T00:00:00').getTime() - Date.now()) / 86400000)
            const href = doc.doc_category ? `/admin/documentos/${doc.doc_category}` : '/admin/documentos/escrituras'
            return (
              <Link key={doc.id} href={href} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded px-4 py-3 hover:bg-amber-100 transition-colors group">
                <span className="text-amber-500 flex-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-amber-900">{doc.titulo || doc.doc_type}</span>
                  <span className="text-xs text-amber-600 ml-2 uppercase tracking-wider">{doc.doc_category}</span>
                </div>
                <span className="text-xs font-bold text-amber-700 whitespace-nowrap">Vence en {days}d — {new Date(doc.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                <span className="text-amber-400 text-xs group-hover:text-amber-600">→</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── KPI Cards (clickable) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-10">
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
            Leads &mdash; {all ? 'Histórico total' : month ? MONTHS_ES[month-1] : quarter ? `Q${quarter}` : 'Año'} {all ? '' : year}
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
