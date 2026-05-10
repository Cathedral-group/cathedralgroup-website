import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PersonalView from './PersonalView'
import WorkerAlertsBanner from '@/components/admin/WorkerAlertsBanner'
import { batchVerify } from '@/lib/verifier/batch'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export const dynamic = 'force-dynamic'

export default async function PersonalPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  // F3 completo: filtrar por empresa activa
  const activeCompanyId = await getActiveCompanyForPage()

  const supabase = createAdminSupabaseClient()

  // Cargar todo en paralelo (filtrado por company_id activo donde aplica)
  const [
    payrollsRes, summariesRes, employeesRes,
    contractsRes, paymentsRes, dependentsRes, familyHistoryRes,
    timeRecordsRes, vacationsRes, permitsRes, overtimeRes, itLeavesRes,
    finiquitosRes, taxFilingsRes, ssFilingsRes, equalityRes, agreementsRes,
    prlRes,
  ] = await Promise.all([
    fetchAllRows((sb) => sb.from('payrolls').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false })),
    fetchAllRows((sb) => sb.from('payroll_summaries').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false })),
    supabase.from('employees').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('nombre'),
    supabase.from('employee_contracts').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_inicio', { ascending: false }),
    supabase.from('payroll_payments').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_transferencia', { ascending: false }),
    supabase.from('employee_dependents').select('*').eq('company_id', activeCompanyId).is('deleted_at', null),
    supabase.from('employee_family_situation_history').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_efecto', { ascending: false }),
    supabase.from('time_records').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha', { ascending: false }).limit(500),
    supabase.from('vacation_records').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('anio', { ascending: false }),
    supabase.from('leave_permits').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_inicio', { ascending: false }),
    supabase.from('overtime_records').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('ejercicio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('it_leaves').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_baja', { ascending: false }),
    supabase.from('finiquitos').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_baja', { ascending: false }),
    supabase.from('tax_filings').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('ejercicio', { ascending: false }).order('periodo', { ascending: false }),
    supabase.from('ss_filings').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('ejercicio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('equality_pay_register').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('periodo_anio', { ascending: false }),
    // collective_agreements está en allowlist (catálogo compartido) — sin filtro company_id
    supabase.from('collective_agreements').select('*').is('deleted_at', null).order('vigencia_desde', { ascending: false }),
    supabase.from('prl_documents').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('fecha_documento', { ascending: false }),
  ])

  // ─── Verificador algorítmico: ejecutar sobre nóminas para mostrar badges
  // visuales en la UI. Es matemática pura → milisegundos por documento.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payrollsArr = ((payrollsRes as any[]) ?? [])
  const payrollVerifications = batchVerify('nomina', payrollsArr)

  // ─── B9 Dashboard KPIs + alertas computadas server-side ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employees = (employeesRes.data as any[]) ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = (contractsRes.data as any[]) ?? []
  const today = new Date()
  const in30days = new Date(today.getTime() + 30 * 24 * 3600 * 1000)
  const today_iso = today.toISOString().slice(0, 10)
  const in30days_iso = in30days.toISOString().slice(0, 10)

  // Empleados activos (sin fecha_baja o fecha_baja futura)
  const activeEmployees = employees.filter((e) => !e.fecha_baja || e.fecha_baja >= today_iso)

  // Contratos por vencer en 30d
  const expiringContracts = contracts.filter((c) =>
    c.fecha_fin && c.fecha_fin >= today_iso && c.fecha_fin <= in30days_iso && c.estado !== 'extinguido'
  )

  // Vigilancia salud caduca en 30d
  const vigilanciaCaducando = activeEmployees.filter((e) =>
    e.apto_vigilancia_salud_proxima &&
    e.apto_vigilancia_salud_proxima >= today_iso &&
    e.apto_vigilancia_salud_proxima <= in30days_iso
  )

  // Vigilancia salud ya caducada
  const vigilanciaCaducada = activeEmployees.filter((e) =>
    e.apto_vigilancia_salud_proxima &&
    e.apto_vigilancia_salud_proxima < today_iso
  )

  // Formación PRL: pendiente si nunca tuvo o última hace >12 meses
  const oneYearAgo = new Date(today.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const prlPendiente = activeEmployees.filter((e) =>
    !e.formacion_prl_fecha || e.formacion_prl_fecha < oneYearAgo
  )

  // Próxima nómina: identificar el mes corriente sin nómina ya generada
  const currentMonth = today.getMonth() + 1  // 1-12
  const currentYear = today.getFullYear()
  const payrollsThisMonth = payrollsArr.filter(
    (p) => p.periodo_mes === currentMonth && p.periodo_anio === currentYear
  )
  const employeesNeedingPayroll = activeEmployees.length - payrollsThisMonth.length

  // Última nómina por empleado (mes/año más reciente)
  const lastPayrollByEmployee = new Map<string, { mes: number; anio: number; fecha: string }>()
  for (const p of payrollsArr) {
    const empId = p.employee_id || p.trabajador_nif
    if (!empId) continue
    const existing = lastPayrollByEmployee.get(empId)
    if (
      !existing ||
      p.periodo_anio > existing.anio ||
      (p.periodo_anio === existing.anio && p.periodo_mes > existing.mes)
    ) {
      lastPayrollByEmployee.set(empId, {
        mes: p.periodo_mes,
        anio: p.periodo_anio,
        fecha: p.created_at ?? '',
      })
    }
  }

  const dashboardKpis = {
    activeCount: activeEmployees.length,
    payrollsThisMonth: payrollsThisMonth.length,
    employeesNeedingPayroll,
    expiringContracts: expiringContracts.map((c) => ({
      id: c.id,
      employee_id: c.employee_id,
      fecha_fin: c.fecha_fin,
      tipo_contrato: c.tipo_contrato,
      days_until: Math.ceil(
        (new Date(c.fecha_fin).getTime() - today.getTime()) / (24 * 3600 * 1000)
      ),
    })),
    vigilanciaCaducando: vigilanciaCaducando.map((e) => ({
      nif: e.nif,
      nombre: e.nombre,
      proxima: e.apto_vigilancia_salud_proxima,
      days_until: Math.ceil(
        (new Date(e.apto_vigilancia_salud_proxima).getTime() - today.getTime()) /
          (24 * 3600 * 1000)
      ),
    })),
    vigilanciaCaducada: vigilanciaCaducada.map((e) => ({
      nif: e.nif,
      nombre: e.nombre,
      proxima: e.apto_vigilancia_salud_proxima,
      days_overdue: Math.ceil(
        (today.getTime() - new Date(e.apto_vigilancia_salud_proxima).getTime()) /
          (24 * 3600 * 1000)
      ),
    })),
    prlPendiente: prlPendiente.map((e) => ({
      nif: e.nif,
      nombre: e.nombre,
      ultima_formacion: e.formacion_prl_fecha,
    })),
    lastPayrollByEmployee: Object.fromEntries(lastPayrollByEmployee),
    currentMonth,
    currentYear,
  }

  return (
    <>
      <div className="mx-auto max-w-7xl px-6 pt-4">
        <WorkerAlertsBanner />
      </div>
      <PersonalView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={{
        payrolls: payrollsArr,
        payrollVerifications,
        summaries: (summariesRes as any[]) ?? [],
        employees,
        contracts,
        payments: (paymentsRes.data as any[]) ?? [],
        dependents: (dependentsRes.data as any[]) ?? [],
        familyHistory: (familyHistoryRes.data as any[]) ?? [],
        timeRecords: (timeRecordsRes.data as any[]) ?? [],
        vacations: (vacationsRes.data as any[]) ?? [],
        permits: (permitsRes.data as any[]) ?? [],
        overtime: (overtimeRes.data as any[]) ?? [],
        itLeaves: (itLeavesRes.data as any[]) ?? [],
        finiquitos: (finiquitosRes.data as any[]) ?? [],
        taxFilings: (taxFilingsRes.data as any[]) ?? [],
        ssFilings: (ssFilingsRes.data as any[]) ?? [],
        equality: (equalityRes.data as any[]) ?? [],
        agreements: (agreementsRes.data as any[]) ?? [],
        prl: (prlRes.data as any[]) ?? [],
        dashboardKpis,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}
    />
    </>
  )
}
