import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ReportsView from './ReportsView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

interface Invoice {
  id: string
  number: string | null
  direction: 'emitida' | 'recibida'
  doc_type: string | null
  amount_base: number | null
  amount_total: number | null
  vat_amount: number | null
  categoria_gasto: string | null
  es_gasto_general: boolean
  linea_estructura: string | null
  issue_date: string | null
  due_date: string | null
  payment_date: string | null
  payment_status: string | null
  created_at: string | null
}

interface VatQuarterly {
  id: string
  year: number
  quarter: number
  vat_repercutido: number | null
  vat_soportado: number | null
  cuota_a_ingresar: number | null
  status: string | null
}

export default async function InformesPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const [invoices, vatData] = await Promise.all([
    fetchAllRows<Invoice>((sb) =>
      sb
        .from('invoices')
        .select('id, number, direction, doc_type, amount_base, amount_total, vat_amount, categoria_gasto, es_gasto_general, linea_estructura, issue_date, due_date, payment_date, payment_status, created_at')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false })
    ),
    supabase
      .from('vat_quarterly')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('year', { ascending: false })
      .order('quarter', { ascending: false })
      .then((r) => r.data),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Informes Financieros</h1>
      </div>
      <ReportsView
        invoices={invoices as Invoice[]}
        vatQuarterly={(vatData || []) as VatQuarterly[]}
      />
    </div>
  )
}
