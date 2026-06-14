'use client'

import { useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

// Cuerpo de la página Nosotros (cliente, para traducir según la cookie de
// idioma). La metadata/SEO permanece en español en la página servidora.
export default function NosotrosContent() {
  const t = useT('about')

  const values = [
    { title: t('value1Title'), desc: t('value1Desc') },
    { title: t('value2Title'), desc: t('value2Desc') },
    { title: t('value3Title'), desc: t('value3Desc') },
  ]

  return (
    <>
      {/* Hero */}
      <section className="relative h-[50vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: "url('/img/nosotros-estudio.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12 w-full">
          <h1 className="text-white text-2xl md:text-3xl font-medium uppercase tracking-wide">
            {t('label')}
          </h1>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={t('label')} className="mb-6" />
          <h2 className="text-2xl font-medium uppercase tracking-wide mb-8">{t('title')}</h2>
          <p className="text-neutral-700 leading-relaxed mb-6">{t('paragraph1')}</p>
          <p className="text-neutral-700 leading-relaxed mb-10">{t('paragraph2')}</p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-neutral-200">
            <div>
              <p className="text-3xl font-bold mb-1" data-animate="counter" data-count="15" data-suffix="+">0</p>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{t('yearsLabel')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold mb-1" data-animate="counter" data-count="200" data-suffix="+">0</p>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{t('projectsLabel')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-beige-subtle">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8" data-animate="stagger">
            {values.map((v) => (
              <div key={v.title} className="bg-white p-8">
                <h4 className="text-sm font-bold uppercase tracking-widest mb-4">{v.title}</h4>
                <p className="text-sm text-neutral-600 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
