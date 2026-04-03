import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DocumentsView from '../DocumentsView'

export default async function CorporativoPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [docsRes, projectsRes] = await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .eq('doc_category', 'corporativo')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, code, name')
      .is('deleted_at', null)
      .order('code'),
  ])

  const projects = (projectsRes.data ?? []).map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))
  return <DocumentsView category="corporativo" initialData={docsRes.data ?? []} projects={projects} />
}
