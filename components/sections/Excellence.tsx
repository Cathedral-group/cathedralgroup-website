import { useT } from '@/lib/translations'
import SectionLabel from '@/components/ui/SectionLabel'

export default function Excellence() {
  const t = useT('excellence')

  return (
    <section className="py-12 bg-white">
      <div className="max-w-5xl mx-auto px-6 text-center" data-animate="fade-up">
        <SectionLabel text={t('label')} className="mb-6" />
        <h3 className="text-lg md:text-xl font-light leading-relaxed mb-6">
          {t('text1')}{' '}
          <strong className="font-semibold">{t('bold')}</strong>
          {t('text2')}
        </h3>
        <p className="text-sm text-neutral-500 max-w-2xl mx-auto leading-relaxed">
          {t('text3')}
        </p>
      </div>
    </section>
  )
}
