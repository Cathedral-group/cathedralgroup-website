'use client'

import { useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'

export default function ContactForm() {
  const t = useT('form')

  return (
    // Banda beige a todo el ancho (mismo criterio que el contacto de las
    // divisiones): la sección llena la pantalla y el formulario queda centrado
    // dentro, en columna. Sin columnas laterales, textos centrados.
    <section className="py-10 bg-[#F5F0EB]" id="contacto">
      <div className="px-6 md:px-10">
        <div className="text-center mb-6" data-animate="fade-up">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-4">
            Cathedral Spaces
          </p>
          <h3 className="text-2xl md:text-3xl font-light uppercase tracking-wide text-neutral-800 mb-3">
            {t('title')}
          </h3>
          <p className="text-sm text-neutral-600 max-w-xl mx-auto">{t('subtitle')}</p>
        </div>

        <SmartForm source="homepage" />
      </div>
    </section>
  )
}
