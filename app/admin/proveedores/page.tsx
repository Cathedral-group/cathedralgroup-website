import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import SuppliersView from './SuppliersView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function ProveedoresPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  // F3 completo: filtrar por empresa activa
  const activeCompanyId = await getActiveCompanyForPage()

  const supabase = createAdminSupabaseClient()

  const [suppliersRes, invoices] = await Promise.all([
    supabase.from('suppliers').select('*').eq('company_id', activeCompanyId).is('deleted_at', null).order('created_at', { ascending: false }),
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('id, number, concept, direction, amount_base, vat_amount, amount_total, payment_status, proyecto_code, supplier_nif, issue_date, payment_date')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
    ),
  ])

  return (
    <SuppliersView
      suppliers={suppliersRes.data || []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={invoices as any}
    />
  )
}
