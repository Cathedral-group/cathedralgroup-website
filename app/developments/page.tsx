import DivisionLanding from '@/components/sections/DivisionLanding'
import { divisions } from '@/content/divisions'

export const metadata = {
  title: 'Cathedral Developments: Promoción Inmobiliaria en Madrid',
  description:
    'Promoción y desarrollo de proyectos residenciales singulares de alto standing en Madrid, del suelo a la entrega.',
  alternates: { canonical: '/developments' },
}

export default function DevelopmentsPage() {
  return <DivisionLanding division={divisions.developments} />
}
