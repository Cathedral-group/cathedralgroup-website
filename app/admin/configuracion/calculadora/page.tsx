import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import CalculadoraPreciosView, { type PricingConfigRow } from './CalculadoraPreciosView'

export const dynamic = 'force-dynamic'

export default async function CalculadoraPreciosPage() {
  const authClient = await createServerSupabaseClient()
  const { data: auth, error: authErr } = await authClient.auth.getUser()
  if (authErr || !auth?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('pricing_config')
    .select('*')
    .order('category')
    .order('sort_order')

  return (
    <CalculadoraPreciosView
      rows={(error ? [] : data ?? []) as PricingConfigRow[]}
      tableMissing={!!error}
      userEmail={auth.user.email ?? ''}
    />
  )
}
