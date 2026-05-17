import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DiagnosesView from './DiagnosesView'

export const dynamic = 'force-dynamic'

export default async function DiagnosesPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()
  const { data } = await supabase
    .from('agent_diagnoses')
    .select(
      'id, dispatch_id, agent_name, diagnosis, proposed_fix, confidence, citations, model_version, tokens_used, cost_usd, status, is_test, created_at',
    )
    .in('status', ['pending', 'approved', 'rejected'])
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(100)

  return <DiagnosesView initialDiagnoses={data ?? []} />
}
