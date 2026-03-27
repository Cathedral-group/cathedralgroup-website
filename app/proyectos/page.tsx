import { useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

const PROJECTS = [
  { image: '/img/project1.jpg', name: 'Ático Velázquez', zone: 'Salamanca', type: 'Reforma integral' },
  { image: '/img/project2b.jpg', name: 'Residencia La Finca', zone: 'Pozuelo', type: 'Obra nueva' },
  { image: '/img/hero_final.jpg', name: 'Apartamento Castellana', zone: 'Chamberí', type: 'Interiorismo' },
  { image: '/img/about_upscaled.jpg', name: 'Loft Malasaña', zone: 'Centro', type: 'Cambio de uso' },
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
            <div
              key={project.name}
              className="relative aspect-[4/5] bg-neutral-100 overflow-hidden group"
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
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
