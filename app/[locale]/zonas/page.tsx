import { useTranslations } from 'next-intl'
import { Link } from '@/lib/i18n/routing'
import { zones } from '@/content/zones'
import SectionLabel from '@/components/ui/SectionLabel'

export default function ZonasHubPage() {
  const t = useTranslations('zones')

  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={t('label')} className="mb-4" />
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">
            {t('title')} {t('titleHighlight')}
          </h1>
          <p className="text-neutral-600 max-w-2xl">{t('description')}</p>
        </div>
      </section>

      {/* Zone grid */}
      <section className="pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6" data-animate="stagger">
            {zones.map((zone) => (
              <Link
                key={zone.slug}
                href={`/zonas/${zone.slug}`}
                className="group block"
              >
                <div className="relative aspect-[3/2] overflow-hidden bg-neutral-100 mb-4">
                  <div
                    className="w-full h-full bg-center bg-cover transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url('${zone.heroImage}')` }}
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest group-hover:text-primary transition-colors">
                  {zone.nameEs}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
