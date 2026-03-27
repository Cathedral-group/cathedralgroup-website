import Hero from '@/components/sections/Hero'
import Excellence from '@/components/sections/Excellence'
import Divisions from '@/components/sections/Divisions'
import Projects from '@/components/sections/Projects'
import Zones from '@/components/sections/Zones'
import About from '@/components/sections/About'
import ContactForm from '@/components/sections/ContactForm'
import JsonLd, { ORGANIZATION_SCHEMA } from '@/components/seo/JsonLd'

export default function HomePage() {
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
