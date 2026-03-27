import { useTranslations } from 'next-intl'

const DIVISIONS = [
  { key: 'spaces' },
  { key: 'capital' },
  { key: 'properties' },
  { key: 'developments' },
] as const

export default function Divisions() {
  const t = useTranslations('divisions')

  return (
    <section className="bg-beige-subtle" id="servicios">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-primary text-sm font-bold uppercase tracking-[0.3em] mb-4 block">
            {t('label')}
          </span>
          <h3 className="text-2xl font-medium uppercase tracking-wide">
            {t('title')}
          </h3>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-4 gap-6" data-animate="stagger">
          {DIVISIONS.map(({ key }) => (
            <div
              key={key}
              className="bg-white p-8 group hover:bg-stone-dark transition-all duration-700 premium-transition flex flex-col h-full"
            >
              <h4 className="text-base font-medium uppercase tracking-widest mb-4 group-hover:text-white transition-colors">
                {t(key)}
              </h4>
              <p className="text-neutral-600 group-hover:text-neutral-300 text-sm leading-relaxed mb-6 flex-grow transition-colors">
                {t(`${key}Desc`)}
              </p>
              <a
                href="#"
                className="text-[10px] font-bold uppercase tracking-widest border-b border-primary group-hover:border-white group-hover:text-white inline-block w-fit transition-colors"
              >
                {t('explore')}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
