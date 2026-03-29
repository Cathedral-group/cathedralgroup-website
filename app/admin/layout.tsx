import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminLayoutClient from '@/components/admin/AdminLayoutClient'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check if we're on the login page (don't protect it)
  // The login page handles its own auth flow

  let isAuthenticated = false
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    isAuthenticated = !!user
  } catch {
    isAuthenticated = false
  }

  return (
    <div className="bg-neutral-50">
      {isAuthenticated ? (
        <AdminLayoutClient>{children}</AdminLayoutClient>
      ) : (
        <>{children}</>
      )}
    </div>
  )
}
