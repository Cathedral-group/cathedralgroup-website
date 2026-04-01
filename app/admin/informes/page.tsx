import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ReportsView from './ReportsView'

interface Invoice {
  id: string
  number: string | null
  direction: 'emitida' | 'recibida'
  amount_base: number | null
  amount_total: number | null
  vat_amount: number | null
  categoria_gasto: string | null
  issue_date: string | null
  due_date: string | null
  payment_date: string | null
  payment_status: string | null
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

  const supabase = createAdminSupabaseClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, number, direction, amount_base, amount_total, vat_amount, categoria_gasto, issue_date, due_date, payment_date, payment_status')
    .is('deleted_at', null)
    .order('issue_date', { ascending: false })
    

  const { data: vatData } = await supabase
    .from('vat_quarterly')
    .select('*')
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Informes Financieros</h1>
      </div>
      <ReportsView
        invoices={(invoices || []) as Invoice[]}
        vatQuarterly={(vatData || []) as VatQuarterly[]}
      />
    </div>
  )
}
