import Image from 'next/image'
import Divisions from '@/components/sections/Divisions'

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
      {/* H1 de marca (accesible a buscadores; el impacto visual lo da la imagen) */}
      <h1 className="sr-only">
        Cathedral Group — Arquitectura, inversión y desarrollo de alto standing en Madrid
      </h1>

      {/* Hero con imagen de marca (umbral Japandi de piedra y luz) */}
      <section className="relative w-full h-[80vh] overflow-hidden bg-white">
        <Image
          src="/img/hero-home.jpg"
          alt="Arquitectura de alto standing de Cathedral Group en Madrid — umbral de piedra natural y luz"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </section>

      {/* Selector de divisiones */}
      <Divisions />
    </>
  )
}
