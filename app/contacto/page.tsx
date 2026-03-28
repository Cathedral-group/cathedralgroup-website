import { useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'

export default function ContactoPage() {
  const t = useT('form')

  return (
    <>
      {/* Header + Contact info + Form — all in one flow */}
      <section className="pt-16 pb-8 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center" data-animate="fade-up">
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">{t('title')}</h1>
          <p className="text-neutral-600 mb-8">{t('subtitle')}</p>

          {/* Contact info */}
          <div className="grid md:grid-cols-3 gap-6 mb-8 py-6 border-t border-b border-neutral-200">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Dirección</p>
              <p className="text-sm">Paseo de la Castellana 40, 8º<br />28046 Madrid</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Teléfono</p>
              <p className="text-sm">
                <a href="tel:+34684725606" className="hover:text-primary transition-colors">+34 684 725 606</a>
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Email</p>
              <p className="text-sm">
                <a href="mailto:info@cathedralgroup.es" className="hover:text-primary transition-colors">info@cathedralgroup.es</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SmartForm — reduced top padding to flow naturally */}
      <section className="pb-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-2">Solicitud de presupuesto</p>
            <p className="text-sm text-neutral-500">Complete el formulario y nos pondremos en contacto a la mayor brevedad.</p>
          </div>
          <SmartForm source="contacto" />
        </div>
      </section>

      {/* Map with pin */}
      <div className="h-96 relative overflow-hidden" style={{ filter: 'grayscale(100%) opacity(0.7)' }}>
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d48800!2d-3.72!3d40.44!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd4228e23705d39f%3A0xa6835401e4cd4c25!2sPaseo%20de%20la%20Castellana%2C%2040%2C%2028046%20Madrid%2C%20Spain!5e0!3m2!1ses!2ses!4v1711574400000"
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
