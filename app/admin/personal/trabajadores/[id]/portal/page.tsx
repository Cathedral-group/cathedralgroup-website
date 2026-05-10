import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import WorkerPortalManagerView from './WorkerPortalManagerView'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function WorkerPortalPage({ params }: PageProps) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const { id } = await params
  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: employee } = await supabase
    .from('employees')
    .select('id, nombre, nif, email, company_id')
    .eq('id', id)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!employee) notFound()

  const { data: tokens } = await supabase
    .from('worker_portal_access')
    .select(
      'id, expires_at, revoked_at, revoked_reason, created_at, created_by_email, last_used_at, last_used_ip, uses_count, notes',
    )
    .eq('employee_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <WorkerPortalManagerView
      employee={employee}
      tokens={tokens ?? []}
    />
  )
}
