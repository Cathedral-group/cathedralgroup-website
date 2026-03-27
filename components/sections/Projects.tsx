'use client'

import { useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

const PROJECTS = [
  {
    image: '/img/project1.jpg',
    location: 'Salamanca, Madrid',
    name: 'Ático Velázquez',
    alt: 'Luxury penthouse renovation in Barrio de Salamanca Madrid',
  },
  {
    image: '/img/project2b.jpg',
    location: 'Pozuelo de Alarcón',
    name: 'Residencia La Finca',
    alt: 'Minimalist modern villa architecture in Pozuelo de Alarcon',
  },
]

export default function Projects() {
  const t = useT('projects')

  return (
    <section className="pt-16 pb-0 bg-beige-subtle" id="proyectos">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="flex justify-between items-end mb-10">
          <div>
            <SectionLabel text={t('label')} />
            <h3 className="text-2xl font-medium uppercase tracking-wide">
              {t('title')}
            </h3>
          </div>
          <a
            href="#"
            className="hidden md:block text-sm font-bold uppercase tracking-widest border-b-2 border-black pb-1 hover:border-primary hover:text-primary transition-colors"
          >
            {t('viewAll')}
          </a>
        </div>
      </div>

      {/* Full-width project grid */}
      <div className="grid md:grid-cols-2 gap-x-2" data-animate="stagger">
        {PROJECTS.map((project) => (
          <div
            key={project.name}
            className="relative aspect-[4/5] bg-neutral-100 overflow-hidden group img-hover-zoom"
          >
            <div
              className="w-full h-full bg-center bg-cover transition-transform duration-800 group-hover:scale-105"
              style={{ backgroundImage: `url('${project.image}')` }}
              role="img"
              aria-label={project.alt}
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-10 premium-transition">
              <div className="text-white">
                <p className="text-xs font-bold uppercase tracking-widest mb-2">
                  {project.location}
                </p>
                <h5 className="text-xl font-medium">{project.name}</h5>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
