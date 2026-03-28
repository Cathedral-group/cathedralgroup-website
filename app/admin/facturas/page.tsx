import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import InvoicesView from './InvoicesView'

export default async function FacturasPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [invoicesRes, projectsRes, suppliersRes] = await Promise.all([
    supabase.from('invoices').select('*').order('issue_date', { ascending: false }),
    supabase.from('projects').select('code, name'),
    supabase.from('suppliers').select('nif, name'),
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
    <InvoicesView
      initialData={invoicesRes.data ?? []}
      projects={projects}
      suppliers={suppliers}
    />
  )
}
