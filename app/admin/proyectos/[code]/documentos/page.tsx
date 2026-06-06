import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import ProjectDocumentsView from './ProjectDocumentsView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function ProjectDocumentsPage({ params }: PageProps) {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user) redirect('/admin/login')

  const { code } = await params
  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // Localizar proyecto por code (filtrado por empresa activa)
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
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
    fetchAllRows((sb) => {
      // documents_registry (vista en vivo). Replica la rama registry de
      // /api/admin/proyectos/[code]/documentos/route.ts: filtra por project_id
      // (+ property_id si el proyecto tiene inmueble asociado) y excluye
      // invoices/quotes (ya listados desde sus tablas tipadas arriba).
      const propertyId = (project as { property_id?: string | null }).property_id ?? null
      let q = sb
        .from('documents_registry')
        .select('source_id, source_table, doc_type, fecha_relevante, fecha_vencimiento, importe_principal, contraparte_principal, ai_confidence, drive_url, storage_path, original_filename')
        .is('deleted_at', null)
        .not('source_table', 'in', '(invoices,quotes)')
      q = propertyId
        ? q.or(`project_id.eq.${project.id},property_id.eq.${propertyId}`)
        : q.eq('project_id', project.id)
      return q.order('fecha_relevante', { ascending: false, nullsFirst: false })
    }),
    supabase
      .from('project_subfolders')
      .select('subfolder_name, drive_folder_id')
      .eq('project_id', project.id)
      .order('subfolder_name'),
  ])

  // Mapear registry → forma que espera ProjectDocumentsView (DocumentRow).
  // Campos que la vista no tiene en el registry (doc_category, needs_review,
  // source, resumen_ia) → null. El archivo se abre SIEMPRE por el endpoint
  // canónico (nunca drive_url/storage_path crudos).
  const documentsMapped = (documents as Record<string, unknown>[]).map((r) => {
    const sid = String(r.source_id)
    const sourceTable = String(r.source_table ?? 'documentos_otros')
    const hasFile = r.drive_url != null || r.storage_path != null
    return {
      id: sid,
      titulo: (r.contraparte_principal as string) ?? (r.original_filename as string) ?? null,
      doc_type: (r.doc_type as string) ?? null,
      doc_category: null,
      fecha_documento: (r.fecha_relevante as string) ?? null,
      fecha_vencimiento: (r.fecha_vencimiento as string) ?? null,
      importe: r.importe_principal == null ? null : Number(r.importe_principal),
      ai_confidence: r.ai_confidence == null ? null : Number(r.ai_confidence),
      needs_review: null,
      drive_url: hasFile
        ? `/api/admin/documentos/file?table=${encodeURIComponent(sourceTable)}&id=${encodeURIComponent(sid)}`
        : null,
      original_filename: (r.original_filename as string) ?? null,
      source: null,
      resumen_ia: null,
      created_at: '',
    }
  })

  return (
    <ProjectDocumentsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project={project as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={invoices as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      quotes={quotes as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents={documentsMapped as any}
      subfolders={supplier_subfolders.data || []}
    />
  )
}
