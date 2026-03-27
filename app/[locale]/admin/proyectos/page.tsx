import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function ProyectosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

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
        { key: 'title', label: 'Título' },
        { key: 'zone', label: 'Zona' },
        { key: 'service_type', label: 'Tipo' },
        { key: 'status', label: 'Estado' },
      ]}
      fields={[
        { name: 'title', label: 'Título', type: 'text', required: true },
        { name: 'slug', label: 'Slug', type: 'text', required: true },
        { name: 'description', label: 'Descripción', type: 'textarea' },
        { name: 'zone', label: 'Zona', type: 'text' },
        { name: 'service_type', label: 'Tipo de servicio', type: 'select', options: ['reforma', 'interiorismo', 'cambio-uso', 'obra-nueva', 'promocion'] },
        { name: 'sqm', label: 'm²', type: 'number' },
        { name: 'status', label: 'Estado', type: 'select', options: ['borrador', 'publicado', 'destacado'] },
      ]}
    />
  )
}
