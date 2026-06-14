'use client'

import Link from 'next/link'
import type { Division } from '@/content/divisions'
import { getLocale, useT } from '@/lib/translations'
import DivisionLeadForm from '@/components/forms/DivisionLeadForm'
import SectionLabel from '@/components/ui/SectionLabel'

// Landing reutilizable de una división (Capital / Properties / Developments).
// 'use client' para leer el idioma (getLocale, cookie) como el resto de secciones.
export default function DivisionLanding({ division }: { division: Division }) {
  const locale = getLocale()
  const t = useT('division')
  return (
    <>
      {/* Hero */}
      <section className="relative h-[70vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url('${division.heroImage}')` }}
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-14 w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80 mb-3">
            {division.name}
          </p>
          <h1 className="text-white text-2xl md:text-4xl font-light uppercase tracking-wide max-w-3xl">
            {division.tagline[locale]}
          </h1>
        </div>
      </section>

      {/* Intro */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center" data-animate="fade-up">
          <SectionLabel text={t('ourDivision')} className="mb-6 justify-center" />
          <p className="text-lg text-neutral-700 leading-relaxed">{division.intro[locale]}</p>
        </div>
      </section>

      {/* Pilares */}
      <section className="pb-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10" data-animate="stagger">
            {division.pillars.map((p, i) => (
              <div key={p.title[locale]} className="text-center">
                <span className="text-3xl font-light text-primary block mb-4">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-800 mb-3">
                  {p.title[locale]}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{p.desc[locale]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + formulario */}
      <section className="py-20 bg-beige-subtle" id="contacto">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-light uppercase tracking-wide text-neutral-800 mb-3">
              {division.ctaTitle[locale]}
            </h2>
            <p className="text-sm text-neutral-600">{t('leaveDetails')}</p>
          </div>
          <DivisionLeadForm source={division.formSource} division={division.name} />
        </div>
      </section>

      {/* Volver a divisiones */}
      <section className="py-12 bg-white text-center">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-400 hover:text-primary transition-colors"
        >
          {t('backToAll')}
        </Link>
      </section>
    </>
  )
}
