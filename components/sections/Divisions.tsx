import { useT } from '@/lib/translations'

const DIVISIONS = [
  { key: 'spaces' },
  { key: 'capital' },
  { key: 'properties' },
  { key: 'developments' },
] as const

export default function Divisions() {
  const t = useT('divisions')

  return (
    <section className="bg-beige-subtle" id="servicios">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="text-primary text-xs font-bold uppercase tracking-[0.3em] mb-3 block">
            {t('label')}
          </span>
          <h3 className="text-xl md:text-2xl font-medium uppercase tracking-wide">
            {t('title')}
          </h3>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {DIVISIONS.map(({ key }) => (
            <div
              key={key}
              className="bg-white p-6 md:p-8 group hover:bg-stone-dark transition-all duration-700 flex flex-col h-full border border-neutral-100"
            >
              <h4 className="text-sm md:text-base font-medium uppercase tracking-widest mb-3 group-hover:text-white transition-colors">
                {t(key)}
              </h4>
              <p className="text-neutral-500 group-hover:text-neutral-300 text-xs md:text-sm leading-relaxed mb-4 flex-grow transition-colors">
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
