import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import TicketsAdminView from './TicketsAdminView'

interface AttachmentRow {
  id: string
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  size_bytes: number | null
  doc_type: string
  status: string
  worker_notas: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by_email: string | null
  reviewer_action: string | null
  invoice_id: string | null
  device_geo_lat: number | null
  device_geo_lng: number | null
  extracted_data: Record<string, unknown> | null
  extracted_at: string | null
  extraction_provider: string | null
  employee: { id: string; nombre: string | null; nif: string | null }
    | { id: string; nombre: string | null; nif: string | null }[]
    | null
  project: { id: string; code: string; name: string | null }
    | { id: string; code: string; name: string | null }[]
    | null
}

export default async function TicketsAdminPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  const { data: attachments } = await supabase
    .from('worker_attachments')
    .select(
      `id, storage_path, storage_bucket, mime_type, size_bytes, doc_type, status,
       worker_notas, created_at, reviewed_at, reviewed_by_email, reviewer_action, invoice_id,
       device_geo_lat, device_geo_lng,
       extracted_data, extracted_at, extraction_provider,
       employee:employee_id (id, nombre, nif),
       project:project_id (id, code, name)`,
    )
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name')
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .order('code', { ascending: false })

  // Generar signed URLs en paralelo
  const attachmentsWithUrl = await Promise.all(
    ((attachments ?? []) as AttachmentRow[]).map(async (a) => {
      const { data: signed } = await supabase.storage
        .from(a.storage_bucket || 'worker-receipts')
        .createSignedUrl(a.storage_path, 3600)
      return { ...a, preview_url: signed?.signedUrl ?? null }
    }),
  )

  return (
    <TicketsAdminView
      initialAttachments={attachmentsWithUrl}
      projects={projects ?? []}
    />
  )
}
