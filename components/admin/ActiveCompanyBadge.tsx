'use client'

/**
 * F3.5 — Indicador empresa activa (pasivo en F3 minimal).
 *
 * Muestra la empresa activa del usuario en el sidebar admin. En esta fase
 * solo muestra info, no permite cambiar (eso es F3 completo cuando todas las
 * queries del admin pasen por el contexto de empresa activa).
 *
 * Cuando hay >1 empresa, muestra "+N más" indicando que existen otras pero
 * que el cambio aún no está habilitado.
 */

import { useEffect, useState } from 'react'

type Company = {
  id: string
  cif: string
  razon_social: string
  user_role: string | null
}

export default function ActiveCompanyBadge() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch('/api/admin/companies', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!mounted || !j) return
        setCompanies(j.companies ?? [])
        setActiveId(j.active_company_id ?? null)
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <div className="px-5 py-3 border-b border-neutral-100">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">Empresa activa</p>
        <p className="text-xs text-neutral-300 mt-1">Cargando…</p>
      </div>
    )
  }

  const active = companies.find((c) => c.id === activeId) ?? companies[0] ?? null
  const others = companies.length - (active ? 1 : 0)

  if (!active) {
    return (
      <div className="px-5 py-3 border-b border-neutral-100">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">Empresa activa</p>
        <p className="text-xs text-neutral-400 mt-1">Sin acceso</p>
      </div>
    )
  }

  return (
    <a
      href="/admin/grupo"
      className="block px-5 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors group"
      title="Ver grupo de empresas"
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">Empresa activa</p>
      <p className="text-xs font-semibold text-neutral-700 mt-1 truncate group-hover:text-primary">
        🏛️ {active.razon_social}
      </p>
      <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
        {active.cif}
        {others > 0 && (
          <span className="ml-2 text-primary font-bold">+{others} más</span>
        )}
      </p>
    </a>
  )
}
