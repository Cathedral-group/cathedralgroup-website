'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import NotificationBanner from './NotificationBanner'

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return (
    <>
      <AdminSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

      {/* Mobile top bar with hamburger */}
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
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50"
          >
            {refreshing ? '↻' : '↻ Refrescar'}
          </button>
          <a href="/admin" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">
            Dashboard
          </a>
        </div>
      </div>

      {/* Main content */}
      <main className="min-h-dvh bg-neutral-50 p-4 pt-18 md:p-8 md:pt-8 md:ml-56">
        <NotificationBanner />
        {children}
      </main>
    </>
  )
}
