import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vista previa — Nueva portada',
  // Página interna de previsualización: jamás debe indexarse ni enlazarse
  robots: { index: false, follow: false },
}

export default function PreviewHomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
