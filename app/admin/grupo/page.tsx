import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import GrupoView from './GrupoView'

export const dynamic = 'force-dynamic'

export default async function GrupoPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  return <GrupoView />
}
