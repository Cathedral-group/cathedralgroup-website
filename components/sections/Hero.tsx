import { useT } from '@/lib/translations'

export default function Hero() {
  const t = useT('hero')

  return (
    <section className="relative h-[90vh] flex items-center overflow-hidden">
      {/* Parallax Background */}
      <div className="absolute inset-0" data-animate="parallax">
        <div
          className="w-full bg-center bg-cover"
          style={{
            backgroundImage: "url('/img/hero_final.jpg')",
            height: '120%',
          }}
        />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6" data-animate="text-reveal">
        <h2 className="text-white leading-tight mb-8">
          <span className="block text-2xl md:text-3xl font-bold mb-2">
            {t('title')}
          </span>
          <span
            className="block text-xl md:text-2xl font-light"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
          >
            {t('subtitle')}
          </span>
        </h2>

        {/* Divider */}
        <div className="h-0.5 w-20 bg-white mt-6 mb-8" />

        {/* CTA */}
        <a
          href="#proyectos"
          className="inline-block bg-white text-neutral-900 px-10 py-5 text-sm font-medium uppercase tracking-widest hover:bg-primary hover:text-white transition-all duration-500"
        >
          {t('cta')}
        </a>
      </div>
    </section>
  )
}
