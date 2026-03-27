import { notFound } from 'next/navigation'
import Link from 'next/link'
import { services, getServiceBySlug } from '@/content/services'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

const relatedContent: Record<string, { posts: { href: string; labelEs: string; labelEn: string }[]; zones: { href: string; labelEs: string; labelEn: string }[] }> = {
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
      { href: '/blog/reformas-lujo-salamanca-madrid', labelEs: 'Reformas de lujo en Salamanca', labelEn: 'Luxury renovations in Salamanca' },
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

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  const service = getServiceBySlug(slug)
  if (!service) return {}

  const title = locale === 'en' ? service.titleEn : service.titleEs
  return {
    title: `${title} | Cathedral Group`,
    description: locale === 'en' ? service.descriptionEn : service.descriptionEs,
  }
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  const service = getServiceBySlug(slug)

  if (!service) notFound()

  const title = locale === 'en' ? service.titleEn : service.titleEs
  const description = locale === 'en' ? service.descriptionEn : service.descriptionEs

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
            {title}
          </h1>
        </div>
      </section>

      {/* Description */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={locale === 'en' ? 'Our Service' : 'Nuestro Servicio'} className="mb-6" />
          <p className="text-lg text-neutral-700 leading-relaxed">
            {description}
          </p>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 bg-beige-subtle">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-10 text-center">
            {locale === 'en' ? 'Our Process' : 'Nuestro Proceso'}
          </h2>
          <div className="grid md:grid-cols-4 gap-8" data-animate="stagger">
            {[
              { step: '01', titleEs: 'Consulta', titleEn: 'Consultation', descEs: 'Sesión privada para entender su visión y objetivos.', descEn: 'Private session to understand your vision and goals.' },
              { step: '02', titleEs: 'Diseño', titleEn: 'Design', descEs: 'Propuesta de diseño con renders 3D y materiales.', descEn: 'Design proposal with 3D renders and materials.' },
              { step: '03', titleEs: 'Ejecución', titleEn: 'Execution', descEs: 'Gestión integral de la obra con control de calidad.', descEn: 'Comprehensive project management with quality control.' },
              { step: '04', titleEs: 'Entrega', titleEn: 'Delivery', descEs: 'Entrega llave en mano con garantía completa.', descEn: 'Turnkey delivery with full warranty.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <span className="text-3xl font-light text-primary block mb-3">{item.step}</span>
                <h4 className="text-sm font-bold uppercase tracking-widest mb-2">
                  {locale === 'en' ? item.titleEn : item.titleEs}
                </h4>
                <p className="text-sm text-neutral-600">
                  {locale === 'en' ? item.descEn : item.descEs}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Content */}
      {relatedContent[slug] && (
        <section className="py-16 bg-white">
          <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
            {relatedContent[slug].posts.length > 0 && (
              <div className="mb-12">
                <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
                  {locale === 'en' ? 'Related Articles' : 'Artículos Relacionados'}
                </h2>
                <ul className="space-y-3">
                  {relatedContent[slug].posts.map((post) => (
                    <li key={post.href}>
                      <Link href={post.href} className="text-primary hover:underline">
                        {locale === 'en' ? post.labelEn : post.labelEs}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {relatedContent[slug].zones.length > 0 && (
              <div>
                <h2 className="text-xl font-medium uppercase tracking-wide mb-6">
                  {locale === 'en' ? 'Areas We Serve' : 'Zonas Donde Trabajamos'}
                </h2>
                <ul className="grid grid-cols-2 gap-3">
                  {relatedContent[slug].zones.map((zone) => (
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

      {/* SmartForm */}
      <section className="py-16 bg-white" id="contacto">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
            {locale === 'en' ? 'Start Your Project' : 'Inicie su Proyecto'}
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
