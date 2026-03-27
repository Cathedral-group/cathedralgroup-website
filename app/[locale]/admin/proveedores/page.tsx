import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminCrudPage from '@/components/admin/AdminCrudPage'

export default async function ProveedoresPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

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
        { key: 'nombre', label: 'Nombre' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'valoracion', label: 'Valoración' },
      ]}
      fields={[
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'categoria', label: 'Categoría', type: 'select', options: ['electricidad', 'fontaneria', 'pintura', 'carpinteria', 'marmol', 'cristaleria', 'climatizacion', 'domotica', 'otro'] },
        { name: 'telefono', label: 'Teléfono', type: 'text' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'cif', label: 'CIF', type: 'text' },
        { name: 'valoracion', label: 'Valoración (1-5)', type: 'number' },
        { name: 'notas', label: 'Notas', type: 'textarea' },
      ]}
    />
  )
}
