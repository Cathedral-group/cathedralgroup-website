import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function ClientesPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

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
        { key: 'name', label: 'Nombre' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'type', label: 'Tipo' },
      ]}
      fields={[
        { name: 'name', label: 'Nombre', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Teléfono', type: 'text' },
        { name: 'address', label: 'Dirección', type: 'text' },
        { name: 'type', label: 'Tipo', type: 'select', options: ['particular', 'empresa', 'inversor'] },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}
