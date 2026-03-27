'use client'

import { useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

export default function About() {
  const t = useT('about')

  return (
    <section className="pt-16 pb-0 bg-beige-subtle" id="nosotros">
      <div className="max-w-7xl mx-auto px-6">
        <div data-animate="fade-right">
          <SectionLabel text={t('label')} className="mb-6" />
          <h3 className="text-2xl font-medium uppercase tracking-wide mb-8 leading-tight">
            {t('title')}
          </h3>
          <p className="text-neutral-600 leading-relaxed mb-6">
            {t('paragraph1')}
          </p>
          <p className="text-neutral-600 leading-relaxed mb-10">
            {t('paragraph2')}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-8 py-8 border-t border-neutral-100">
            <div>
              <p
                className="text-2xl font-bold mb-1"
                data-animate="counter"
                data-count="15"
                data-suffix="+"
              >
                0
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                {t('yearsLabel')}
              </p>
            </div>
            <div>
              <p
                className="text-2xl font-bold mb-1"
                data-animate="counter"
                data-count="200"
                data-suffix="+"
              >
                0
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                {t('projectsLabel')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width image */}
      <div className="w-full h-80 md:h-[500px] bg-neutral-100 overflow-hidden">
        <div
          className="w-full h-full bg-center bg-cover"
          style={{ backgroundImage: "url('/img/about_upscaled.jpg')" }}
          role="img"
          aria-label="Interior of an elegant architectural studio in Madrid"
          data-animate="fade-up"
        />
      </div>
    </section>
  )
}
