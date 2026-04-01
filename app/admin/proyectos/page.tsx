import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ProjectsView from './ProjectsView'

export default async function ProyectosPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [projectsRes, clientsRes, financialsRes, invoicesRes, phasesRes] = await Promise.all([
    supabase.from('projects').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('project_financials').select('*'),
    supabase.from('invoices').select('id, number, concept, direction, amount_total, payment_status, proyecto_code').is('deleted_at', null),
    supabase.from('project_phases').select('*').order('start_date', { ascending: true }),
  ])

  return (
    <ProjectsView
      projects={projectsRes.data || []}
      clients={clientsRes.data || []}
      financials={financialsRes.data || []}
      invoices={invoicesRes.data || []}
      phases={phasesRes.data || []}
    />
  )
}
