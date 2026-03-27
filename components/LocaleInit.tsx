'use client'

import { useEffect } from 'react'
import { setLocale, type Locale } from '@/lib/translations'

export default function LocaleInit() {
  useEffect(() => {
    const match = document.cookie.match(/locale=(es|en)/)
    if (match) {
      setLocale(match[1] as Locale)
      document.documentElement.lang = match[1]
    }
  }, [])
  return null
}
