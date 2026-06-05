'use client'

/**
 * AdminTopBar — barra superior global del panel (nivel 1 de la navegación).
 *
 * 7 zonas de negocio + cluster derecho (búsqueda, campana, engranaje "Sistema",
 * chip de usuario). La zona activa se deriva del pathname. "Sistema" NO es una
 * zona: vive detrás del engranaje.
 *
 * Los badges-resumen por zona reutilizan useAdminBadgeCounts() (mismas queries
 * que el rail). El badge de Documentos suma además la cola de subida.
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import NotificationBell from './NotificationBell'
import { useAdminBadgeCounts } from '@/lib/use-admin-badge-counts'
import { useUploadQueueCounts } from '@/lib/upload-queue-context'
import { ZONES, SISTEMA_ITEMS, isZoneActive, type ZoneKey } from './admin-nav'

export default function AdminTopBar({
  railCollapsed = false,
  onToggleRail,
}: {
  railCollapsed?: boolean
  onToggleRail?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const counts = useAdminBadgeCounts()
  const upload = useUploadQueueCounts()
  const [gearOpen, setGearOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  // Rollup de contadores por zona (resumen). Per-doc-type no tiene fuente de
  // conteo, así que Documentos solo suma revisión + huérfanos + cola subida.
  const zoneBadge = (zone: ZoneKey): number => {
    switch (zone) {
      case 'documentos':
        return (counts.revisionCount ?? 0) + (counts.orphanCount ?? 0) + upload.total
      case 'equipo':
        return (
          (counts.absencesPending ?? 0) +
          (counts.ticketsPending ?? 0) +
          (counts.expensesPending ?? 0) +
          (counts.partesAnomalia ?? 0)
        )
      case 'finanzas':
        return 0 // sin contador accionable propio hoy
      default:
        return 0
    }
  }
  // "Sistema" (engranaje): críticas + warnings + diagnósticos agentes
  const sistemaBadge =
    (counts.notifCritical ?? 0) + (counts.notifWarning ?? 0) + (counts.agentDiagnosesPending ?? 0)

  // Cerrar dropdowns al hacer click fuera / al navegar
  useEffect(() => {
    setGearOpen(false)
    setUserOpen(false)
  }, [pathname])
  useEffect(() => {
    if (!gearOpen && !userOpen) return
    const onClick = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [gearOpen, userOpen])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    // Oculta en móvil (<md): allí manda el drawer del AdminLayoutClient.
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-stretch bg-white border-b border-neutral-200">
      {/* Marca */}
      <Link
        href="/admin"
        className="flex flex-col justify-center pl-5 pr-6 border-r border-neutral-100 shrink-0 group"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 group-hover:text-neutral-600 transition-colors leading-none">
          Cathedral Group
        </span>
        <span className="text-sm font-semibold text-neutral-800 group-hover:text-primary transition-colors leading-tight mt-0.5">
          Panel
        </span>
      </Link>

      {/* Plegar / desplegar el rail contextual */}
      <button
        type="button"
        onClick={onToggleRail}
        aria-label={railCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
        aria-pressed={railCollapsed}
        title={railCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
        className="flex items-center justify-center w-9 self-center ml-2 mr-1 rounded-md text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          {railCollapsed ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          )}
        </svg>
      </button>

      {/* Zonas (nivel 1) */}
      <nav className="flex items-stretch gap-0.5 px-2 overflow-x-auto">
        {ZONES.map((zone) => {
          const active = isZoneActive(zone.key, pathname)
          const n = zoneBadge(zone.key)
          return (
            <Link
              key={zone.key}
              href={zone.href}
              className={`relative flex items-center gap-2 px-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-[#5A5550] text-neutral-900 font-semibold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <span>{zone.label}</span>
              {n > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none tabular-nums">
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Cluster derecho */}
      <div className="ml-auto flex items-center gap-2 pr-4 pl-3 shrink-0">
        {/* Búsqueda (placeholder no funcional por ahora) */}
        <div className="relative hidden lg:block">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </span>
          <input
            type="text"
            disabled
            placeholder="Buscar…"
            aria-label="Buscar (próximamente)"
            className="w-44 h-9 pl-8 pr-3 text-sm rounded-md bg-neutral-50 border border-neutral-200 text-neutral-600 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-300 cursor-not-allowed"
          />
        </div>

        {/* Campana — comportamiento existente intacto */}
        <NotificationBell />

        {/* Engranaje → "Sistema" */}
        <div className="relative" ref={gearRef}>
          <button
            type="button"
            onClick={() => { setGearOpen((v) => !v); setUserOpen(false) }}
            aria-label="Sistema"
            aria-expanded={gearOpen}
            className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white border border-neutral-200 hover:border-neutral-400 transition-colors text-neutral-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {sistemaBadge > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none tabular-nums">
                {sistemaBadge > 99 ? '99+' : sistemaBadge}
              </span>
            )}
          </button>

          {gearOpen && (
            <div className="absolute right-0 top-11 z-50 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden py-1">
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 select-none">
                Sistema
              </p>
              {SISTEMA_ITEMS.map((it) => {
                const active = pathname === it.href.split('?')[0]
                  || (it.href !== '/admin/sistema' && pathname.startsWith(it.href.split('?')[0]))
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      active ? 'bg-primary/8 text-primary font-semibold' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                  >
                    {it.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Chip de usuario */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => { setUserOpen((v) => !v); setGearOpen(false) }}
            aria-expanded={userOpen}
            className="flex items-center gap-1.5 h-9 px-2.5 rounded-full border border-neutral-200 hover:border-neutral-400 transition-colors text-sm text-neutral-700"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-[11px] font-bold text-[#5A5550]">D</span>
            <span className="font-medium">David</span>
            <span className="text-neutral-400 text-xs">▾</span>
          </button>

          {userOpen && (
            <div className="absolute right-0 top-11 z-50 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden py-1">
              <Link
                href="/admin/grupo"
                className="block px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
              >
                Grupo de empresas
              </Link>
              <Link
                href="/admin/configuracion"
                className="block px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
              >
                Configuración
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-sm text-neutral-600 hover:bg-red-50 hover:text-red-600 transition-colors border-t border-neutral-100 mt-1"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
