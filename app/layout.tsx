import type { Metadata } from 'next'
import './globals.css'

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
    alternateLocale: 'en_GB',
    url: 'https://cathedralgroup.es',
    siteName: 'Cathedral Group',
    title: 'Cathedral Group | Arquitectura y Diseño de Lujo en Madrid',
    description: 'Estudio de arquitectura, diseño y reformas en Madrid especializado en proyectos residenciales de alto standing.',
    images: [{ url: '/img/hero_final.jpg', width: 2048, height: 1365, alt: 'Cathedral Group' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cathedral Group',
    description: 'Arquitectura y Diseño de Lujo en Madrid',
    images: ['/img/hero_final.jpg'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png', sizes: '512x512' },
    ],
  },
  alternates: {
    canonical: 'https://cathedralgroup.es',
    languages: {
      'es': 'https://cathedralgroup.es',
      'en': 'https://cathedralgroup.es/en',
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
