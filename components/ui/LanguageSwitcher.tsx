'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/lib/i18n/routing'

export default function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const switchLocale = () => {
    const newLocale = locale === 'es' ? 'en' : 'es'
    router.replace(pathname, { locale: newLocale })
  }

  return (
    <button
      onClick={switchLocale}
      className="border border-neutral-200 px-3 py-1 text-xs font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
    >
      ES / EN
    </button>
  )
}
