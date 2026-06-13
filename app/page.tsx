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
      {/* Hero estilo divisiones: imagen (escalera — esencia Cathedral) + texto
          encima (eyebrow + H1). Mismas dimensiones que las landings de división. */}
      <section className="relative h-[70vh] flex items-end overflow-hidden">
        <Image
          src="/img/hero-home.jpg"
          alt="Cathedral Group — arquitectura, inversión y desarrollo de alto standing en Madrid"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-14 w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80 mb-3">
            Cathedral Group
          </p>
          <h1 className="text-white text-2xl md:text-4xl font-light uppercase tracking-wide max-w-3xl">
            Arquitectura, inversión y desarrollo de alto standing en Madrid
          </h1>
        </div>
      </section>

      {/* Selector de divisiones */}
      <Divisions />
    </>
  )
}
