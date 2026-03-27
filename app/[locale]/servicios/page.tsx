import { Link } from '@/lib/i18n/routing'
import { services } from '@/content/services'
import SectionLabel from '@/components/ui/SectionLabel'

export default function ServiciosHubPage() {
  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text="Nuestros Servicios" className="mb-4" />
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">
            Servicios de Arquitectura y Diseño
          </h1>
          <p className="text-neutral-600 max-w-2xl">
            Soluciones integrales de arquitectura, diseño y construcción para los proyectos más exigentes de Madrid.
          </p>
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
                  {service.titleEs}
                </h3>
                <p className="text-sm text-neutral-600 mt-2">{service.descriptionEs}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
