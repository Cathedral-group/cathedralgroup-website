import { useTranslations } from 'next-intl'

const ZONES_LEFT = ['Salamanca', 'Chamberí', 'Retiro', 'El Viso']
const ZONES_RIGHT = ['Pozuelo de Alarcón', 'La Moraleja', 'Aravaca', 'Puerta de Hierro']

export default function Zones() {
  const t = useTranslations('zones')

  return (
    <>
      <section className="py-12 bg-beige-subtle text-neutral-900" id="zonas">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 items-center gap-10" data-animate="fade-left">
            {/* Text + Zone List */}
            <div>
              <h3 className="text-2xl font-light mb-6">
                {t('title')}{' '}
                <span className="text-neutral-900">{t('titleHighlight')}</span>
              </h3>
              <p className="text-neutral-600 mb-12 leading-relaxed">
                {t('description')}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <ul className="space-y-3">
                  {ZONES_LEFT.map((zone) => (
                    <li key={zone} className="flex items-center gap-3 text-sm">
                      <span className="w-1.5 h-1.5 bg-primary flex-shrink-0" />
                      {zone}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-3">
                  {ZONES_RIGHT.map((zone) => (
                    <li key={zone} className="flex items-center gap-3 text-sm">
                      <span className="w-1.5 h-1.5 bg-primary flex-shrink-0" />
                      {zone}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right placeholder for balance */}
            <div className="hidden md:block" />
          </div>
        </div>
      </section>

      {/* Google Maps Embed — full width */}
      <div className="h-96 relative overflow-hidden" style={{ filter: 'grayscale(100%) opacity(0.7)' }}>
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d97200!2d-3.6933!3d40.4356!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1ses!2ses!4v1"
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
