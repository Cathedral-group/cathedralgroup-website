import Hero from '@/components/sections/Hero'
import Excellence from '@/components/sections/Excellence'
import Projects from '@/components/sections/Projects'
import Zones from '@/components/sections/Zones'
import About from '@/components/sections/About'
import ContactForm from '@/components/sections/ContactForm'

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
      <Hero />
      <Excellence />
      <Projects />
      <Zones />
      <About />
      <ContactForm />
    </>
  )
}
