import { useTranslations } from 'next-intl'
import SmartForm from '@/components/forms/SmartForm'

export default function ContactForm() {
  const t = useTranslations('form')

  return (
    <section className="py-16 bg-beige-subtle" id="contacto">
      <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
        <div className="text-center mb-10">
          <h3 className="text-2xl font-medium uppercase tracking-wide mb-4">
            {t('title')}
          </h3>
          <p className="text-neutral-600">{t('subtitle')}</p>
        </div>

        <SmartForm source="homepage" />
      </div>
    </section>
  )
}
