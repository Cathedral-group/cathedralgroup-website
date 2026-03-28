import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ClientsView from './ClientsView'

export default async function ClientesPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [clientsRes, projectsRes, invoicesRes, communicationsRes] = await Promise.all([
    supabase.from('clients').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, code, name, client_id, status').is('deleted_at', null),
    supabase.from('invoices').select('id, numero, number, concepto, concept, tipo, direction, total, amount_total, estado, payment_status, proyecto_code, issue_date').is('deleted_at', null),
    supabase.from('communications').select('*').eq('entity_type', 'client').order('date', { ascending: false }),
  ])

  return (
    <ClientsView
      clients={clientsRes.data || []}
      projects={projectsRes.data || []}
      invoices={invoicesRes.data || []}
      communications={communicationsRes.data || []}
    />
  )
}
