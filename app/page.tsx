import Image from 'next/image'
import Link from 'next/link'
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

      {/* Declaración de marca: H1 visible + propuesta de valor + accesos.
          (El hero se mantiene limpio; el H1 vivía oculto en sr-only — fuga SEO.) */}
      <section className="py-16 md:py-20 bg-white text-center">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <span className="text-primary text-sm font-bold uppercase tracking-[0.3em] mb-4 block">
            Cathedral Group
          </span>
          <h1 className="text-2xl md:text-3xl font-medium uppercase tracking-wide mb-5">
            Arquitectura, inversión y desarrollo de alto standing en Madrid
          </h1>
          <p className="text-neutral-600 leading-relaxed mb-8">
            Un grupo, cuatro divisiones: reforma y diseño, inversión estratégica,
            comercialización selecta y promoción de proyectos singulares en Madrid.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/contacto"
              className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-800 border border-neutral-800 px-7 py-3 hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] transition-all duration-300"
            >
              Solicitar consulta
            </Link>
            <Link
              href="/presupuesto"
              className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500 px-7 py-3 hover:text-primary transition-colors"
            >
              Calcular presupuesto
            </Link>
          </div>
        </div>
      </section>

      {/* Selector de divisiones */}
      <Divisions />
    </>
  )
}
