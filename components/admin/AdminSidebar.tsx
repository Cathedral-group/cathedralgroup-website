'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin', icon: '📊' },
  { label: 'Leads', href: '/admin/leads', icon: '📩' },
  { label: 'Proyectos', href: '/admin/proyectos', icon: '🏗️' },
  { label: 'Operaciones', href: '/admin/operaciones', icon: '🏠' },
  { label: 'Clientes', href: '/admin/clientes', icon: '👤' },
  { label: 'Proveedores', href: '/admin/proveedores', icon: '🔧' },
  { label: 'Facturas', href: '/admin/facturas', icon: '📄' },
  { label: 'Revisión', href: '/admin/revision', icon: '🔍' },
  { label: 'Presupuestos', href: '/admin/presupuestos', icon: '📋' },
  { label: 'Informes', href: '/admin/informes', icon: '📈' },
  { label: 'Papelera', href: '/admin/papelera', icon: '🗑️' },
  { label: 'Seguridad', href: '/admin/seguridad', icon: '🔒' },
  { label: 'Configuración', href: '/admin/configuracion', icon: '⚙️' },
]

interface AdminSidebarProps {
  isOpen?: boolean
  onToggle?: () => void
}

export default function AdminSidebar({ isOpen = false, onToggle }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1500)
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-neutral-200 flex flex-col z-40 transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0`}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Cathedral Group</p>
            <p className="text-sm font-medium mt-1">Panel Admin</p>
          </div>
          {/* Mobile close button */}
          <button
            onClick={onToggle}
            className="md:hidden p-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors"
            aria-label="Cerrar menú"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map(({ label, href, icon }) => {
            const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href))
            return (
              <a
                key={href}
                href={href}
                onClick={() => {
                  // Close sidebar on mobile when navigating
                  if (onToggle && window.innerWidth < 768) {
                    onToggle()
                  }
                }}
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
        <div className="p-6 border-t border-neutral-100 flex items-center justify-between gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50"
            title="Refrescar datos"
          >
            {refreshing ? '↻ Refrescando...' : '↻ Refrescar'}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-red-500 transition-colors"
          >
            Salir
          </button>
        </div>
      </aside>
    </>
  )
}
