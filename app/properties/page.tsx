import DivisionLanding from '@/components/sections/DivisionLanding'
import { divisions } from '@/content/divisions'

export const metadata = {
  title: 'Cathedral Properties: Activos Residenciales Exclusivos',
  description:
    'Comercialización selecta de activos residenciales de alto standing en Madrid, con presentación cuidada y acompañamiento a medida.',
  alternates: { canonical: '/properties' },
}

export default function PropertiesPage() {
  return <DivisionLanding division={divisions.properties} />
}
