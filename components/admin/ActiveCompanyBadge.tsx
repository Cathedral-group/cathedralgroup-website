'use client'

/**
 * F3 completo MVP — Selector empresa activa funcional.
 *
 * Hoy con 1 SL solo muestra el sticker pasivo. Cuando haya >1 company en el
 * grupo, abre dropdown con las empresas disponibles y permite cambiar.
 * El cambio:
 *   1. POST /api/admin/companies/active con company_id
 *   2. Refresh la sesión Supabase para obtener nuevo JWT
 *   3. router.refresh() para que los server components re-rendericen con
 *      la nueva empresa activa
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Company = {
  id: string
  cif: string
  razon_social: string
  user_role: string | null
}

export default function ActiveCompanyBadge() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/admin/companies', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!mounted || !j) return
        setCompanies(j.companies ?? [])
        setActiveId(j.active_company_id ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleChangeActive = async (companyId: string) => {
    setError(null)
    if (companyId === activeId) {
      setOpen(false)
      return
    }
    try {
      const res = await fetch('/api/admin/companies/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)

      // Refrescar sesión Supabase (nuevo JWT con app_metadata.active_company_id)
      const supabase = createClient()
      await supabase.auth.refreshSession()

      setActiveId(companyId)
      setOpen(false)

      // Re-renderizar server components (que leen activeCompanyId del JWT)
      startTransition(() => {
        router.refresh()
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) {
    return (
      <div className="px-5 py-3 border-b border-neutral-100">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">
          Empresa activa
        </p>
        <p className="text-xs text-neutral-300 mt-1">Cargando…</p>
      </div>
    )
  }

  const active = companies.find((c) => c.id === activeId) ?? companies[0] ?? null
  const others = companies.filter((c) => c.id !== active?.id)

  if (!active) {
    return (
      <div className="px-5 py-3 border-b border-neutral-100">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">
          Empresa activa
        </p>
        <p className="text-xs text-neutral-400 mt-1">Sin acceso</p>
      </div>
    )
  }

  // Solo 1 empresa: sticker pasivo
  if (others.length === 0) {
    return (
      <a
        href="/admin/grupo"
        className="block px-5 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors group"
        title="Ver grupo de empresas"
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">
          Empresa activa
        </p>
        <p className="text-xs font-semibold text-neutral-700 mt-1 truncate group-hover:text-primary">
          🏛️ {active.razon_social}
        </p>
        <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{active.cif}</p>
      </a>
    )
  }

  // >1 empresa: dropdown selector
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors group"
        disabled={pending}
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-300">
          Empresa activa{pending ? ' (cambiando…)' : ''}
        </p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs font-semibold text-neutral-700 truncate group-hover:text-primary">
            🏛️ {active.razon_social}
          </p>
          <span className="text-neutral-300 text-xs ml-2">{open ? '▲' : '▼'}</span>
        </div>
        <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
          {active.cif}
          <span className="ml-2 text-primary font-bold">+{others.length} más</span>
        </p>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-10 bg-white border-b border-neutral-200 shadow-md">
          {error && (
            <div className="bg-red-50 text-red-800 text-xs px-5 py-2 border-b border-red-100">
              {error}
            </div>
          )}
          {others.map((c) => (
            <button
              key={c.id}
              onClick={() => handleChangeActive(c.id)}
              disabled={pending}
              className="w-full text-left px-5 py-2.5 hover:bg-primary/5 border-b border-neutral-50 transition-colors group"
            >
              <p className="text-xs font-semibold text-neutral-700 group-hover:text-primary">
                🏛️ {c.razon_social}
              </p>
              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                {c.cif}
                {c.user_role && (
                  <span className="ml-2 uppercase tracking-widest text-[9px] text-primary">
                    {c.user_role}
                  </span>
                )}
              </p>
            </button>
          ))}
          <a
            href="/admin/grupo"
            className="block px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5 text-center"
          >
            Gestionar grupo →
          </a>
        </div>
      )}
    </div>
  )
}
