import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import RevisionView from './RevisionView'

export default async function RevisionPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const supabase = createAdminSupabaseClient()

  const [pending, pendingDocs, pendingQuotes, projectsRes, suppliersRes, orphansRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select('*')
        .is('deleted_at', null)
        .or('needs_review.eq.true,doc_type.eq.otro,review_status.eq.pendiente,review_status.eq.revisado,review_status.eq.error,ai_confidence.lt.0.7')
        .order('created_at', { ascending: false })
    ),
    supabase
      .from('documents')
      .select('*')
      .is('deleted_at', null)
      .or('needs_review.eq.true,doc_type.eq.otro,source.eq.email_automatico,source.eq.drive_retroactivo')
      .order('created_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('*')
      .is('deleted_at', null)
      .eq('direction', 'recibida')
      .or('needs_review.eq.true,review_status.eq.pendiente,review_status.eq.revisado,review_status.eq.error,ai_confidence.lt.0.7')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id, code, name').is('deleted_at', null),
    supabase.from('suppliers').select('nif, name').is('deleted_at', null),
    // Huérfanos persistentes detectados por el cron auditor n8n.
    // Tolera ausencia de tabla (migración pendiente de aplicar) → array vacío.
    supabase
      .from('email_audit_attempts')
      .select('id, message_id, gmail_account, subject, from_address, received_at, attempt_count, last_attempt_at, last_error, created_at')
      .eq('status', 'persistent_orphan')
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(500)
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
      projects={projects}
      suppliers={suppliers}
      userEmail={data.user.email ?? 'admin'}
    />
  )
}
