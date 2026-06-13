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
import JsonLd, { ORGANIZATION_SCHEMA } from '@/components/seo/JsonLd'

const GA_ID = 'G-5FTL67Y0S6'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://cathedralgroup.es'),
  title: {
    default: 'Cathedral Group | Arquitectura y Diseño de Alto Standing en Madrid',
    template: '%s | Cathedral Group',
  },
  description: 'Estudio de arquitectura, diseño y reformas en Madrid especializado en proyectos residenciales de alto standing.',
  keywords: ['reformas Madrid', 'arquitectura alto standing', 'interiorismo Madrid', 'reforma integral', 'cambio de uso', 'obra nueva Madrid'],
  authors: [{ name: 'Cathedral Group' }],
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: 'https://cathedralgroup.es',
    siteName: 'Cathedral Group',
    title: 'Cathedral Group | Arquitectura y Diseño de Alto Standing en Madrid',
    description: 'Estudio de arquitectura, diseño y reformas en Madrid especializado en proyectos residenciales de alto standing.',
    images: [{ url: '/img/proj-atico.jpg', width: 2048, height: 1365, alt: 'Cathedral Group' }],
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
import CookieBanner from '@/components/layout/CookieBanner'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={manrope.variable}>
      {/* Consent Mode v2: el default 'denied' DEBE ejecutarse antes de que cargue
          gtag.js (orden vital según docs Google) → bloque separado beforeInteractive.
          GA no mide ni pone cookies hasta que CookieBanner llame a consent update. */}
      <Script id="ga4-consent-default" strategy="beforeInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
      <body className="font-display text-neutral-900 antialiased">
        {/* Organization/LocalBusiness una sola vez para todo el sitio */}
        <JsonLd data={ORGANIZATION_SCHEMA} />
        <LayoutSwitch>{children}</LayoutSwitch>
        <LocaleInit />
        <CookieBanner />
      </body>
    </html>
  )
}
