import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import RevisionView from './RevisionView'

export default async function RevisionPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [pending, projectsRes, suppliersRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('*')
        .is('deleted_at', null)
        .or('needs_review.eq.true,doc_type.eq.otro,review_status.eq.pendiente,ai_confidence.lt.0.7')
        .order('created_at', { ascending: false })
    ),
    supabase.from('projects').select('code, name').is('deleted_at', null),
    supabase.from('suppliers').select('nif, name').is('deleted_at', null),
  ])

  const projects = (projectsRes.data ?? []).map((p) => ({
    value: p.code,
    label: `${p.code} - ${p.name}`,
  }))

  const suppliers = (suppliersRes.data ?? []).map((s) => ({
    value: s.nif,
    label: `${s.nif} - ${s.name}`,
  }))

  return (
    <RevisionView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={pending as any}
      projects={projects}
      suppliers={suppliers}
    />
  )
}
