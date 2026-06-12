import HeroVideo from '@/components/sections/HeroVideo'
import Divisions from '@/components/sections/Divisions'
import JsonLd, { ORGANIZATION_SCHEMA } from '@/components/seo/JsonLd'

export const metadata = {
  title: 'Cathedral Group | Arquitectura, Inversión y Desarrollo de Alto Standing en Madrid',
  description:
    'Grupo inmobiliario en Madrid especializado en arquitectura y reformas de alto standing, inversión estratégica, comercialización selecta y promoción de proyectos singulares.',
  alternates: { canonical: 'https://cathedralgroup.es' },
}

// Home paraguas: hero con el brand film + selector de las 4 divisiones
// (Spaces, Capital, Properties, Developments). La división de reformas vive
// ahora en /spaces.
export default function HomePage() {
  return (
    <>
      <JsonLd data={ORGANIZATION_SCHEMA} />

      {/* H1 de marca (accesible a buscadores; el impacto visual lo da el vídeo) */}
      <h1 className="sr-only">
        Cathedral Group — Arquitectura, inversión y desarrollo de alto standing en Madrid
      </h1>

      {/* Hero con brand film, de lado a lado */}
      <section className="relative w-full h-[90vh] flex items-center justify-center overflow-hidden bg-white">
        <HeroVideo />
      </section>

      {/* Selector de divisiones */}
      <Divisions />
    </>
  )
}
