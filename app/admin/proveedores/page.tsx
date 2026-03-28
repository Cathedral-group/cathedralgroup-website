import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import SuppliersView from './SuppliersView'

export default async function ProveedoresPage() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [suppliersRes, invoicesRes] = await Promise.all([
    supabase.from('suppliers').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id, numero, number, concepto, concept, tipo, direction, total, amount_total, estado, payment_status, proyecto_code, supplier_nif, issue_date, payment_date').is('deleted_at', null),
  ])

  return (
    <SuppliersView
      suppliers={suppliersRes.data || []}
      invoices={invoicesRes.data || []}
    />
  )
}
