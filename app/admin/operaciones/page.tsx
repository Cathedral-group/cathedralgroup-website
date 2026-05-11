import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import OperacionesView from './OperacionesView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function OperacionesPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [opsRes, projectsRes] = await Promise.all([
    supabase
      .from('flipping_operations')
      .select('*')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .neq('status', 'cancelado'),
  ])

  return (
    <OperacionesView
      initialData={opsRes.data ?? []}
      projects={projectsRes.data ?? []}
    />
  )
}
