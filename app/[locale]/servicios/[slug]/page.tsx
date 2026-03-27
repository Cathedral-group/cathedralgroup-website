import { notFound } from 'next/navigation'
import { services, getServiceBySlug } from '@/content/services'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

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
