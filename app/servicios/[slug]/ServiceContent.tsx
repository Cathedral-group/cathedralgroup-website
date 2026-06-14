'use client'

import Link from 'next/link'
import type { Service } from '@/content/services'
import type { FAQ } from '@/content/services/faqs'
import { getLocale, useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

type LinkItem = { href: string; labelEs: string; labelEn: string }

// Contenido relacionado (artículos + zonas) por servicio. Etiquetas bilingües
// (labelEs/labelEn) que se eligen en cliente según el idioma de la cookie.
const relatedContent: Record<string, { posts: LinkItem[]; zones: LinkItem[] }> = {
  'reformas-integrales-madrid': {
    posts: [
      { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
      { href: '/blog/reformar-atico-madrid-precio', labelEs: 'Reformar un ático en Madrid: precio', labelEn: 'Penthouse renovation in Madrid: cost' },
      { href: '/blog/reforma-integral-vs-parcial', labelEs: 'Reforma integral vs parcial', labelEn: 'Full vs partial renovation' },
    ],
    zones: [
      { href: '/zonas/reformas-salamanca', labelEs: 'Reformas en Salamanca', labelEn: 'Renovations in Salamanca' },
      { href: '/zonas/reformas-chamberi', labelEs: 'Reformas en Chamberí', labelEn: 'Renovations in Chamberí' },
      { href: '/zonas/reformas-chamartin', labelEs: 'Reformas en Chamartín', labelEn: 'Renovations in Chamartín' },
      { href: '/zonas/reformas-retiro', labelEs: 'Reformas en Retiro', labelEn: 'Renovations in Retiro' },
    ],
  },
  'interiorismo-madrid': {
    posts: [
      { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
      { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de alto standing en Salamanca', labelEn: 'High-end renovations in Salamanca' },
    ],
    zones: [
      { href: '/zonas/reformas-salamanca', labelEs: 'Interiorismo en Salamanca', labelEn: 'Interior design in Salamanca' },
      { href: '/zonas/reformas-chamberi', labelEs: 'Interiorismo en Chamberí', labelEn: 'Interior design in Chamberí' },
      { href: '/zonas/reformas-la-moraleja', labelEs: 'Interiorismo en La Moraleja', labelEn: 'Interior design in La Moraleja' },
    ],
  },
  'arquitectura-madrid': {
    posts: [
      { href: '/blog/licencia-obra-madrid-guia', labelEs: 'Licencia de obra en Madrid: guía', labelEn: 'Building permit in Madrid: guide' },
      { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    ],
    zones: [
      { href: '/zonas/reformas-salamanca', labelEs: 'Arquitectura en Salamanca', labelEn: 'Architecture in Salamanca' },
      { href: '/zonas/reformas-chamberi', labelEs: 'Arquitectura en Chamberí', labelEn: 'Architecture in Chamberí' },
      { href: '/zonas/reformas-chamartin', labelEs: 'Arquitectura en Chamartín', labelEn: 'Architecture in Chamartín' },
    ],
  },
  'cambio-uso-local-vivienda-madrid': {
    posts: [
      { href: '/blog/cambio-uso-local-vivienda-guia-completa', labelEs: 'Cambio de uso de local a vivienda: guía completa', labelEn: 'Commercial to residential conversion: full guide' },
      { href: '/blog/licencia-obra-madrid-guia', labelEs: 'Licencia de obra en Madrid: guía', labelEn: 'Building permit in Madrid: guide' },
    ],
    zones: [
      { href: '/zonas/reformas-chamberi', labelEs: 'Cambio de uso en Chamberí', labelEn: 'Conversion in Chamberí' },
      { href: '/zonas/reformas-salamanca', labelEs: 'Cambio de uso en Salamanca', labelEn: 'Conversion in Salamanca' },
      { href: '/zonas/reformas-retiro', labelEs: 'Cambio de uso en Retiro', labelEn: 'Conversion in Retiro' },
    ],
  },
  'obra-nueva-madrid': {
    posts: [
      { href: '/blog/licencia-obra-madrid-guia', labelEs: 'Licencia de obra en Madrid: guía', labelEn: 'Building permit in Madrid: guide' },
      { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
    ],
    zones: [
      { href: '/zonas/reformas-pozuelo', labelEs: 'Obra nueva en Pozuelo', labelEn: 'New construction in Pozuelo' },
      { href: '/zonas/reformas-las-rozas', labelEs: 'Obra nueva en Las Rozas', labelEn: 'New construction in Las Rozas' },
      { href: '/zonas/reformas-la-moraleja', labelEs: 'Obra nueva en La Moraleja', labelEn: 'New construction in La Moraleja' },
    ],
  },
  'promocion-inmobiliaria-madrid': {
    posts: [
      { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
      { href: '/blog/cambio-uso-local-vivienda-guia-completa', labelEs: 'Cambio de uso de local a vivienda', labelEn: 'Commercial to residential conversion' },
    ],
    zones: [
      { href: '/zonas/reformas-salamanca', labelEs: 'Promociones en Salamanca', labelEn: 'Developments in Salamanca' },
      { href: '/zonas/reformas-chamartin', labelEs: 'Promociones en Chamartín', labelEn: 'Developments in Chamartín' },
      { href: '/zonas/reformas-pozuelo', labelEs: 'Promociones en Pozuelo', labelEn: 'Developments in Pozuelo' },
    ],
  },
}

const processSteps = [
  { step: '01', titleKey: 'step1Title', descKey: 'step1Desc' },
  { step: '02', titleKey: 'step2Title', descKey: 'step2Desc' },
  { step: '03', titleKey: 'step3Title', descKey: 'step3Desc' },
  { step: '04', titleKey: 'step4Title', descKey: 'step4Desc' },
] as const

export default function ServiceContent({
  service,
  faqs,
}: {
  service: Service
  faqs: FAQ[] | undefined
}) {
  const locale = getLocale()
  const t = useT('services')
  const related = relatedContent[service.slug]

  return (
    <>
      {/* Hero */}
      <section className="relative h-[60vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url('${service.heroImage}')` }}
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12 w-full">
          <h1 className="text-white text-2xl md:text-3xl font-medium uppercase tracking-wide">
            {service.title[locale]}
          </h1>
        </div>
      </section>

      {/* Description */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={t('ourService')} className="mb-6" />
          <p className="text-lg text-neutral-700 leading-relaxed">
            {service.description[locale]}
          </p>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 bg-beige-subtle">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-10 text-center">
            {t('ourProcess')}
          </h2>
          <div className="grid md:grid-cols-4 gap-8" data-animate="stagger">
            {processSteps.map((item) => (
              <div key={item.step} className="text-center">
                <span className="text-3xl font-light text-primary block mb-3">{item.step}</span>
                <h4 className="text-sm font-bold uppercase tracking-widest mb-2">
                  {t(item.titleKey)}
                </h4>
                <p className="text-sm text-neutral-600">{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Content */}
      {related && (
        <section className="py-16 bg-white">
          <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
            {related.posts.length > 0 && (
              <div className="mb-12">
                <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
                  {t('relatedArticles')}
                </h2>
                <ul className="space-y-3">
                  {related.posts.map((post) => (
                    <li key={post.href}>
                      <Link href={post.href} className="text-primary hover:underline">
                        {locale === 'en' ? post.labelEn : post.labelEs}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {related.zones.length > 0 && (
              <div>
                <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
                  {t('areasWeServe')}
                </h2>
                <ul className="grid grid-cols-2 gap-3">
                  {related.zones.map((zone) => (
                    <li key={zone.href}>
                      <Link href={zone.href} className="text-primary hover:underline">
                        {locale === 'en' ? zone.labelEn : zone.labelEs}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* FAQ — preguntas frecuentes (visible; el schema FAQPage lo añade la página servidora) */}
      {faqs && faqs.length > 0 && (
        <section className="py-16 bg-beige-subtle">
          <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
            <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
              {t('faqTitle')}
            </h2>
            <div className="border-t border-neutral-200">
              {faqs.map((faq, i) => (
                <details key={i} className="group border-b border-neutral-200 py-5">
                  <summary className="flex justify-between items-start gap-4 cursor-pointer list-none">
                    <h3 className="text-base font-medium">{faq.question[locale]}</h3>
                    <span className="text-primary text-2xl leading-none shrink-0 transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="text-neutral-700 leading-relaxed mt-3">{faq.answer[locale]}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SmartForm */}
      <section className="py-16 bg-white" id="contacto">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
            {t('startProject')}
          </h2>
          <SmartForm
            defaultProjectType={service.projectType}
            source={`servicio-${service.slug}`}
          />
        </div>
      </section>
    </>
  )
}
