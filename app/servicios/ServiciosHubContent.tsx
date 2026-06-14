'use client'

import Link from 'next/link'
import { services } from '@/content/services'
import { getLocale, useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

// Cuerpo del hub de servicios. 'use client' para leer el idioma (cookie) como el
// resto de secciones traducidas; la página servidora mantiene los metadatos SEO.
export default function ServiciosHubContent() {
  const locale = getLocale()
  const t = useT('services')

  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={t('label')} className="mb-4" />
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">
            {t('title')}
          </h1>
          <p className="text-neutral-600 max-w-2xl">{t('subtitle')}</p>
        </div>
      </section>

      {/* Services grid */}
      <section className="pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6" data-animate="stagger">
            {services.map((service) => (
              <Link
                key={service.slug}
                href={`/servicios/${service.slug}`}
                className="group block"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100 mb-4">
                  <div
                    className="w-full h-full bg-center bg-cover transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url('${service.heroImage}')` }}
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest group-hover:text-primary transition-colors">
                  {service.title[locale]}
                </h3>
                <p className="text-sm text-neutral-600 mt-2">{service.description[locale]}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
