import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import SistemaView from './SistemaView'

export const dynamic = 'force-dynamic'

export default async function SistemaPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  return <SistemaView />
}
