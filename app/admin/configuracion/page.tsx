import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import ConfigView from './ConfigView'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()
  const { data: coefficients } = await supabase
    .from('quality_coefficients')
    .select('*')
    .order('coefficient')

  return <ConfigView initial={coefficients ?? []} />
}
