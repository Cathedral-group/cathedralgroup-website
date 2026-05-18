import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import UploadView from './UploadView'

export default async function UploadPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user?.email) redirect('/admin/login')
  if (!isAdminEmail(data.user.email)) redirect('/admin/login')

  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('code', { ascending: true })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide">Subir documento</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sube facturas, tickets, albaranes y otros documentos desde cámara móvil o arrastrando un
          archivo. El sistema extraerá los datos automáticamente con OCR.
        </p>
      </div>

      <UploadView projects={projects || []} />
    </div>
  )
}
