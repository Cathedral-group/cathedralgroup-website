import { notFound } from 'next/navigation'
import { zones, getZoneBySlug } from '@/content/zones'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

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
