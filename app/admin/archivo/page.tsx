import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import InvoicesView from '../facturas/InvoicesView'

export const dynamic = 'force-dynamic'

export default async function ArchivoPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [invoices, projectsRes, suppliersRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb.from('invoices').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    ),
    supabase.from('projects').select('id, code, name').is('deleted_at', null),
    supabase.from('suppliers').select('nif, name').is('deleted_at', null),
  ])

  const projects = (projectsRes.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
  }))

  const suppliers = (suppliersRes.data ?? []).map((s) => ({
    value: s.nif,
    label: `${s.nif} - ${s.name}`,
  }))

  return (
    <InvoicesView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={invoices as any}
      projects={projects}
      suppliers={suppliers}
      allTypes
      pageTitle="Archivo"
    />
  )
}
