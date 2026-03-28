import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function ProyectosPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const { data } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <AdminCrudPage
      title="Proyectos"
      table="projects"
      data={data || []}
      columns={[
        { key: 'code', label: 'Código' },
        { key: 'name', label: 'Nombre' },
        { key: 'type', label: 'Tipo' },
        { key: 'status', label: 'Estado' },
      ]}
      fields={[
        { name: 'code', label: 'Código', type: 'text', required: true },
        { name: 'name', label: 'Nombre', type: 'text' },
        { name: 'description', label: 'Descripción', type: 'textarea' },
        { name: 'type', label: 'Tipo', type: 'select', options: ['reforma', 'interiorismo', 'cambio-uso', 'obra-nueva', 'promocion'] },
        { name: 'status', label: 'Estado', type: 'select', options: ['presupuesto', 'en_curso', 'completado', 'cancelado'] },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}
