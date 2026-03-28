'use client'

import { usePathname } from 'next/navigation'
import Header from './Header'
import Footer from './Footer'
import WhatsAppFloat from './WhatsAppFloat'
import SmoothScroll from '@/components/animations/SmoothScroll'
import ScrollAnimations from '@/components/animations/ScrollAnimations'

export default function LayoutSwitch({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <Header />
      <main className="pt-20">{children}</main>
      <Footer />
      <WhatsAppFloat />
      <SmoothScroll />
      <ScrollAnimations />
    </>
  )
}
