'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import AdminSidebar from './AdminSidebar'
import AdminTopBar from './AdminTopBar'
import NotificationBell from './NotificationBell'
import UploadQueueFloater from './UploadQueueFloater'
import { UploadQueueProvider } from '@/lib/upload-queue-context'
import { ZONES, SISTEMA_ITEMS } from './admin-nav'

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Rail contextual plegable (solo desktop). Default expandido para evitar
  // hydration mismatch; el valor real de localStorage se lee en useEffect.
  const [railCollapsed, setRailCollapsed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Leer preferencia persistida del rail tras montar (no en render → sin mismatch).
  useEffect(() => {
    try {
      if (localStorage.getItem('admin:railCollapsed') === '1') setRailCollapsed(true)
    } catch {
      // localStorage no disponible (SSR/modo privado) → se queda expandido
    }
  }, [])

  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('admin:railCollapsed', next ? '1' : '0') } catch { /* noop */ }
      return next
    })
  }

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
    // Limpiar timer anterior si el usuario click rápido varias veces
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => setRefreshing(false), 1500)
  }

  // Cleanup del timer al unmount (evita setState en componente desmontado)
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  // Set bg on html+body so the neutral-50 covers the full scrollable area (including horizontal overflow)
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.documentElement.style.backgroundColor = '#fafafa'
    document.body.style.backgroundColor = '#fafafa'
    return () => {
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = prev
    }
  }, [])

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  // Cerrar el drawer móvil al navegar
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // Login y reset-password van SIEMPRE sin chrome del panel (aunque exista sesión de
  // recovery aal1, que el layout server cuenta como autenticada → mostraba el sidebar
  // en la página de reset y desviaba al usuario a un challenge MFA en mitad del flujo).
  const noChrome = pathname === '/admin/login' || pathname === '/admin/reset-password' || pathname === '/admin/mfa' || pathname === '/admin/mfa/setup'
  if (noChrome) return <>{children}</>

  return (
    <UploadQueueProvider>
      {/* Barra superior global (nivel 1 — desktop) */}
      <AdminTopBar railCollapsed={railCollapsed} onToggleRail={toggleRail} />

      {/* Rail contextual de la zona activa (nivel 2 — desktop) */}
      <AdminSidebar collapsed={railCollapsed} />

      {/* Barra superior móvil con hamburguesa */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between h-14 px-4 bg-white border-b border-neutral-200 md:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-2 bg-neutral-100 rounded hover:bg-primary/20 text-neutral-700 hover:text-neutral-900 transition-colors"
            aria-label="Abrir menú"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Cathedral Group</span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50"
          >
            {refreshing ? '↻' : '↻ Refrescar'}
          </button>
          <a href="/admin" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">
            Inicio
          </a>
        </div>
      </div>

      {/* Drawer móvil — TODAS las zonas como cabeceras NO colapsables + sub-items */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={toggleSidebar} />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white border-r border-neutral-200 flex flex-col">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <Link href="/admin" onClick={toggleSidebar} className="group">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Cathedral Group</p>
                <p className="text-sm font-semibold mt-0.5 text-neutral-800">Panel Admin</p>
              </Link>
              <button
                onClick={toggleSidebar}
                aria-label="Cerrar menú"
                className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {ZONES.map((zone) => (
                <div key={zone.key} className="mb-1">
                  <p className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 select-none">
                    {zone.label}
                  </p>
                  {zone.items.map((it) =>
                    it.disabled ? (
                      <div
                        key={it.href + it.label}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm text-neutral-300 cursor-not-allowed select-none"
                      >
                        <span className="flex-1">{it.label}</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                          Próximamente
                        </span>
                      </div>
                    ) : (
                      <Link
                        key={it.href + it.label}
                        href={it.href}
                        onClick={toggleSidebar}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-colors ${
                          pathname === it.href.split('?')[0]
                            ? 'bg-primary/8 text-primary font-semibold'
                            : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                        }`}
                      >
                        {it.label}
                      </Link>
                    ),
                  )}
                </div>
              ))}

              {/* Sistema (no es zona) */}
              <div className="mb-1 border-t border-neutral-100 mt-2 pt-1">
                <p className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 select-none">
                  Sistema
                </p>
                {SISTEMA_ITEMS.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={toggleSidebar}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-colors ${
                      pathname === it.href.split('?')[0]
                        ? 'bg-primary/8 text-primary font-semibold'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Contenido principal — offset: barra superior (14) + rail (56) en desktop */}
      <main className={`min-h-dvh bg-neutral-50 p-4 pt-18 md:p-8 md:pt-[4.5rem] transition-[margin] duration-200 ${railCollapsed ? 'md:ml-0' : 'md:ml-56'}`}>
        {children}
      </main>

      {/* Floater cola upload — visible cross-page cuando hay items */}
      <UploadQueueFloater />
    </UploadQueueProvider>
  )
}
