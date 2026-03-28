import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function ProveedoresPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const { data } = await supabase
    .from('suppliers')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <AdminCrudPage
      title="Proveedores"
      table="suppliers"
      data={data || []}
      columns={[
        { key: 'name', label: 'Nombre' },
        { key: 'category', label: 'Categoría' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'rating', label: 'Valoración' },
      ]}
      fields={[
        { name: 'name', label: 'Nombre', type: 'text', required: true },
        { name: 'category', label: 'Categoría', type: 'select', options: ['electricidad', 'fontaneria', 'pintura', 'carpinteria', 'marmol', 'cristaleria', 'climatizacion', 'domotica', 'otro'] },
        { name: 'phone', label: 'Teléfono', type: 'text' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'cif', label: 'CIF', type: 'text' },
        { name: 'rating', label: 'Valoración (1-5)', type: 'number' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}
