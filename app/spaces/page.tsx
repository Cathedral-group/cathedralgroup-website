import Hero from '@/components/sections/Hero'
import Excellence from '@/components/sections/Excellence'
import Divisions from '@/components/sections/Divisions'
import Projects from '@/components/sections/Projects'
import Zones from '@/components/sections/Zones'
import About from '@/components/sections/About'
import ContactForm from '@/components/sections/ContactForm'
import JsonLd, { ORGANIZATION_SCHEMA } from '@/components/seo/JsonLd'

export const metadata = {
  title: 'Cathedral Spaces: Reformas Integrales e Interiorismo en Madrid',
  description:
    'Arquitectura residencial, reformas integrales e interiorismo de alto standing en los mejores barrios de Madrid.',
  alternates: { canonical: '/spaces' },
}

// Cathedral Spaces — la división de reformas y diseño. Hereda el contenido que
// antes era la home (/). La home ahora es la página paraguas de las 4 divisiones.
export default function SpacesPage() {
  return (
    <>
      <JsonLd data={ORGANIZATION_SCHEMA} />
      <Hero />
      <Excellence />
      <Divisions />
      <Projects />
      <Zones />
      <About />
      <ContactForm />
    </>
  )
}
