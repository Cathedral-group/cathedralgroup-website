'use client'

import Image from 'next/image'
import { useT } from '@/lib/translations'

export default function Footer() {
  const t = useT('footer')

  return (
    <footer className="bg-white">
      {/* Línea divisoria de lado a lado */}
      <hr className="border-t border-neutral-100" />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-10 text-center">
          {/* Columna 1: Logo & Descripción */}
          <div>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Image
                src="/img/logo.png"
                alt="Cathedral Group"
                width={24}
                height={24}
                className="h-6 w-auto object-contain"
              />
              <span className="text-xs font-bold uppercase tracking-widest">Cathedral Group</span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              {t('description')}
            </p>
          </div>

          {/* Columna 2: Divisiones */}
          <div>
            <h5 className="text-xs font-bold uppercase tracking-widest mb-6">
              {t('divisions')}
            </h5>
            <ul className="space-y-3 text-xs text-neutral-500">
              <li><a href="/spaces" className="hover:text-primary transition-colors">Cathedral Spaces</a></li>
              <li><a href="/capital" className="hover:text-primary transition-colors">Cathedral Capital</a></li>
              <li><a href="/properties" className="hover:text-primary transition-colors">Cathedral Properties</a></li>
              <li><a href="/developments" className="hover:text-primary transition-colors">Cathedral Developments</a></li>
            </ul>
          </div>

          {/* Columna 3: Contacto */}
          <div>
            <h5 className="text-xs font-bold uppercase tracking-widest mb-6">
              {t('contact')}
            </h5>
            <ul className="space-y-3 text-xs text-neutral-500">
              <li>Paseo de la Castellana 40, 8&ordm;</li>
              <li>28046 Madrid, Espa&ntilde;a</li>
              <li>+34 684 725 606</li>
              <li>info@cathedralgroup.es</li>
            </ul>
          </div>

          {/* Columna 4: Síguenos */}
          <div>
            <h5 className="text-xs font-bold uppercase tracking-widest mb-6">
              {t('follow')}
            </h5>
            <div className="flex justify-center gap-4">
              <a
                href="#"
                className="w-10 h-10 border border-neutral-200 flex items-center justify-center hover:bg-primary hover:text-white transition-colors premium-transition"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              {/* Solo Instagram (decisión David 12/06). Sin enlace todavía —
                  cuando exista el perfil, sustituir href="#" por la URL real. */}
            </div>
          </div>
        </div>

        {/* Índice SEO compacto: servicios y zonas (enlazado interno discreto,
            rastreable desde toda la web, sin competir con el footer principal). */}
        <div className="border-t border-neutral-100 pt-6 space-y-2 text-center">
          <p className="text-[11px] leading-relaxed text-neutral-400">
            <span className="font-bold uppercase tracking-widest text-neutral-500 mr-1">Servicios</span>{' '}
            <a href="/servicios/reformas-integrales-madrid" className="hover:text-primary transition-colors">Reformas integrales</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/servicios/interiorismo-madrid" className="hover:text-primary transition-colors">Interiorismo</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/servicios/arquitectura-madrid" className="hover:text-primary transition-colors">Arquitectura</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/servicios/cambio-uso-local-vivienda-madrid" className="hover:text-primary transition-colors">Cambio de uso</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/servicios/obra-nueva-madrid" className="hover:text-primary transition-colors">Obra nueva</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/servicios/promocion-inmobiliaria-madrid" className="hover:text-primary transition-colors">Promoción</a>
          </p>
          <p className="text-[11px] leading-relaxed text-neutral-400">
            <span className="font-bold uppercase tracking-widest text-neutral-500 mr-1">Zonas</span>{' '}
            <a href="/zonas/reformas-salamanca" className="hover:text-primary transition-colors">Salamanca</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-chamberi" className="hover:text-primary transition-colors">Chamberí</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-chamartin" className="hover:text-primary transition-colors">Chamartín</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-retiro" className="hover:text-primary transition-colors">Retiro</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-pozuelo" className="hover:text-primary transition-colors">Pozuelo</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-las-rozas" className="hover:text-primary transition-colors">Las Rozas</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-majadahonda" className="hover:text-primary transition-colors">Majadahonda</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-aravaca" className="hover:text-primary transition-colors">Aravaca</a>
            <span className="mx-1.5 text-neutral-300">·</span>
            <a href="/zonas/reformas-la-moraleja" className="hover:text-primary transition-colors">La Moraleja</a>
          </p>
        </div>
      </div>

      {/* Línea divisoria de lado a lado antes del pie */}
      <hr className="border-t border-neutral-100" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:justify-between items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          <p>&copy; {new Date().getFullYear()} Cathedral House Investment S.L. — {t('rights')}</p>
          <div className="flex gap-6">
            <a href="/legal" className="hover:text-primary premium-transition">{t('legal')}</a>
            <a href="/legal#privacidad" className="hover:text-primary premium-transition">{t('privacy')}</a>
            <a href="/legal#cookies" className="hover:text-primary premium-transition">{t('cookies')}</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
