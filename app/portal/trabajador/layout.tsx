import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dietario — Cathedral Group',
  description: 'Portal de partes de horas para trabajadores',
  robots: { index: false, follow: false },
}

export default function PortalTrabajadorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500">Cathedral Group</div>
            <div className="text-sm font-medium text-stone-900">Dietario · partes de horas</div>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto max-w-2xl px-4 py-6 text-center text-xs text-stone-400">
        Solo para uso del trabajador. Si has llegado aquí por error, cierra esta página.
      </footer>
    </div>
  )
}
