import HomeHero from '@/components/sections/HomeHero'
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
      {/* Hero estilo divisiones: imagen (escalera — esencia Cathedral) + texto
          encima (eyebrow + H1). Cliente para traducir según la cookie de idioma. */}
      <HomeHero />

      {/* Selector de divisiones */}
      <Divisions />
    </>
  )
}
