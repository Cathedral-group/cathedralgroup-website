'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/translations'

const CONSENT_KEY = 'cookie_consent'

// Patrón canónico Consent Mode v2: llamar a la función gtag definida en el
// script inline del layout. NUNCA window.dataLayer.push([...]) con array —
// gtag.js solo reconoce el objeto `arguments`, no arrays.
function gtagConsent(value: 'granted' | 'denied') {
  if (typeof window === 'undefined') return
  ;(window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.('consent', 'update', {
    analytics_storage: value,
  })
}

export default function CookieBanner() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const t = useT('cookies')

  useEffect(() => {
    if (pathname.startsWith('/admin') || pathname.startsWith('/portal') || pathname.startsWith('/itss')) return
    const stored = localStorage.getItem(CONSENT_KEY)
    if (stored === 'accepted') {
      gtagConsent('granted')
    } else if (!stored) {
      setShow(true)
    }
    // 'rejected' → no se llama a update: el default 'denied' se mantiene
  }, [pathname])

  if (!show) return null

  const decide = (accepted: boolean) => {
    localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected')
    if (accepted) gtagConsent('granted')
    setShow(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed bottom-5 left-5 z-50 max-w-[300px] bg-white border border-neutral-200 shadow-lg p-4"
    >
      <p className="text-[11px] leading-relaxed text-neutral-600 mb-3">
        {t('text')}{' '}
        <a href="/legal#cookies" className="underline underline-offset-2 hover:text-primary">
          {t('moreInfo')}
        </a>
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => decide(true)}
          className="flex-1 bg-[#5A5550] text-white text-[10px] font-bold uppercase tracking-widest py-2 hover:bg-[#4A4540] transition-colors"
        >
          {t('accept')}
        </button>
        <button
          onClick={() => decide(false)}
          className="flex-1 border border-neutral-300 text-neutral-500 text-[10px] font-bold uppercase tracking-widest py-2 hover:bg-neutral-50 transition-colors"
        >
          {t('reject')}
        </button>
      </div>
    </div>
  )
}
