import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import ProjectDocumentsView from './ProjectDocumentsView'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function ProjectDocumentsPage({ params }: PageProps) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const { code } = await params
  const supabase = createAdminSupabaseClient()

  // Localizar proyecto por code
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('code', code)
    .is('deleted_at', null)
    .maybeSingle()

  if (!project) notFound()

  // Cargar todos los docs del proyecto en paralelo (3 tablas destino del clasificador)
  const [invoices, quotes, documents, supplier_subfolders] = await Promise.all([
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('id, number, concept, direction, doc_type, amount_base, vat_amount, amount_total, payment_status, issue_date, due_date, supplier_nif, empresa, ai_data, ai_confidence, needs_review, review_status, drive_url, original_filename, source, created_at')
        .eq('project_id', project.id)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false, nullsFirst: false })
    ),
    fetchAllRows((sb) =>
      sb
        .from('quotes')
        .select('id, number, concept, direction, total, subtotal, vat_total, valid_until, supplier_nif, empresa, ai_confidence, needs_review, review_status, drive_url, original_filename, source, status, issue_date, created_at')
        .eq('project_id', project.id)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false, nullsFirst: false })
    ),
    fetchAllRows((sb) =>
      sb
        .from('documents')
        .select('id, titulo, doc_type, doc_category, fecha_documento, fecha_vencimiento, importe, ai_confidence, needs_review, drive_url, original_filename, source, resumen_ia, created_at')
        .eq('project_id', project.id)
        .is('deleted_at', null)
        .order('fecha_documento', { ascending: false, nullsFirst: false })
    ),
    supabase
      .from('project_subfolders')
      .select('subfolder_name, drive_folder_id')
      .eq('project_id', project.id)
      .order('subfolder_name'),
  ])

  return (
    <ProjectDocumentsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project={project as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={invoices as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      quotes={quotes as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents={documents as any}
      subfolders={supplier_subfolders.data || []}
    />
  )
}
