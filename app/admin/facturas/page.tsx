import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import InvoicesView from './InvoicesView'
import { batchVerifyInvoices } from '@/lib/verifier/batch'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export const dynamic = 'force-dynamic'

export default async function FacturasPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  // F3 completo: filtrar por empresa activa del JWT (Cathedral por DEFAULT hoy)
  const activeCompanyId = await getActiveCompanyForPage()

  const supabase = createAdminSupabaseClient()

  const [invoices, projectsRes, suppliersRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb.from('invoices')
        .select('*')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false })
    ),
    supabase.from('projects').select('id, code, name').eq('company_id', activeCompanyId).is('deleted_at', null).neq('status', 'cancelado'),
    supabase.from('suppliers').select('nif, name').eq('company_id', activeCompanyId).is('deleted_at', null),
  ])

  const projects = (projectsRes.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
  }))

  const suppliers = (suppliersRes.data ?? []).map((s) => ({
    value: s.nif,
    label: `${s.nif} - ${s.name}`,
  }))

  // Verificador algorítmico sobre facturas — milisegundos por fila
  const invoiceVerifications = batchVerifyInvoices(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoices as any[]) ?? [],
  )

  return (
    <InvoicesView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={invoices as any}
      projects={projects}
      suppliers={suppliers}
      verifications={invoiceVerifications}
    />
  )
}
