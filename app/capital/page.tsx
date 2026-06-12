import DivisionLanding from '@/components/sections/DivisionLanding'
import { divisions } from '@/content/divisions'

export const metadata = {
  title: 'Cathedral Capital: Inversión Inmobiliaria en Madrid',
  description:
    'Inversión inmobiliaria estratégica de alto standing en Madrid. Análisis, gestión integral y visión patrimonial a largo plazo.',
  alternates: { canonical: '/capital' },
}

export default function CapitalPage() {
  return <DivisionLanding division={divisions.capital} />
}
