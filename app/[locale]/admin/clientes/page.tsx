import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function ClientesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <AdminCrudPage
      title="Clientes"
      table="clients"
      data={data || []}
      columns={[
        { key: 'nombre', label: 'Nombre' },
        { key: 'email', label: 'Email' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'zona', label: 'Zona' },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'telefono', label: 'Teléfono', type: 'text' },
        { name: 'direccion', label: 'Dirección', type: 'text' },
        { name: 'zona', label: 'Zona', type: 'text' },
        { name: 'notas', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}
