/**
 * /admin/sistema/mass-reprocess — Dashboard read-only mass reprocess runs.
 *
 * RSC: muestra estado tablas `mass_ingestion_runs` + `email_ingestion_log`.
 * Trigger workflows via UI n8n directo (manual). Esta página solo MONITOREO.
 *
 * Workflows relevantes:
 *   - DX2UE1ntcdC1ivVp · Mass Reprocess Gmail Histórico (manual)
 *   - wwDsESJrs3enXCra · Procesar Drive retroactivo (manual)
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const dynamic = 'force-dynamic'

interface RunRow {
  id: string
  source: string
  status: string
  gmail_account: string | null
  date_from: string | null
  date_to: string | null
  drive_folder_id: string | null
  total_items: number
  processed_items: number
  failed_items: number
  skipped_items: number
  started_at: string
  completed_at: string | null
  metadata: Record<string, unknown>
}

interface IngestRow {
  id: number
  gmail_account: string
  message_id: string
  filename: string | null
  status: string
  webhook_dispatched_at: string
  mass_run_id: string | null
  last_error: string | null
  attempts: number
}

export default async function MassReprocessPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user?.email) redirect('/admin/login')
  if (!isAdminEmail(userData.user.email)) redirect('/admin')

  const supabase = createAdminSupabaseClient()

  const [{ data: runs }, { data: failures }, { data: stats }] = await Promise.all([
    supabase
      .from('mass_ingestion_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('email_ingestion_log')
      .select('id, gmail_account, message_id, filename, status, webhook_dispatched_at, mass_run_id, last_error, attempts')
      .eq('status', 'failed')
      .order('webhook_dispatched_at', { ascending: false })
      .limit(20),
    supabase
      .from('email_ingestion_log')
      .select('gmail_account, status'),
  ])

  const runsList = (runs ?? []) as RunRow[]
  const failuresList = (failures ?? []) as IngestRow[]
  const statsList = (stats ?? []) as Array<{ gmail_account: string; status: string }>

  const statsByAccount = new Map<string, { processed: number; failed: number; skipped: number }>()
  for (const s of statsList) {
    const cur = statsByAccount.get(s.gmail_account) ?? { processed: 0, failed: 0, skipped: 0 }
    if (s.status === 'processed') cur.processed += 1
    else if (s.status === 'failed') cur.failed += 1
    else if (s.status === 'skipped') cur.skipped += 1
    statsByAccount.set(s.gmail_account, cur)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Mass Reprocess Dashboard</h1>
        <p className="mt-1 text-sm text-stone-600">
          Monitoreo runs masivos Gmail histórico + Drive retroactivo. Trigger workflows desde{' '}
          <a
            href="https://n8n.cathedralgroup.es"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            n8n UI
          </a>
          .
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-stone-800">Workflows disponibles</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded border border-stone-200 bg-white p-4">
            <h3 className="font-medium text-stone-900">Gmail Histórico</h3>
            <p className="mt-1 text-xs text-stone-500">
              ID: <code className="rounded bg-stone-100 px-1">DX2UE1ntcdC1ivVp</code>
            </p>
            <p className="mt-2 text-sm text-stone-700">
              7 cuentas Gmail Cathedral, lookback desde 14/06/2024. ~3000 emails estimados.
            </p>
            <a
              href="https://n8n.cathedralgroup.es/workflow/DX2UE1ntcdC1ivVp"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
            >
              Abrir en n8n →
            </a>
          </div>
          <div className="rounded border border-stone-200 bg-white p-4">
            <h3 className="font-medium text-stone-900">Drive Retroactivo</h3>
            <p className="mt-1 text-xs text-stone-500">
              ID: <code className="rounded bg-stone-100 px-1">wwDsESJrs3enXCra</code>
            </p>
            <p className="mt-2 text-sm text-stone-700">
              Carpeta <code>_RETROACTIVO_DRIVE_VIEJO/</code> Drive nuevo (138 PDFs).
            </p>
            <a
              href="https://n8n.cathedralgroup.es/workflow/wwDsESJrs3enXCra"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
            >
              Abrir en n8n →
            </a>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-stone-800">Runs recientes</h2>
        {runsList.length === 0 ? (
          <p className="text-sm text-stone-500">Sin runs todavía. Trigger un workflow para empezar.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-600">
                <tr>
                  <th className="px-3 py-2">Run ID</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Account/Folder</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">OK</th>
                  <th className="px-3 py-2 text-right">Fail</th>
                  <th className="px-3 py-2 text-right">Skip</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {runsList.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.id.slice(0, 25)}</td>
                    <td className="px-3 py-2">{r.source}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'rounded px-2 py-0.5 text-xs ' +
                          (r.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : r.status === 'running'
                              ? 'bg-blue-100 text-blue-800'
                              : r.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-stone-100 text-stone-700')
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.gmail_account ?? r.drive_folder_id?.slice(0, 20) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.total_items}</td>
                    <td className="px-3 py-2 text-right font-mono text-green-700">
                      {r.processed_items}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-700">
                      {r.failed_items}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-stone-500">
                      {r.skipped_items}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-500">
                      {new Date(r.started_at).toLocaleString('es-ES')}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-500">
                      {r.completed_at ? new Date(r.completed_at).toLocaleString('es-ES') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-stone-800">Stats por cuenta Gmail</h2>
        {statsByAccount.size === 0 ? (
          <p className="text-sm text-stone-500">Sin items procesados todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-600">
                <tr>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2 text-right">Procesados</th>
                  <th className="px-3 py-2 text-right">Fallados</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {Array.from(statsByAccount.entries())
                  .sort((a, b) => b[1].processed - a[1].processed)
                  .map(([acc, s]) => (
                    <tr key={acc} className="hover:bg-stone-50">
                      <td className="px-3 py-2 font-mono text-xs">{acc}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{s.processed}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-700">{s.failed}</td>
                      <td className="px-3 py-2 text-right font-mono text-stone-500">{s.skipped}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-stone-800">
          DLQ — últimos 20 fallos ({failuresList.length})
        </h2>
        {failuresList.length === 0 ? (
          <p className="text-sm text-stone-500">Sin fallos. ✓</p>
        ) : (
          <div className="overflow-x-auto rounded border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-left text-xs text-red-700">
                <tr>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2">Message ID</th>
                  <th className="px-3 py-2">Filename</th>
                  <th className="px-3 py-2 text-right">Intentos</th>
                  <th className="px-3 py-2">Error</th>
                  <th className="px-3 py-2">Cuando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {failuresList.map((f) => (
                  <tr key={f.id} className="hover:bg-stone-50">
                    <td className="px-3 py-2 text-xs">{f.gmail_account}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.message_id.slice(0, 18)}</td>
                    <td className="px-3 py-2 text-xs">{f.filename ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.attempts}</td>
                    <td className="px-3 py-2 text-xs text-red-700">
                      {f.last_error?.slice(0, 80) ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-500">
                      {new Date(f.webhook_dispatched_at).toLocaleString('es-ES')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-8 border-t border-stone-200 pt-4 text-xs text-stone-500">
        Read-only dashboard. Triggers desde{' '}
        <a
          href="https://n8n.cathedralgroup.es"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          n8n UI
        </a>
        . Refresh manual (F5). Próxima iteración: auto-refresh + trigger desde aquí + Project Classifier integration.
      </footer>
    </div>
  )
}
