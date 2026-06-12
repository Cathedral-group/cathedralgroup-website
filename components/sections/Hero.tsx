'use client'

import { useT } from '@/lib/translations'

// Hero de Cathedral Spaces (división de reformas y diseño). Mismo tratamiento
// que las landings de las otras divisiones: nombre + tagline sobre la imagen,
// abajo a la izquierda.
export default function Hero() {
  const t = useT('hero')

  return (
    <section className="relative h-[70vh] flex items-end overflow-hidden">
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('/img/division-spaces.jpg')" }}
      />
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-14 w-full" data-animate="fade-up">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80 mb-3">
          Cathedral Spaces
        </p>
        <h1 className="text-white text-2xl md:text-4xl font-light uppercase tracking-wide max-w-3xl">
          {t('subtitle')}
        </h1>
      </div>
    </section>
  )
}
