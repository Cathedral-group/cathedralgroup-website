import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cathedral Group | Arquitectura y Diseño de Lujo en Madrid',
  description: 'Estudio de arquitectura, diseño y reformas en Madrid especializado en proyectos residenciales de alto standing.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png', sizes: '512x512' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
