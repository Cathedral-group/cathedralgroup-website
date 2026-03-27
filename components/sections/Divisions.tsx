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
    <section className="bg-white" id="servicios">
      {/* Header */}
      <div className="text-center pt-16 pb-10 px-6" data-animate="fade-up">
        <span className="text-primary text-sm font-bold uppercase tracking-[0.3em] mb-4 block">
          {t('label')}
        </span>
        <h3 className="text-2xl font-medium uppercase tracking-wide">
          {t('title')}
        </h3>
      </div>

      {/* Cards — items-stretch ensures equal height, mt-auto pushes button to bottom */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-6 pb-16 items-stretch" data-animate="stagger">
        {DIVISIONS.map(({ key }) => (
          <div
            key={key}
            className="bg-white p-8 group hover:bg-[#5A5550] transition-all duration-700 premium-transition flex flex-col border border-neutral-100 md:border-0"
          >
            <h4 className="text-base font-medium uppercase tracking-widest mb-4 group-hover:text-white transition-colors">
              {t(key)}
            </h4>
            <p className="text-neutral-600 group-hover:text-neutral-300 text-sm leading-relaxed mb-6 flex-1 transition-colors">
              {t(`${key}Desc`)}
            </p>
            <a
              href="#"
              className="text-[10px] font-bold uppercase tracking-widest border-b border-primary group-hover:border-white group-hover:text-white inline-block w-fit transition-colors mt-auto"
            >
              {t('explore')}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
