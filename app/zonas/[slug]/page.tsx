import { notFound } from 'next/navigation'
import Link from 'next/link'
import { zones, getZoneBySlug } from '@/content/zones'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

const relatedServices: { href: string; labelEs: string; labelEn: string }[] = [
  { href: '/servicios/reformas-integrales-madrid', labelEs: 'Reformas integrales en Madrid', labelEn: 'Complete renovations in Madrid' },
  { href: '/servicios/interiorismo-madrid', labelEs: 'Interiorismo en Madrid', labelEn: 'Interior design in Madrid' },
  { href: '/servicios/arquitectura-madrid', labelEs: 'Arquitectura en Madrid', labelEn: 'Architecture in Madrid' },
]

const zoneRelatedPosts: Record<string, { href: string; labelEs: string; labelEn: string }[]> = {
  'reformas-salamanca': [
    { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de lujo en Salamanca', labelEn: 'Luxury renovations in Salamanca' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
  ],
  'reformas-chamberi': [
    { href: '/blog/reformas-lujo-chamberi-madrid', labelEs: 'Reformas de lujo en Chamberí', labelEn: 'Luxury renovations in Chamberí' },
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
    { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de lujo: referencia Salamanca', labelEn: 'Luxury renovations: Salamanca reference' },
    { href: '/blog/precio-reforma-integral-madrid-2026', labelEs: 'Precio reforma integral Madrid 2026', labelEn: 'Renovation cost in Madrid 2026' },
    { href: '/blog/tendencias-interiorismo-2026', labelEs: 'Tendencias en interiorismo 2026', labelEn: 'Interior design trends 2026' },
  ],
}

export function generateStaticParams() {
  return zones.map((z) => ({ slug: z.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  const zone = getZoneBySlug(slug)
  if (!zone) return {}

  const name = locale === 'en' ? zone.nameEn : zone.nameEs
  return {
    title: `Reformas en ${name} | Cathedral Group`,
    description: locale === 'en' ? zone.descriptionEn : zone.descriptionEs,
  }
}

export default async function ZonePage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  const zone = getZoneBySlug(slug)

  if (!zone) notFound()

  const name = locale === 'en' ? zone.nameEn : zone.nameEs
  const description = locale === 'en' ? zone.descriptionEn : zone.descriptionEs

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
            {locale === 'en' ? `Renovations in ${name}` : `Reformas en ${name}`}
          </h1>
        </div>
      </section>

      {/* Description */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={name} className="mb-6" />
          <p className="text-lg text-neutral-700 leading-relaxed mb-8">
            {description}
          </p>

          {/* Zone highlights */}
          <div className="grid grid-cols-2 gap-6 pt-8 border-t border-neutral-200">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">
                {locale === 'en' ? 'Specialty' : 'Especialidad'}
              </p>
              <p className="text-sm">{locale === 'en' ? 'Luxury renovations' : 'Reformas de lujo'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">
                {locale === 'en' ? 'Service' : 'Servicio'}
              </p>
              <p className="text-sm">{locale === 'en' ? 'Turnkey' : 'Llave en mano'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Related Content */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <div className="mb-12">
            <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
              {locale === 'en' ? 'Our Services' : 'Nuestros Servicios'}
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
          {zoneRelatedPosts[slug] && zoneRelatedPosts[slug].length > 0 && (
            <div>
              <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
                {locale === 'en' ? 'Related Articles' : 'Artículos Relacionados'}
              </h2>
              <ul className="space-y-3">
                {zoneRelatedPosts[slug].map((post) => (
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

      {/* SmartForm */}
      <section className="py-16 bg-beige-subtle" id="contacto">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
            {locale === 'en' ? `Start Your Project in ${name}` : `Inicie su Proyecto en ${name}`}
          </h2>
          <SmartForm
            defaultZone={zone.nameEs}
            source={`zona-${zone.slug}`}
          />
        </div>
      </section>
    </>
  )
}
