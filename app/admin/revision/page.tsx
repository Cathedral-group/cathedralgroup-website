import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import RevisionView from './RevisionView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function RevisionPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // email_audit_attempts es global (allowlist) — no se filtra por company
  const [pending, pendingDocs, pendingQuotes, projectsRes, suppliersRes, orphansRes, forensicRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('*')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
        .or('needs_review.eq.true,doc_type.eq.otro,review_status.eq.pendiente,review_status.eq.revisado,review_status.eq.error,ai_confidence.lt.0.7')
        .order('created_at', { ascending: false })
    ),
    // Documentos NO-factura pendientes de revisar. Antes leía la tabla `documents`
    // (legacy, VACÍA) → siempre 0. Ahora desde el matview `documents_registry`, que
    // unifica TODAS las tablas tipadas (escrituras, notas simples, certificados,
    // contratos, licencias, seguros, presupuestos, albaranes, informes, modelos
    // fiscales, justificantes, otros…). Se excluye la familia-factura (ya está en
    // `pending`/invoices) y nóminas (se revisan en Personal). source_id→id para
    // enlazar a la superficie de revisión canónica /admin/documentos/{source_table}/{id}.
    // OJO: el matview lo refresca pg_cron (jobid 11) cada 5 min → un doc recién
    // subido puede tardar hasta ~5 min en aparecer aquí.
    supabase
      .from('documents_registry')
      .select('id:source_id, source_table, doc_type, ai_confidence, review_status, created_at, original_filename, contraparte_principal, drive_url, fecha_relevante')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .eq('review_status', 'pendiente')
      .not('doc_type', 'in', '(factura,rectificativa,abono,proforma,ticket,nomina)')
      .order('created_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('*')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .eq('direction', 'recibida')
      .or('needs_review.eq.true,review_status.eq.pendiente,review_status.eq.revisado,review_status.eq.error,ai_confidence.lt.0.7')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id, code, name').eq('company_id', activeCompanyId).is('deleted_at', null),
    supabase.from('suppliers').select('nif, name').eq('company_id', activeCompanyId).is('deleted_at', null),
    // Huérfanos persistentes (allowlist global, sin company_id)
    supabase
      .from('email_audit_attempts')
      .select('id, message_id, gmail_account, subject, from_address, received_at, attempt_count, last_attempt_at, last_error, created_at')
      .eq('status', 'persistent_orphan')
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(500)
      .then((r) => r, () => ({ data: [], error: null })),
    // Score forensic por factura — filtrar por company
    supabase
      .from('factura_forensic')
      .select('invoice_id, score, pdf_alerts, email_alerts, numeracion_alerts, duplicados_alerts, decision')
      .eq('company_id', activeCompanyId)
      .then((r) => r, () => ({ data: [], error: null })),
  ])

  const projects = (projectsRes.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
    code: p.code ?? '',
  }))

  const suppliers = (suppliersRes.data ?? []).map((s) => ({
    value: s.nif,
    label: `${s.nif} - ${s.name}`,
  }))

  // Mapear score forensic por invoice_id para lookup rápido en RevisionView
  const forensicByInvoice: Record<string, {
    score: number | null
    pdf_alerts: string[] | null
    email_alerts: string[] | null
    numeracion_alerts: string[] | null
    duplicados_alerts: string[] | null
    decision: string | null
  }> = {}
  for (const f of (forensicRes.data ?? [])) {
    if (f?.invoice_id) {
      forensicByInvoice[f.invoice_id as string] = {
        score: f.score ?? null,
        pdf_alerts: f.pdf_alerts ?? null,
        email_alerts: f.email_alerts ?? null,
        numeracion_alerts: f.numeracion_alerts ?? null,
        duplicados_alerts: f.duplicados_alerts ?? null,
        decision: f.decision ?? null,
      }
    }
  }

  return (
    <RevisionView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={pending as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingDocuments={(pendingDocs.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingQuotes={(pendingQuotes.data ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrphans={(orphansRes.data ?? []) as any}
      forensicByInvoice={forensicByInvoice}
      projects={projects}
      suppliers={suppliers}
      userEmail={data.user.email ?? 'admin'}
    />
  )
}
