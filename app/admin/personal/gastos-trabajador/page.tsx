import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import GastosAdminView from './GastosAdminView'

export default async function GastosAdminPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: expenses } = await supabase
    .from('worker_expense_items')
    .select(
      `id, fecha, tipo, project_id, importe, km_recorridos, km_origen, km_destino,
       material_descripcion, material_cantidad, material_unidad, observaciones,
       fuente, status, reviewed_at, reviewed_by_email, created_at,
       employee:employee_id (id, nombre, nif),
       project:project_id (id, code, name)`,
    )
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('code', { ascending: false })

  return <GastosAdminView initialExpenses={expenses ?? []} projects={projects ?? []} />
}
