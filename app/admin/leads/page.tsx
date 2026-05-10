import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import LeadsTable from './LeadsTable'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function LeadsPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Leads</h1>
        <p className="text-sm text-neutral-500">{leads?.length || 0} resultados</p>
      </div>

      <LeadsTable leads={leads || []} />
    </div>
  )
}
