import { notFound } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import TicketsView from './TicketsView'

type Params = { params: Promise<{ token: string }> }

export default async function TicketsPage({ params }: Params) {
  const { token } = await params
  if (!token || token.length < 30) notFound()

  const supabase = createAdminSupabaseClient()
  const { data: validation } = await supabase.rpc('validate_and_track_worker_token', {
    p_token: token,
    p_ip: null,
    p_user_agent: null,
  })
  if (!validation?.valid) notFound()

  const employeeId: string = validation.employee_id
  const companyId: string = validation.company_id

  const [projectsRes, attachmentsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('code', { ascending: false })
      .limit(50),
    supabase
      .from('worker_attachments')
      .select(
        `id, storage_path, storage_bucket, mime_type, doc_type, status, worker_notas, created_at,
         project:project_id (code, name)`,
      )
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Generar signed URLs para previews
  const attachmentsWithUrl = await Promise.all(
    (attachmentsRes.data ?? []).map(async (a) => {
      const { data: signed } = await supabase.storage
        .from(a.storage_bucket)
        .createSignedUrl(a.storage_path, 3600)
      return { ...a, preview_url: signed?.signedUrl ?? null }
    }),
  )

  return (
    <TicketsView
      token={token}
      employee={{ nombre: validation.employee_nombre ?? '' }}
      projects={projectsRes.data ?? []}
      initialAttachments={attachmentsWithUrl}
    />
  )
}
