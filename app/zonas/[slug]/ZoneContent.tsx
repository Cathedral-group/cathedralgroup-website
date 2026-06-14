'use client'

import Link from 'next/link'
import type { Zone } from '@/content/zones'
import { getLocale, useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

type LinkItem = { href: string; labelEs: string; labelEn: string }

const relatedServices: LinkItem[] = [
  { href: '/servicios/reformas-integrales-madrid', labelEs: 'Reformas integrales en Madrid', labelEn: 'Complete renovations in Madrid' },
  { href: '/servicios/interiorismo-madrid', labelEs: 'Interiorismo en Madrid', labelEn: 'Interior design in Madrid' },
  { href: '/servicios/arquitectura-madrid', labelEs: 'Arquitectura en Madrid', labelEn: 'Architecture in Madrid' },
]

const zoneRelatedPosts: Record<string, LinkItem[]> = {
  'reformas-salamanca': [
    { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de alto standing en Salamanca', labelEn: 'High-end renovations in Salamanca' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
  ],
  'reformas-chamberi': [
    { href: '/blog/reformas-lujo-chamberi-madrid', labelEs: 'Reformas de alto standing en Chamberí', labelEn: 'High-end renovations in Chamberí' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-chamartin': [
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/reforma-integral-vs-parcial', labelEs: 'Reforma integral vs parcial', labelEn: 'Full vs partial renovation' },
  ],
  'reformas-retiro': [
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
  ],
  'reformas-pozuelo': [
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/reformar-atico-madrid-precio', labelEs: 'Reformar un ático en Madrid: precio', labelEn: 'Penthouse renovation in Madrid: cost' },
  ],
  'reformas-las-rozas': [
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/reforma-integral-vs-parcial', labelEs: 'Reforma integral vs parcial', labelEn: 'Full vs partial renovation' },
  ],
  'reformas-majadahonda': [
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
  ],
  'reformas-aravaca': [
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/reforma-integral-vs-parcial', labelEs: 'Reforma integral vs parcial', labelEn: 'Full vs partial renovation' },
  ],
  'reformas-la-moraleja': [
    { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de alto standing: referencia Salamanca', labelEn: 'High-end renovations: Salamanca reference' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
  ],
  'reformas-el-viso': [
    { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de alto standing en Salamanca', labelEn: 'High-end renovations in Salamanca' },
    { href: '/blog/reformar-atico-madrid-precio', labelEs: 'Reformar un ático en Madrid: precio', labelEn: 'Penthouse renovation in Madrid: cost' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-puerta-de-hierro': [
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/reformas-pozuelo-chalets-lujo', labelEs: 'Reformas de chalets de alto standing en Pozuelo', labelEn: 'High-end villa renovations in Pozuelo' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-centro-madrid': [
    { href: '/blog/normativa-reforma-madrid-2026', labelEs: 'Normativa de reformas en Madrid 2026', labelEn: 'Renovation regulations in Madrid 2026' },
    { href: '/blog/licencia-obra-madrid-guia', labelEs: 'Licencia de obra en Madrid: guía', labelEn: 'Building permits in Madrid: a guide' },
    { href: '/blog/reforma-integral-vs-parcial', labelEs: 'Reforma integral vs parcial', labelEn: 'Full vs partial renovation' },
  ],
  'reformas-conde-de-orgaz': [
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/reformas-pozuelo-chalets-lujo', labelEs: 'Reformas de chalets de alto standing en Pozuelo', labelEn: 'High-end villa renovations in Pozuelo' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-boadilla': [
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/reformas-pozuelo-chalets-lujo', labelEs: 'Reformas de chalets de alto standing en Pozuelo', labelEn: 'High-end villa renovations in Pozuelo' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-tres-cantos': [
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/passivhaus-madrid-casa-pasiva', labelEs: 'Passivhaus en Madrid: la casa pasiva', labelEn: 'Passivhaus in Madrid: the passive house' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-villaviciosa-de-odon': [
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/reformas-pozuelo-chalets-lujo', labelEs: 'Reformas de chalets de alto standing en Pozuelo', labelEn: 'High-end villa renovations in Pozuelo' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-galapagar': [
    { href: '/blog/passivhaus-madrid-casa-pasiva', labelEs: 'Passivhaus en Madrid: la casa pasiva', labelEn: 'Passivhaus in Madrid: the passive house' },
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/reformas-pozuelo-chalets-lujo', labelEs: 'Reformas de chalets de alto standing en Pozuelo', labelEn: 'High-end villa renovations in Pozuelo' },
  ],
  'reformas-collado-villalba': [
    { href: '/blog/passivhaus-madrid-casa-pasiva', labelEs: 'Passivhaus en Madrid: la casa pasiva', labelEn: 'Passivhaus in Madrid: the passive house' },
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
  'reformas-san-sebastian-de-los-reyes': [
    { href: '/blog/precio-construccion-chalet-lujo-madrid', labelEs: 'Precio de construir un chalet de alto standing en Madrid', labelEn: 'Cost of building a high-end villa in Madrid' },
    { href: '/blog/reformas-pozuelo-chalets-lujo', labelEs: 'Reformas de chalets de alto standing en Pozuelo', labelEn: 'High-end villa renovations in Pozuelo' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
  ],
}

export default function ZoneContent({ zone }: { zone: Zone }) {
  const locale = getLocale()
  const t = useT('zones')
  const name = zone.name[locale]
  const posts = zoneRelatedPosts[zone.slug]

  return (
    <>
      {/* Hero */}
      <section className="relative h-[60vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url('${zone.heroImage}')` }}
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12 w-full">
          <h1 className="text-white text-2xl md:text-3xl font-medium uppercase tracking-wide">
            {t('renovationsIn')} {name}
          </h1>
        </div>
      </section>

      {/* Description */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={name} className="mb-6" />
          <p className="text-lg text-neutral-700 leading-relaxed mb-8">
            {zone.description[locale]}
          </p>

          {/* Zone highlights */}
          <div className="grid grid-cols-2 gap-6 pt-8 border-t border-neutral-200">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">
                {t('specialty')}
              </p>
              <p className="text-sm">{t('specialtyValue')}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">
                {t('service')}
              </p>
              <p className="text-sm">{t('serviceValue')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Related Content */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <div className="mb-12">
            <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
              {t('ourServices')}
            </h2>
            <ul className="space-y-3">
              {relatedServices.map((service) => (
                <li key={service.href}>
                  <Link href={service.href} className="text-primary hover:underline">
                    {locale === 'en' ? service.labelEn : service.labelEs}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {posts && posts.length > 0 && (
            <div>
              <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
                {t('relatedArticles')}
              </h2>
              <ul className="space-y-3">
                {posts.map((post) => (
                  <li key={post.href}>
                    <Link href={post.href} className="text-primary hover:underline">
                      {locale === 'en' ? post.labelEn : post.labelEs}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* SmartForm — defaultZone se envía en español para mantener coherencia en el CRM */}
      <section className="py-16 bg-beige-subtle" id="contacto">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
            {t('startProjectIn')} {name}
          </h2>
          <SmartForm
            defaultZone={zone.name.es}
            source={`zona-${zone.slug}`}
          />
        </div>
      </section>
    </>
  )
}
