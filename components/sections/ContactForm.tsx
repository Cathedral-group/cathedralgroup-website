'use client'

import { useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'

export default function ContactForm() {
  const t = useT('form')

  return (
    <section className="py-20 bg-white" id="contacto">
      <div className="max-w-6xl mx-auto px-6">
        {/* Dos columnas: texto/datos a la izquierda (llena el hueco horizontal),
            formulario a la derecha. Cada paso del formulario tiene poco contenido,
            así que una sola columna ancha dejaría el control flotando en blanco;
            repartir el ancho ocupa la pantalla y reduce el apilado vertical. */}
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div data-animate="fade-up">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-4">
              Cathedral Spaces
            </p>
            <h3 className="text-3xl md:text-4xl font-light uppercase tracking-wide leading-tight mb-6">
              {t('title')}
            </h3>
            <p className="text-neutral-600 leading-relaxed mb-10 max-w-md">
              {t('subtitle')}
            </p>
            <div className="space-y-2.5 text-sm text-neutral-500 border-t border-neutral-100 pt-8">
              <p>Paseo de la Castellana 40, 8&ordm; &middot; 28046 Madrid</p>
              <p>+34 684 725 606</p>
              <p>info@cathedralgroup.es</p>
            </div>
          </div>

          <div data-animate="fade-up">
            <SmartForm source="homepage" />
          </div>
        </div>
      </div>
    </section>
  )
}
