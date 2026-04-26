import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PersonalView from './PersonalView'

export const dynamic = 'force-dynamic'

export default async function PersonalPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [payrollsRes, summariesRes, employeesRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb.from('payrolls').select('*').is('deleted_at', null).order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false })
    ),
    fetchAllRows((sb) =>
      sb.from('payroll_summaries').select('*').is('deleted_at', null).order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false })
    ),
    supabase.from('employees').select('*').is('deleted_at', null).order('nombre', { ascending: true }),
  ])

  return (
    <PersonalView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payrolls={(payrollsRes as any[]) ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summaries={(summariesRes as any[]) ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      employees={(employeesRes.data as any[]) ?? []}
    />
  )
}
