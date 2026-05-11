import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import BancoHorasView from './BancoHorasView'

export default async function BancoHorasPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: employees } = await supabase
    .from('employees')
    .select('id, nombre, nif, fecha_baja')
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('nombre')

  const todayStr = new Date().toISOString().slice(0, 10)
  const activos = (employees ?? []).filter(
    (e) => !e.fecha_baja || (e.fecha_baja as string) > todayStr,
  )

  const balances = await Promise.all(
    activos.map(async (e) => {
      const { data: balance } = await supabase.rpc('get_worker_overtime_balance', {
        p_employee_id: e.id,
      })
      return { employee: e, balance }
    }),
  )

  const { data: redemptions } = await supabase
    .from('worker_overtime_redemptions')
    .select(
      `id, employee_id, fecha, horas_descontadas, motivo, created_at, created_by_email,
       employee:employee_id (id, nombre)`,
    )
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('fecha', { ascending: false })
    .limit(50)

  return (
    <BancoHorasView
      balances={balances}
      redemptions={redemptions ?? []}
    />
  )
}
