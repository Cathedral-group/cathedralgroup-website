import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PersonalView from './PersonalView'
import { batchVerify } from '@/lib/verifier/batch'

export const dynamic = 'force-dynamic'

export default async function PersonalPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  // Cargar todo en paralelo
  const [
    payrollsRes, summariesRes, employeesRes,
    contractsRes, paymentsRes, dependentsRes, familyHistoryRes,
    timeRecordsRes, vacationsRes, permitsRes, overtimeRes, itLeavesRes,
    finiquitosRes, taxFilingsRes, ssFilingsRes, equalityRes, agreementsRes,
    prlRes,
  ] = await Promise.all([
    fetchAllRows((sb) => sb.from('payrolls').select('*').is('deleted_at', null).order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false })),
    fetchAllRows((sb) => sb.from('payroll_summaries').select('*').is('deleted_at', null).order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false })),
    supabase.from('employees').select('*').is('deleted_at', null).order('nombre'),
    supabase.from('employee_contracts').select('*').is('deleted_at', null).order('fecha_inicio', { ascending: false }),
    supabase.from('payroll_payments').select('*').is('deleted_at', null).order('fecha_transferencia', { ascending: false }),
    supabase.from('employee_dependents').select('*').is('deleted_at', null),
    supabase.from('employee_family_situation_history').select('*').is('deleted_at', null).order('fecha_efecto', { ascending: false }),
    supabase.from('time_records').select('*').is('deleted_at', null).order('fecha', { ascending: false }).limit(500),
    supabase.from('vacation_records').select('*').is('deleted_at', null).order('anio', { ascending: false }),
    supabase.from('leave_permits').select('*').is('deleted_at', null).order('fecha_inicio', { ascending: false }),
    supabase.from('overtime_records').select('*').is('deleted_at', null).order('ejercicio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('it_leaves').select('*').is('deleted_at', null).order('fecha_baja', { ascending: false }),
    supabase.from('finiquitos').select('*').is('deleted_at', null).order('fecha_baja', { ascending: false }),
    supabase.from('tax_filings').select('*').is('deleted_at', null).order('ejercicio', { ascending: false }).order('periodo', { ascending: false }),
    supabase.from('ss_filings').select('*').is('deleted_at', null).order('ejercicio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('equality_pay_register').select('*').is('deleted_at', null).order('periodo_anio', { ascending: false }),
    supabase.from('collective_agreements').select('*').is('deleted_at', null).order('vigencia_desde', { ascending: false }),
    supabase.from('prl_documents').select('*').is('deleted_at', null).order('fecha_documento', { ascending: false }),
  ])

  // ─── Verificador algorítmico: ejecutar sobre nóminas para mostrar badges
  // visuales en la UI. Es matemática pura → milisegundos por documento.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payrollsArr = ((payrollsRes as any[]) ?? [])
  const payrollVerifications = batchVerify('nomina', payrollsArr)

  return (
    <PersonalView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={{
        payrolls: payrollsArr,
        payrollVerifications,
        summaries: (summariesRes as any[]) ?? [],
        employees: (employeesRes.data as any[]) ?? [],
        contracts: (contractsRes.data as any[]) ?? [],
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}
    />
  )
}
