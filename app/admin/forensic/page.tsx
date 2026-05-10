import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ForensicView from './ForensicView'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'

export default async function ForensicPage() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) redirect('/admin/login')

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // Cargar factura_forensic + datos básicos de invoice (filtrado por empresa)
  const [forensicRes, invoicesRes] = await Promise.all([
    supabase
      .from('factura_forensic')
      .select(
        'id, invoice_id, score, pdf_alerts, email_alerts, numeracion_alerts, duplicados_alerts, decision, reviewed_at, notes, created_at',
      )
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => r, () => ({ data: [], error: null })),
    supabase
      .from('invoices')
      .select('id, number, supplier_nif, empresa, amount_total, issue_date, direction, original_filename, drive_url, review_status, needs_review, deleted_at, created_at')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000)
      .then((r) => r, () => ({ data: [], error: null })),
  ])

  const invoiceById: Record<string, NonNullable<(typeof invoicesRes.data)>[number]> = {}
  for (const inv of (invoicesRes.data ?? [])) {
    if (inv?.id) invoiceById[inv.id as string] = inv
  }

  const rows = (forensicRes.data ?? [])
    .map((f) => {
      const inv = f.invoice_id ? invoiceById[f.invoice_id as string] : null
      if (!inv) return null
      const totalAlerts =
        (f.pdf_alerts?.length ?? 0) +
        (f.email_alerts?.length ?? 0) +
        (f.numeracion_alerts?.length ?? 0) +
        (f.duplicados_alerts?.length ?? 0)
      return {
        forensic_id: f.id as string,
        invoice_id: f.invoice_id as string,
        score: f.score as number | null,
        pdf_alerts: (f.pdf_alerts as string[] | null) ?? null,
        email_alerts: (f.email_alerts as string[] | null) ?? null,
        numeracion_alerts: (f.numeracion_alerts as string[] | null) ?? null,
        duplicados_alerts: (f.duplicados_alerts as string[] | null) ?? null,
        decision: (f.decision as string | null) ?? null,
        reviewed_at: (f.reviewed_at as string | null) ?? null,
        notes: (f.notes as string | null) ?? null,
        forensic_created_at: f.created_at as string,
        total_alerts: totalAlerts,
        invoice_number: (inv.number as string | null) ?? null,
        supplier_nif: (inv.supplier_nif as string | null) ?? null,
        empresa: (inv.empresa as string | null) ?? null,
        amount_total: (inv.amount_total as number | null) ?? null,
        issue_date: (inv.issue_date as string | null) ?? null,
        direction: (inv.direction as string | null) ?? null,
        original_filename: (inv.original_filename as string | null) ?? null,
        drive_url: (inv.drive_url as string | null) ?? null,
        review_status: (inv.review_status as string | null) ?? null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return <ForensicView rows={rows} userEmail={data.user.email ?? 'admin'} />
}
