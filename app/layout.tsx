import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import WhatsAppFloat from '@/components/layout/WhatsAppFloat'
import SmoothScroll from '@/components/animations/SmoothScroll'
import ScrollAnimations from '@/components/animations/ScrollAnimations'
import LocaleInit from '@/components/LocaleInit'

const GA_ID = 'G-5FTL67Y0S6'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://cathedralgroup.es'),
  title: {
    default: 'Cathedral Group | Arquitectura y Diseño de Lujo en Madrid',
    template: '%s | Cathedral Group',
  },
  description: 'Estudio de arquitectura, diseño y reformas en Madrid especializado en proyectos residenciales de alto standing.',
  keywords: ['reformas Madrid', 'arquitectura lujo', 'interiorismo Madrid', 'reforma integral', 'cambio de uso', 'obra nueva Madrid'],
  authors: [{ name: 'Cathedral Group' }],
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: 'https://cathedralgroup.es',
    siteName: 'Cathedral Group',
    title: 'Cathedral Group | Arquitectura y Diseño de Lujo en Madrid',
    description: 'Estudio de arquitectura, diseño y reformas en Madrid especializado en proyectos residenciales de alto standing.',
    images: [{ url: '/img/hero_final.jpg', width: 2048, height: 1365, alt: 'Cathedral Group' }],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png', sizes: '512x512' },
    ],
  },
  alternates: {
    canonical: 'https://cathedralgroup.es',
  },
}

import LayoutSwitch from '@/components/layout/LayoutSwitch'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={manrope.variable}>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
      <body className="font-display text-neutral-900 antialiased">
        <LayoutSwitch>{children}</LayoutSwitch>
        <LocaleInit />
      </body>
    </html>
  )
}
