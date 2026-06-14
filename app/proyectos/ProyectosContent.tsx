'use client'

import Link from 'next/link'
import { getLocale, useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

// Cuerpo de la página de proyectos (cliente, para traducir según la cookie de
// idioma). La metadata/SEO permanece en español en la página servidora.
// Los nombres de zona son topónimos (no se traducen) salvo 'Centro' -> 'City Centre';
// el sustantivo descriptivo del nombre del proyecto sí se traduce, el nombre propio no.
const PROJECTS = [
  { image: '/img/proj-atico.jpg', name: 'Ático Velázquez', nameEn: 'Velázquez Penthouse', zone: 'Salamanca', typeKey: 'typeReformaIntegral', href: '/zonas/reformas-salamanca' },
  { image: '/img/proj-villa.jpg', name: 'Residencia La Finca', nameEn: 'La Finca Residence', zone: 'Pozuelo', typeKey: 'typeObraNueva', href: '/zonas/reformas-pozuelo' },
  { image: '/img/proj-castellana.jpg', name: 'Apartamento Castellana', nameEn: 'Castellana Apartment', zone: 'Chamberí', typeKey: 'typeInteriorismo', href: '/zonas/reformas-chamberi' },
  { image: '/img/proj-loft.jpg', name: 'Loft Malasaña', nameEn: 'Malasaña Loft', zone: 'Centro', typeKey: 'typeCambioUso', href: '/servicios/cambio-uso-local-vivienda-madrid' },
] as const

export default function ProyectosContent() {
  const locale = getLocale()
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
                  <p className="text-xs font-bold uppercase tracking-widest mb-1">{locale === 'en' && project.zone === 'Centro' ? 'City Centre' : project.zone}</p>
                  <h3 className="text-xl font-medium mb-1">{locale === 'en' ? project.nameEn : project.name}</h3>
                  <p className="text-xs text-white/70 uppercase tracking-widest">{t(project.typeKey)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
