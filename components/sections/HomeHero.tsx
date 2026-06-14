'use client'

import Image from 'next/image'
import { useT } from '@/lib/translations'

// Hero de la home paraguas (cliente, para leer el idioma de la cookie). Mismas
// dimensiones que las landings de división: imagen + eyebrow + H1 sobre la foto.
export default function HomeHero() {
  const t = useT('home')

  return (
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
          {t('eyebrow')}
        </p>
        <h1 className="text-white text-2xl md:text-4xl font-light uppercase tracking-wide max-w-3xl">
          {t('title')}
        </h1>
      </div>
    </section>
  )
}
