'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useT, getLocale, setLocale, type Locale } from '@/lib/translations'
import Link from 'next/link'

// Divisiones (desplegable). Spaces = la división de reformas y diseño.
const DIVISIONS = [
  { name: 'Spaces', href: '/spaces' },
  { name: 'Capital', href: '/capital' },
  { name: 'Properties', href: '/properties' },
  { name: 'Developments', href: '/developments' },
]

// Resto del menú (rutas globales). Servicios y Zonas viven dentro de Spaces.
const NAV_ITEMS = [
  { key: 'projects', href: '/proyectos' },
  { key: 'blog', href: '/blog' },
  { key: 'about', href: '/nosotros' },
  { key: 'contact', href: '/contacto' },
]

export default function Header() {
  const t = useT('nav')
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [locale, setLocaleState] = useState<Locale>(getLocale())

  const toggleLocale = () => {
    const newLocale = locale === 'es' ? 'en' : 'es'
    setLocale(newLocale)
    setLocaleState(newLocale)
    document.documentElement.lang = newLocale
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`
    window.location.reload()
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-400 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md border-b border-neutral-100'
          : 'bg-white/95 backdrop-blur-md border-b border-neutral-100'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/img/logo.png"
            alt="Cathedral Group"
            width={48}
            height={48}
            className="h-8 md:h-12 w-auto object-contain"
            priority
          />
          <span className="text-xs md:text-base font-light uppercase tracking-[0.2em] text-neutral-800">
            Cathedral Group
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {/* Divisiones — desplegable */}
          <div className="relative group">
            <span
              className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-700 group-hover:text-primary transition-colors cursor-default inline-flex items-center gap-1"
              aria-haspopup="true"
            >
              {t('divisions')}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="absolute left-1/2 -translate-x-1/2 top-full pt-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible focus-within:opacity-100 focus-within:visible transition-all duration-200 z-10">
              <div className="bg-white border border-neutral-100 shadow-sm py-2 min-w-[180px]">
                {DIVISIONS.map((d) => (
                  <Link
                    key={d.href}
                    href={d.href}
                    className="block px-5 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-neutral-700 hover:bg-neutral-50 hover:text-primary transition-colors whitespace-nowrap"
                  >
                    {d.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {NAV_ITEMS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-700 hover:text-primary transition-colors"
            >
              {t(key)}
            </Link>
          ))}

          {/* Presupuesto — botón destacado */}
          <Link
            href="/presupuesto"
            className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-800 border border-neutral-800 px-5 py-2.5 hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] transition-all duration-300"
          >
            {t('budget')}
          </Link>
        </nav>

        {/* Right: Language + Mobile Menu */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleLocale}
            className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-primary transition-colors border border-neutral-200 px-3 py-1.5"
          >
            {locale === 'es' ? 'EN' : 'ES'}
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden w-10 h-10 flex items-center justify-center"
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <nav className="md:hidden bg-white border-t border-neutral-100 px-6 py-6 space-y-4">
          {/* Divisiones */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {t('divisions')}
            </p>
            {DIVISIONS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                onClick={() => setMenuOpen(false)}
                className="block pl-3 text-sm font-bold uppercase tracking-widest text-neutral-700 hover:text-primary transition-colors"
              >
                {d.name}
              </Link>
            ))}
          </div>

          <div className="pt-2 border-t border-neutral-100 space-y-4">
            {NAV_ITEMS.map(({ key, href }) => (
              <Link
                key={key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-bold uppercase tracking-widest text-neutral-700 hover:text-primary transition-colors"
              >
                {t(key)}
              </Link>
            ))}
            <Link
              href="/presupuesto"
              onClick={() => setMenuOpen(false)}
              className="block text-sm font-bold uppercase tracking-widest text-primary transition-colors"
            >
              {t('budget')}
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
