'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useT, getLocale, setLocale, type Locale } from '@/lib/translations'
import Link from 'next/link'

const NAV_ITEMS = [
  { key: 'projects', href: '#proyectos' },
  { key: 'services', href: '#servicios' },
  { key: 'zones', href: '#zonas' },
  { key: 'about', href: '#nosotros' },
  { key: 'contact', href: '#contacto' },
  { key: 'budget', href: '/presupuesto' },
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
          {NAV_ITEMS.map(({ key, href }) =>
            href.startsWith('/') ? (
              <Link
                key={key}
                href={href}
                className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-700 hover:text-primary transition-colors"
              >
                {t(key)}
              </Link>
            ) : (
              <a
                key={key}
                href={href}
                className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-700 hover:text-primary transition-colors"
              >
                {t(key)}
              </a>
            )
          )}
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
          {NAV_ITEMS.map(({ key, href }) =>
            href.startsWith('/') ? (
              <Link
                key={key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-bold uppercase tracking-widest text-neutral-700 hover:text-primary transition-colors"
              >
                {t(key)}
              </Link>
            ) : (
              <a
                key={key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-bold uppercase tracking-widest text-neutral-700 hover:text-primary transition-colors"
              >
                {t(key)}
              </a>
            )
          )}
        </nav>
      )}
    </header>
  )
}
