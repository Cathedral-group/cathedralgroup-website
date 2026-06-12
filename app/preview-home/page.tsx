import Link from 'next/link'

// Página de previsualización (noindex, sin enlazar) de la futura home paraguas.
// Hero con el brand film + selector de las 4 divisiones. No toca la home real.

const DIVISIONS = [
  {
    key: 'spaces',
    name: 'Spaces',
    desc: 'Arquitectura residencial y reformas integrales de alto standing.',
    href: '/servicios',
    active: true,
  },
  {
    key: 'capital',
    name: 'Capital',
    desc: 'Inversión estratégica y consultoría inmobiliaria.',
    href: '#',
    active: false,
  },
  {
    key: 'properties',
    name: 'Properties',
    desc: 'Comercialización selecta de activos residenciales.',
    href: '#',
    active: false,
  },
  {
    key: 'developments',
    name: 'Developments',
    desc: 'Promoción y desarrollo de proyectos arquitectónicos singulares.',
    href: '#',
    active: false,
  },
]

export default function PreviewHomePage() {
  return (
    <main className="bg-white">
      {/* Hero con brand film */}
      <section className="relative w-full min-h-[88vh] flex items-center justify-center overflow-hidden bg-white">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          playsInline
          poster="/video/hero-poster.jpg"
        >
          <source src="/video/hero-cathedral.mp4" type="video/mp4" />
        </video>
      </section>

      {/* Selector de divisiones */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-3">
            Nuestras Divisiones
          </p>
          <h2 className="text-2xl font-light uppercase tracking-wide text-neutral-800">
            Elija cómo podemos ayudarle
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-200">
          {DIVISIONS.map((d) => {
            const card = (
              <div className="group bg-white hover:bg-[#37332F] transition-colors duration-500 p-8 h-full flex flex-col">
                <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-neutral-800 group-hover:text-white transition-colors mb-3">
                  {d.name}
                </p>
                <p className="text-sm leading-relaxed text-neutral-500 group-hover:text-neutral-300 transition-colors mb-6 flex-1">
                  {d.desc}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.active ? 'Explorar →' : 'Próximamente'}
                </p>
              </div>
            )
            return d.active ? (
              <Link key={d.key} href={d.href} className="block h-full">
                {card}
              </Link>
            ) : (
              <div key={d.key} className="h-full cursor-default">
                {card}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
