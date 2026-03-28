import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CashFlowBar from '@/components/admin/CashFlowBar'
import QuickAddButton from '@/components/admin/QuickAddButton'

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
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
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

async function getStats() {
  const supabase = createAdminSupabaseClient()

  // --- KPI: Facturaci\u00f3n total (emitidas) ---
  const { data: emitidas } = await supabase
    .from('invoices')
    .select('amount_total')
    .eq('direction', 'emitida')

  const facturacionTotal = (emitidas || []).reduce(
    (sum, inv) => sum + (Number(inv.amount_total) || 0),
    0
  )

  // --- KPI: Gastos totales (recibidas) ---
  const { data: recibidas } = await supabase
    .from('invoices')
    .select('amount_total')
    .eq('direction', 'recibida')

  const gastosTotal = (recibidas || []).reduce(
    (sum, inv) => sum + (Number(inv.amount_total) || 0),
    0
  )

  const margenBruto = facturacionTotal - gastosTotal

  // --- KPI: Proyectos activos ---
  const { count: proyectosActivos } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'en_curso')

  // --- KPI: Facturas pendientes de cobro (emitidas + pendiente) ---
  const { data: pendientesCobro } = await supabase
    .from('invoices')
    .select('amount_total')
    .eq('direction', 'emitida')
    .eq('payment_status', 'pendiente')

  const totalPendienteCobro = (pendientesCobro || []).reduce(
    (sum, inv) => sum + (Number(inv.amount_total) || 0),
    0
  )
  const countPendienteCobro = pendientesCobro?.length || 0

  // --- KPI: Facturas pendientes de pago (recibidas + pendiente) ---
  const { data: pendientesPago } = await supabase
    .from('invoices')
    .select('amount_total')
    .eq('direction', 'recibida')
    .eq('payment_status', 'pendiente')

  const totalPendientePago = (pendientesPago || []).reduce(
    (sum, inv) => sum + (Number(inv.amount_total) || 0),
    0
  )
  const countPendientePago = pendientesPago?.length || 0

  // --- IVA trimestral (Q1 2026) ---
  const { data: vatData } = await supabase
    .from('vat_quarterly')
    .select('*')
    .eq('year', 2026)
    .eq('quarter', 1)
    .maybeSingle()

  // --- Facturas por vencer (pr\u00f3ximos 30 d\u00edas) ---
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30 = new Date(today)
  in30.setDate(in30.getDate() + 30)

  const { data: facturasPorVencer } = await supabase
    .from('invoices')
    .select('id, invoice_number, concept, amount_total, due_date, direction')
    .eq('payment_status', 'pendiente')
    .gte('due_date', today.toISOString().split('T')[0])
    .lte('due_date', in30.toISOString().split('T')[0])
    .order('due_date', { ascending: true })

  // --- CashFlow 30 days (from facturasPorVencer) ---
  const cashFlow30Income = (facturasPorVencer || [])
    .filter((inv: { direction: string }) => inv.direction === 'emitida')
    .reduce((sum: number, inv: { amount_total: number | null }) => sum + (Number(inv.amount_total) || 0), 0)

  const cashFlow30Expenses = (facturasPorVencer || [])
    .filter((inv: { direction: string }) => inv.direction === 'recibida')
    .reduce((sum: number, inv: { amount_total: number | null }) => sum + (Number(inv.amount_total) || 0), 0)

  // --- Proyectos activos con rentabilidad ---
  const { data: projectFinancials } = await supabase
    .from('project_financials')
    .select('code, name, budget_estimated, sale_price, income_base, expense_base, gross_margin, status')
    .eq('status', 'en_curso')
    .order('code', { ascending: true })

  // --- Leads recientes (7 d\u00edas) ---
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('id, nombre, email, tipo_proyecto, zona, created_at')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  return {
    facturacionTotal,
    gastosTotal,
    margenBruto,
    proyectosActivos: proyectosActivos || 0,
    totalPendienteCobro,
    countPendienteCobro,
    totalPendientePago,
    countPendientePago,
    vat: vatData,
    facturasPorVencer: (facturasPorVencer || []).slice(0, 15),
    cashFlow30Income,
    cashFlow30Expenses,
    projectFinancials: projectFinancials || [],
    recentLeads: recentLeads || [],
  }
}

export default async function AdminDashboard() {
  // Auth check
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  // Data
  const stats = await getStats()

  const kpis = [
    {
      label: 'Facturaci\u00f3n total',
      value: formatEUR(stats.facturacionTotal),
      color: 'text-neutral-900',
    },
    {
      label: 'Gastos totales',
      value: formatEUR(stats.gastosTotal),
      color: 'text-neutral-900',
    },
    {
      label: 'Margen bruto',
      value: formatEUR(stats.margenBruto),
      color: stats.margenBruto >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      label: 'Proyectos activos',
      value: String(stats.proyectosActivos),
      color: 'text-neutral-900',
    },
    {
      label: 'Pendiente de cobro',
      value: formatEUR(stats.totalPendienteCobro),
      sub: `${stats.countPendienteCobro} facturas`,
      color: 'text-amber-600',
    },
    {
      label: 'Pendiente de pago',
      value: formatEUR(stats.totalPendientePago),
      sub: `${stats.countPendientePago} facturas`,
      color: 'text-amber-600',
    },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <h1 className="text-xl font-medium uppercase tracking-wide">Dashboard</h1>
        <div className="flex items-center gap-4">
          <p className="text-xs text-neutral-400 uppercase tracking-widest">
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <QuickAddButton />
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-10">
        {kpis.map(({ label, value, color, sub }) => (
          <div
            key={label}
            className="bg-white p-5 border border-neutral-100 rounded"
          >
            <p className={`text-xl font-bold ${color} leading-tight`}>{value}</p>
            {sub && (
              <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-2">
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Two-column: IVA + Flujo de Caja ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* IVA Trimestral */}
        <div className="bg-white border border-neutral-100 rounded">
          <div className="p-5 border-b border-neutral-100">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              IVA &mdash; Q1 2026
            </h2>
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
        </div>

        {/* Flujo de Caja - pr\u00f3ximos 30 d\u00edas */}
        <div className="bg-white border border-neutral-100 rounded">
          <div className="p-5 border-b border-neutral-100">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Flujo de Caja &mdash; pr&oacute;ximos 30 d&iacute;as
            </h2>
          </div>
          <div className="p-5">
            <CashFlowBar income={stats.cashFlow30Income} expenses={stats.cashFlow30Expenses} />
          </div>
        </div>
      </div>

      {/* ── Facturas por vencer ── */}
      <div className="bg-white border border-neutral-100 rounded mb-10">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Facturas por vencer &mdash; pr&oacute;ximos 30 d&iacute;as
          </h2>
          <Link
            href="/admin/invoices"
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
                      invoice_number: string | null
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
                          {inv.invoice_number || '\u2014'}
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
            href="/admin/projects"
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

      {/* ── Leads recientes ── */}
      <div className="bg-white border border-neutral-100 rounded">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Leads recientes &mdash; &uacute;ltimos 7 d&iacute;as
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
            No hay leads en los &uacute;ltimos 7 d&iacute;as
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
