import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import ConfigView from './ConfigView'

type Params = { params: Promise<{ token: string }> }

export default async function ConfiguracionPage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const { data: tokenInfo } = await supabase
    .from('worker_portal_access')
    .select('pin_set_at')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()

  return (
    <ConfigView
      token={token}
      pinSetAt={tokenInfo?.pin_set_at ?? null}
      employeeName={validation.employee_nombre ?? ''}
    />
  )
}
