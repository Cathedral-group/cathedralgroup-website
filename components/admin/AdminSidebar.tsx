'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin', icon: '📊' },
  { label: 'Leads', href: '/admin/leads', icon: '📩' },
  { label: 'Proyectos', href: '/admin/proyectos', icon: '🏗️' },
  { label: 'Clientes', href: '/admin/clientes', icon: '👤' },
  { label: 'Proveedores', href: '/admin/proveedores', icon: '🔧' },
  { label: 'Facturas', href: '/admin/facturas', icon: '📄' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-neutral-200 flex flex-col z-40">
      {/* Header */}
      <div className="p-6 border-b border-neutral-100">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Cathedral Group</p>
        <p className="text-sm font-medium mt-1">Panel Admin</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map(({ label, href, icon }) => {
          const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href))
          return (
            <a
              key={href}
              href={href}
              className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium border-r-2 border-primary'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </a>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-6 border-t border-neutral-100">
        <button
          onClick={handleLogout}
          className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-red-500 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
