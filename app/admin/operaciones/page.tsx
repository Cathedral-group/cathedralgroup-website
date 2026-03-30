import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import OperacionesView from './OperacionesView'

export default async function OperacionesPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [opsRes, projectsRes] = await Promise.all([
    supabase
      .from('flipping_operations')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, code, name')
      .is('deleted_at', null),
  ])

  return (
    <OperacionesView
      initialData={opsRes.data ?? []}
      projects={projectsRes.data ?? []}
    />
  )
}
