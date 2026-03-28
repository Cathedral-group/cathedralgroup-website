'use client'

import { useT } from '@/lib/translations'

const ZONES = [
  'Salamanca', 'Chamberí', 'Chamartín', 'Retiro',
  'Pozuelo de Alarcón', 'La Moraleja', 'Aravaca', 'Puerta de Hierro',
]

export default function Zones() {
  const t = useT('zones')

  return (
    <>
      <section className="py-20 bg-white text-neutral-900" id="zonas">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header — centered, matching other sections */}
          <div className="text-center mb-16" data-animate="fade-up">
            <span className="text-primary text-sm font-bold uppercase tracking-[0.3em] mb-4 block">
              {t('label') || 'Zonas'}
            </span>
            <h3 className="text-2xl font-medium uppercase tracking-wide mb-6">
              {t('title')} {t('titleHighlight')}
            </h3>
            <p className="text-neutral-500 max-w-2xl mx-auto leading-relaxed">
              {t('description')}
            </p>
          </div>

          {/* 4 columns × 2 rows */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-6 max-w-4xl mx-auto" data-animate="stagger">
            {ZONES.map((zone) => (
              <div
                key={zone}
                className="flex items-center gap-3 text-neutral-800"
              >
                <span className="w-1.5 h-1.5 bg-primary flex-shrink-0" />
                <span className="text-sm tracking-wide">{zone}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Google Maps Embed — full width */}
      <div className="h-96 relative overflow-hidden" style={{ filter: 'grayscale(100%) opacity(0.7)' }}>
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d48800!2d-3.72!3d40.44!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd4228e23705d39f%3A0xa6835401e4cd4c25!2sPaseo%20de%20la%20Castellana%2C%2040%2C%2028046%20Madrid%2C%20Spain!5e0!3m2!1ses!2ses!4v1711574400000"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Mapa de Madrid"
        />
      </div>
    </>
  )
}
