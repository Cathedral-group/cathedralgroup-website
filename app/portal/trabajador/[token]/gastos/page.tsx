import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import GastosView from './GastosView'

type Params = { params: Promise<{ token: string }> }

export default async function GastosPage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const desdeStr = desde.toISOString().slice(0, 10)

  const [projectsRes, expensesRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('code', { ascending: false })
      .limit(50),
    supabase
      .from('worker_expense_items')
      .select(
        `id, fecha, tipo, project_id, importe, km_recorridos, km_origen, km_destino,
         material_descripcion, material_cantidad, material_unidad, observaciones,
         status, reviewed_at, created_at,
         project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .gte('fecha', desdeStr)
      .is('deleted_at', null)
      .order('fecha', { ascending: false })
      .limit(100),
  ])

  return (
    <GastosView
      token={token}
      projects={projectsRes.data ?? []}
      initialExpenses={expensesRes.data ?? []}
    />
  )
}
