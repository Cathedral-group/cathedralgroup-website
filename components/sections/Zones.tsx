import { useT } from '@/lib/translations'

const ZONES_LEFT = ['Salamanca', 'Chamberí', 'Retiro', 'El Viso']
const ZONES_RIGHT = ['Pozuelo de Alarcón', 'La Moraleja', 'Aravaca', 'Puerta de Hierro']

export default function Zones() {
  const t = useT('zones')

  return (
    <>
      <section className="py-12 bg-beige-subtle text-neutral-900" id="zonas">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 items-center gap-10">
            {/* Text + Zone List */}
            <div data-animate="fade-left">
              <h3 className="text-2xl font-light mb-6">
                {t('title')}{' '}
                <span className="text-neutral-900">{t('titleHighlight')}</span>
              </h3>
              <p className="text-neutral-600 mb-12 leading-relaxed">
                {t('description')}
              </p>

              <div className="grid grid-cols-2 gap-6">
                <ul className="space-y-4">
                  {ZONES_LEFT.map((zone) => (
                    <li key={zone} className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 bg-primary" />
                      {zone}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-4">
                  {ZONES_RIGHT.map((zone) => (
                    <li key={zone} className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 bg-primary" />
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
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d97200!2d-3.72!3d40.45!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd4228e23705d39f%3A0x9a90c2e9e63b2ed9!2sPaseo%20de%20la%20Castellana%2C%2040%2C%2028046%20Madrid!5e0!3m2!1ses!2ses!4v1"
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
