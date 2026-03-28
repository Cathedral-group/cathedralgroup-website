import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ProjectsView from './ProjectsView'

export default async function ProyectosPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [projectsRes, clientsRes, financialsRes, invoicesRes, phasesRes] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('project_financials').select('*'),
    supabase.from('invoices').select('id, numero, concepto, tipo, total, estado, proyecto_code'),
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
