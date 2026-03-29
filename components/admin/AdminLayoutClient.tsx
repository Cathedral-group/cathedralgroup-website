'use client'

import { useState } from 'react'
import AdminSidebar from './AdminSidebar'

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  return (
    <div className="flex min-h-screen">
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
        <a href="/admin" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">
          Dashboard
        </a>
      </div>

      {/* Main content */}
      <main className="flex-1 p-4 pt-18 md:p-8 md:pt-8 md:ml-64">
        {children}
      </main>
    </div>
  )
}
