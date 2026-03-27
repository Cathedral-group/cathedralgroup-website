import { useTranslations } from 'next-intl'
import SmartForm from '@/components/forms/SmartForm'

export default function ContactoPage() {
  const t = useTranslations('form')

  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center" data-animate="fade-up">
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">{t('title')}</h1>
          <p className="text-neutral-600 mb-6">{t('subtitle')}</p>

          {/* Contact info */}
          <div className="grid md:grid-cols-3 gap-6 mb-12 pt-8 border-t border-neutral-200">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Dirección</p>
              <p className="text-sm">Paseo de la Castellana 40, 8º<br />28046 Madrid</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Teléfono</p>
              <p className="text-sm">+34 684 725 606</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Email</p>
              <p className="text-sm">info@cathedralgroup.es</p>
            </div>
          </div>
        </div>
      </section>

      {/* SmartForm */}
      <section className="py-16 bg-beige-subtle">
        <div className="max-w-3xl mx-auto px-6">
          <SmartForm source="contacto" />
        </div>
      </section>

      {/* Map */}
      <div className="h-96 relative overflow-hidden" style={{ filter: 'grayscale(100%) opacity(0.7)' }}>
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d97200!2d-3.6933!3d40.4356!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1ses!2ses!4v1"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Mapa Cathedral Group"
        />
      </div>
    </>
  )
}
