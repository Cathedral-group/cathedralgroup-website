import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AuditLogView from './AuditLogView'

export default async function SeguridadPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()
  const { data: logs } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-medium uppercase tracking-wide">Seguridad</h1>
        <p className="text-xs text-neutral-400 mt-1">Registro de actividad del panel de administración</p>
      </div>
      <AuditLogView logs={logs ?? []} />
    </div>
  )
}
