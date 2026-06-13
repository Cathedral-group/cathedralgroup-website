import Link from 'next/link'
import { useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

export const metadata = {
  title: 'Proyectos: Portfolio de Reformas e Interiorismo en Madrid',
  description: 'Selección de reformas integrales, interiorismo y obra nueva de alto standing realizados en los mejores barrios de Madrid.',
  alternates: { canonical: '/proyectos' },
}

const PROJECTS = [
  { image: '/img/proj-atico.jpg', name: 'Ático Velázquez', zone: 'Salamanca', type: 'Reforma integral', href: '/zonas/reformas-salamanca' },
  { image: '/img/proj-villa.jpg', name: 'Residencia La Finca', zone: 'Pozuelo', type: 'Obra nueva', href: '/zonas/reformas-pozuelo' },
  { image: '/img/proj-castellana.jpg', name: 'Apartamento Castellana', zone: 'Chamberí', type: 'Interiorismo', href: '/zonas/reformas-chamberi' },
  { image: '/img/proj-loft.jpg', name: 'Loft Malasaña', zone: 'Centro', type: 'Cambio de uso', href: '/servicios/cambio-uso-local-vivienda-madrid' },
]

export default function ProyectosPage() {
  const t = useT('projects')

  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={t('label')} className="mb-4" />
          <h1 className="text-2xl font-medium uppercase tracking-wide">{t('title')}</h1>
        </div>
      </section>

      {/* Grid */}
      <section className="pb-16 bg-white">
        <div className="grid md:grid-cols-2 gap-2" data-animate="stagger">
          {PROJECTS.map((project) => (
            <Link
              key={project.name}
              href={project.href}
              className="relative aspect-[4/5] bg-neutral-100 overflow-hidden group block"
            >
              <div
                className="w-full h-full bg-center bg-cover transition-transform duration-800 group-hover:scale-105"
                style={{ backgroundImage: `url('${project.image}')` }}
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-10">
                <div className="text-white">
                  <p className="text-xs font-bold uppercase tracking-widest mb-1">{project.zone}</p>
                  <h3 className="text-xl font-medium mb-1">{project.name}</h3>
                  <p className="text-xs text-white/70 uppercase tracking-widest">{project.type}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
