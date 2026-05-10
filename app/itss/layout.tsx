import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Acceso ITSS — Cathedral Group',
  description: 'Acceso para Inspección de Trabajo y Seguridad Social',
  robots: { index: false, follow: false },
}

export default function ItssLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-stone-500">Cathedral Group</div>
          <div className="text-sm font-medium text-stone-900">
            Acceso Inspección de Trabajo y Seguridad Social
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-stone-400">
        Endpoint dedicado al cumplimiento del art. 34.9 ET y RD-Ley 8/2019. Acceso read-only
        auditado.
      </footer>
    </div>
  )
}
