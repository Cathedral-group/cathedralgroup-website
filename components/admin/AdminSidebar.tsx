'use client'

/**
 * AdminSidebar — rail contextual (nivel 2) de la navegación de dos niveles.
 *
 * Muestra SOLO los items de la zona activa (derivada del pathname). Lista plana,
 * siempre visible: sin drill-down, sin acordeón, sin "Volver". Solo desktop
 * (≥md); el drawer móvil lo provee AdminLayoutClient con todas las zonas.
 *
 * Los contadores de badges vienen del hook compartido useAdminBadgeCounts()
 * (mismas queries que la barra superior). Los doc_types se leen del SSOT registry.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ActiveCompanyBadge from './ActiveCompanyBadge'
import { useRegistry } from '@/lib/use-registry'
import { useUploadQueueCounts } from '@/lib/upload-queue-context'
import { useAdminBadgeCounts } from '@/lib/use-admin-badge-counts'
import { getActiveZone, isSistemaRoute, type NavLeaf, type Zone } from './admin-nav'

/** Doc-types del registry como hojas extra de la zona Documentos. */
function registryDocLeaves(
  docTypes: Array<{ code: string; display_name: string; display_name_plural: string | null; display_order: number; enabled: boolean }> | null,
): NavLeaf[] {
  // Atajos canónicos "Más usados" que SÍ tienen ruta dedicada propia.
  const featured: NavLeaf[] = [
    { label: 'Facturas', href: '/admin/facturas' },
    { label: 'Presupuestos', href: '/admin/presupuestos' },
  ]
  if (!docTypes || docTypes.length === 0) {
    // Fallback consistente con el flujo (hub global con ?tipo=)
    return [
      ...featured,
      { label: 'Contratos', href: '/admin/documentos?tipo=contrato' },
      { label: 'Escrituras', href: '/admin/documentos?tipo=escritura' },
    ]
  }
  // Resto de doc_types desde registry (orden = display_order), excluyendo
  // factura/presupuesto que ya van como "Más usados" con ruta dedicada.
  const rest: NavLeaf[] = docTypes
    .filter((dt) => dt.enabled && dt.code !== 'factura' && dt.code !== 'presupuesto')
    .map((dt) => ({
      label: dt.display_name_plural || dt.display_name,
      href: `/admin/documentos?tipo=${dt.code}`,
    }))
  return [...featured, ...rest]
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  const { registry } = useRegistry()
  const upload = useUploadQueueCounts()
  const c = useAdminBadgeCounts()

  // Zona activa (null en rutas Sistema / sin zona → rail vacío con aviso).
  const activeZone: Zone | null = useMemo(() => getActiveZone(pathname), [pathname])

  // Doc-types del registry agrupados (para la zona Documentos).
  const docExtras = useMemo(
    () => registryDocLeaves(registry?.doc_types ?? null),
    [registry],
  )

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/admin/login')
    router.refresh()
  }

  const handleRefresh = () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1500)
  }

  // ¿La hoja está activa? Compara pathname + (si la href trae ?tipo=) el query.
  const isLeafActive = (href: string): boolean => {
    if (href.startsWith('#')) return false
    const [path, query] = href.split('?')
    if (pathname !== path) return false
    if (!query) return true
    // Las hojas con ?tipo= solo se marcan activas si la URL trae ese tipo.
    const params = new URLSearchParams(query)
    const tipo = params.get('tipo')
    if (tipo) {
      const current = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('tipo')
        : null
      return current === tipo
    }
    return true
  }

  // Badge por hoja (mismas fuentes que antes, vía hook compartido).
  const getBadge = (badgeKey?: NavLeaf['badgeKey']): { count: number; color: string } | null => {
    if (!badgeKey) return null
    if (badgeKey === 'errors' && c.errorCount && c.errorCount > 0) return { count: c.errorCount, color: 'bg-red-500' }
    if (badgeKey === 'revision' && c.revisionCount && c.revisionCount > 0) return { count: c.revisionCount, color: 'bg-amber-500' }
    if (badgeKey === 'orphans' && c.orphanCount && c.orphanCount > 0) return { count: c.orphanCount, color: 'bg-red-500' }
    if (badgeKey === 'absences_pending' && c.absencesPending && c.absencesPending > 0) return { count: c.absencesPending, color: 'bg-red-500' }
    if (badgeKey === 'tickets_pending' && c.ticketsPending && c.ticketsPending > 0) return { count: c.ticketsPending, color: 'bg-blue-500' }
    if (badgeKey === 'expenses_pending' && c.expensesPending && c.expensesPending > 0) return { count: c.expensesPending, color: 'bg-blue-500' }
    if (badgeKey === 'partes_anomalia' && c.partesAnomalia && c.partesAnomalia > 0) return { count: c.partesAnomalia, color: 'bg-amber-500' }
    return null
  }

  const renderLeaf = (item: NavLeaf, key: string) => {
    if (item.header) {
      return (
        <p key={key} className="px-5 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 select-none">
          {item.label}
        </p>
      )
    }
    if (item.disabled) {
      return (
        <div
          key={key}
          className="flex items-center gap-2 px-5 py-2.5 text-sm text-neutral-300 border-b border-neutral-100 cursor-not-allowed select-none"
        >
          <span className="flex-1">{item.label}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
            Próximamente
          </span>
        </div>
      )
    }
    const active = isLeafActive(item.href)
    const badge = getBadge(item.badgeKey)
    return (
      <Link
        key={key}
        href={item.href}
        className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-colors border-b border-neutral-100 ${
          active
            ? 'bg-primary/8 text-primary font-semibold border-r-2 border-primary'
            : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
        }`}
      >
        <span className="flex-1">{item.label}</span>
        {badge && (
          <span className={`${badge.color} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums`}>
            {badge.count > 99 ? '99+' : badge.count}
          </span>
        )}
      </Link>
    )
  }

  // Composición de la lista de hojas de la zona activa.
  const leaves: NavLeaf[] = useMemo(() => {
    if (!activeZone) return []
    if (activeZone.key !== 'documentos') return activeZone.items
    // Documentos: items fijos + grupo "Más usados / Otros" (registry).
    const uploadLabel = upload.total > 0 ? `Subir documento (${upload.total})` : 'Subir documento'
    const fixed: NavLeaf[] = activeZone.items.map((it) =>
      it.href === '/admin/upload' ? { ...it, label: uploadLabel } : it,
    )
    return [
      ...fixed,
      { label: 'Más usados / Otros', href: '#header', header: true },
      ...docExtras,
    ]
  }, [activeZone, docExtras, upload.total])

  return (
    <aside className="hidden md:flex fixed left-0 top-14 h-[calc(100dvh-3.5rem)] w-56 bg-white border-r border-neutral-100 flex-col z-30">
      {/* Empresa activa */}
      <ActiveCompanyBadge />

      {/* Título de la zona activa */}
      {activeZone && (
        <p className="px-5 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 select-none">
          {activeZone.label}
        </p>
      )}

      {/* Lista plana de la zona activa */}
      <nav className="flex-1 overflow-y-auto pb-3">
        {activeZone ? (
          leaves.map((item, i) => renderLeaf(item, item.href + '|' + i))
        ) : (
          <p className="px-5 py-6 text-xs text-neutral-400 leading-relaxed">
            {isSistemaRoute(pathname)
              ? 'Sección Sistema. Usa el engranaje de la barra superior para moverte entre Estado, Forensic, Métricas, Agentes, Registro, Archivo, Papelera y Configuración.'
              : 'Selecciona una zona en la barra superior.'}
          </p>
        )}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-neutral-100 flex items-center justify-between gap-3">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refrescar datos"
          className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {refreshing ? 'Refrescando' : 'Refrescar'}
        </button>
        <button
          onClick={handleLogout}
          className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-red-500 transition-colors"
        >
          Salir
        </button>
      </div>
    </aside>
  )
}
