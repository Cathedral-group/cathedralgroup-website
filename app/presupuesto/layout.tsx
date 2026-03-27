import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Calculadora de Presupuesto de Reforma en Madrid',
  description:
    'Calcule el presupuesto orientativo para su reforma de lujo en Madrid. Estimaciones para reforma integral, interiorismo, cambio de uso y obra nueva.',
  alternates: {
    canonical: 'https://cathedralgroup.es/presupuesto',
  },
  openGraph: {
    title: 'Calculadora de Presupuesto de Reforma en Madrid | Cathedral Group',
    description:
      'Obtenga una estimación orientativa para su proyecto de reforma o interiorismo de lujo en Madrid.',
    url: 'https://cathedralgroup.es/presupuesto',
    type: 'website',
  },
}

export default function PresupuestoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
