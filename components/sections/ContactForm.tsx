'use client'

import { useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'

export default function ContactForm() {
  const t = useT('form')

  return (
    <section className="py-16 bg-white" id="contacto">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center mb-6" data-animate="fade-up">
          <h3 className="text-2xl font-medium uppercase tracking-wide mb-4">
            {t('title')}
          </h3>
          <p className="text-neutral-600">{t('subtitle')}</p>
        </div>

        <div className="max-w-2xl mx-auto">
          <SmartForm source="homepage" />
        </div>
      </div>
    </section>
  )
}
