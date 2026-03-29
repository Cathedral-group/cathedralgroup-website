import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Área de Cliente — Cathedral Group',
  robots: { index: false, follow: false },
}

function fmtEur(val: number) {
  return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

interface CertPhase {
  number: number
  closed_at: string
  total_certified: number
  total_budget: number
  vat_pct: number
}

type Params = { params: Promise<{ token: string }> }

export default async function PortalPage({ params }: Params) {
  const { token } = await params
  const supabase = createAdminSupabaseClient()

  const { data: quote } = await supabase
    .from('quotes')
    .select('id, number, created_at, valid_until, total, subtotal, vat_total, project_id, client_id, certifications, status')
    .eq('portal_token', token)
    .is('deleted_at', null)
    .single()

  if (!quote) notFound()

  let clientName = ''
  if (quote.client_id) {
    const { data: c } = await supabase
      .from('clients')
      .select('name, company_name')
      .eq('id', quote.client_id)
      .single()
    if (c) clientName = (c.company_name || c.name) ?? ''
  }

  let projectName = ''
  if (quote.project_id) {
    const { data: p } = await supabase
      .from('projects')
      .select('code, name')
      .eq('id', quote.project_id)
      .single()
    if (p) projectName = `${p.code} — ${p.name}`
  }

  const certifications: CertPhase[] = Array.isArray(quote.certifications) ? quote.certifications : []
  const closedCerts = certifications.filter((c) => c.closed_at)

  return (
    <div className="min-h-screen bg-[#faf9f8] flex flex-col font-display">

      {/* Header */}
      <header className="bg-white border-b border-neutral-100 px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/logo.png" alt="Cathedral Group" className="h-7 w-auto" />
            <span className="text-sm font-light tracking-[.16em] text-neutral-700 uppercase hidden sm:block">
              Cathedral Group
            </span>
          </div>
          <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">
            Área de cliente
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-10">
        <div className="max-w-xl mx-auto space-y-6">

          {/* Greeting */}
          {clientName && (
            <p className="text-sm text-neutral-500 px-1">
              Hola, <span className="font-medium text-neutral-700">{clientName}</span>.
              Aquí puedes descargar todos los documentos de tu proyecto.
            </p>
          )}

          {/* Quote summary card */}
          <div className="bg-white rounded-xl border border-neutral-100 overflow-hidden shadow-sm">
            <div className="bg-[#f5f2ee] px-6 py-5 border-b border-[#e8e4e0]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold tracking-widest text-[#9b8f84] uppercase mb-1">Presupuesto</p>
                  <p className="text-2xl font-light text-neutral-800 tracking-tight">{quote.number}</p>
                  {projectName && (
                    <p className="text-xs text-[#9b8f84] mt-1">{projectName}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold tracking-widest text-[#9b8f84] uppercase mb-1">Total</p>
                  <p className="text-2xl font-light text-neutral-800 tracking-tight">{fmtEur(quote.total ?? 0)}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase mb-1">Emisión</p>
                <p className="text-sm text-neutral-700">{fmtDate(quote.created_at)}</p>
              </div>
              {quote.valid_until && (
                <div>
                  <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase mb-1">Válido hasta</p>
                  <p className="text-sm text-neutral-700">{fmtDate(quote.valid_until)}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase mb-1">Base imponible</p>
                <p className="text-sm text-neutral-700">{fmtEur(quote.subtotal ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase mb-1">IVA</p>
                <p className="text-sm text-neutral-700">{fmtEur(quote.vat_total ?? 0)}</p>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div>
            <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase mb-3 px-1">
              Documentos disponibles
            </p>
            <div className="space-y-2">

              {/* Quote PDF */}
              <a
                href={`/api/db/presupuesto-pdf?id=${quote.id}&portal_token=${token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white border border-neutral-100 rounded-xl px-5 py-4 hover:border-[#B4A898] hover:bg-white transition-all group shadow-sm"
              >
                <div className="w-9 h-9 rounded-lg bg-[#f5f2ee] flex items-center justify-center flex-shrink-0 group-hover:bg-[#ede8e3] transition-colors">
                  <svg className="w-4 h-4 text-[#9b8f84]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-700 group-hover:text-neutral-900">
                    Presupuesto {quote.number}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Emitido el {fmtDate(quote.created_at)}
                  </p>
                </div>
                <svg className="w-4 h-4 text-neutral-300 group-hover:text-[#B4A898] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>

              {/* Certification PDFs */}
              {closedCerts.map((cert) => (
                <a
                  key={cert.number}
                  href={`/api/db/presupuesto-pdf?id=${quote.id}&portal_token=${token}&type=certificacion&cert=${cert.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 bg-white border border-neutral-100 rounded-xl px-5 py-4 hover:border-[#B4A898] hover:bg-white transition-all group shadow-sm"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#f5f2ee] flex items-center justify-center flex-shrink-0 group-hover:bg-[#ede8e3] transition-colors">
                    <svg className="w-4 h-4 text-[#9b8f84]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-700 group-hover:text-neutral-900">
                      Certificación {cert.number}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Cerrada el {fmtDate(cert.closed_at)}
                      {cert.total_certified ? ` · ${fmtEur(cert.total_certified)}` : ''}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-neutral-300 group-hover:text-[#B4A898] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              ))}

              {closedCerts.length === 0 && (
                <p className="text-xs text-neutral-400 px-1 py-2">
                  Aún no hay certificaciones cerradas. Aparecerán aquí cuando estén disponibles.
                </p>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-100 bg-white px-6 py-5 mt-8">
        <div className="max-w-xl mx-auto text-center space-y-1">
          <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase">
            Cathedral House Investment SL
          </p>
          <p className="text-[10px] text-neutral-400">
            CIF B19761915 · <a href="mailto:administracion@cathedralgroup.es" className="hover:text-neutral-600 transition-colors">administracion@cathedralgroup.es</a>
          </p>
        </div>
      </footer>

    </div>
  )
}
