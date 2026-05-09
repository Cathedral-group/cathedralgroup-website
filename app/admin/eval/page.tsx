import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import EvalView from './EvalView'

export default async function EvalPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [snapshot7Res, snapshot30Res, snapshot365Res, historyRes] = await Promise.all([
    supabase.rpc('eval_structural_snapshot', { p_window_days: 7 }),
    supabase.rpc('eval_structural_snapshot', { p_window_days: 30 }),
    supabase.rpc('eval_structural_snapshot', { p_window_days: 365 }),
    supabase
      .from('eval_runs')
      .select('id, run_at, run_type, scope, metrics, notes')
      .order('run_at', { ascending: false })
      .limit(30)
      .then((r) => r, () => ({ data: [], error: null })),
  ])

  return (
    <EvalView
      snapshot7={(snapshot7Res.data as Record<string, unknown> | null) ?? null}
      snapshot30={(snapshot30Res.data as Record<string, unknown> | null) ?? null}
      snapshot365={(snapshot365Res.data as Record<string, unknown> | null) ?? null}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history={(historyRes.data ?? []) as any}
      userEmail={data.user.email ?? 'admin'}
    />
  )
}
