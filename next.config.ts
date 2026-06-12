import type { NextConfig } from 'next'

// Content Security Policy: limita qué orígenes pueden cargar scripts/imágenes/etc.
// Mitiga XSS: aunque un atacante inyecte código, el navegador NO ejecutará scripts
// de dominios no listados ni enviará la cookie de sesión a otros sitios.
//
// Orígenes externos permitidos:
//   - Cloudflare Turnstile (form de contacto): challenges.cloudflare.com
//   - Supabase (DB + Auth): cpqsnajuypgjjapvbqsr.supabase.co
//   - Google Fonts: fonts.googleapis.com / fonts.gstatic.com
//   - Vercel Insights/Analytics: vitals.vercel-insights.com / va.vercel-scripts.com
//   - Google Tag Manager / GA4: www.googletagmanager.com
//
// Si añades nuevos servicios externos, actualiza la directiva relevante.
const CSP_HEADER = [
  "default-src 'self'",
  // *.google-analytics.com / *.googletagmanager.com: pixel de fallback GA4
  // (guía oficial: developers.google.com/tag-platform/security/guides/csp)
  "img-src 'self' data: blob: https://cpqsnajuypgjjapvbqsr.supabase.co https://*.google-analytics.com https://*.googletagmanager.com",
  // 'unsafe-inline' es necesario por Next.js (hidrataciones inline). Sin nonces dinámicos.
  // 'unsafe-eval' eliminado 8/05/2026 (re-eliminado 18/05/2026 tras pivotar A — quitando
  // scanner opencv.js que lo requería). Next.js 15 no lo necesita en prod.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://www.googletagmanager.com",
  "script-src-elem 'self' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // GA4 envía hits a endpoints regionales (region1.google-analytics.com en la UE) y a
  // *.analytics.google.com — sin estos orígenes la CSP bloquea TODA la analítica
  // (guía oficial: developers.google.com/tag-platform/security/guides/csp#google_analytics_4).
  "connect-src 'self' https://cpqsnajuypgjjapvbqsr.supabase.co https://challenges.cloudflare.com https://vitals.vercel-insights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com",
  // www.google.com: iframe del mapa de Google Maps embed de la homepage.
  "frame-src 'self' https://challenges.cloudflare.com https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // 'self' (no 'none'): permite incrustar NUESTROS PROPIOS PDFs/imágenes same-origin
  // en <object>/<embed> — vista previa de documentos admin servida por
  // /api/admin/documentos/file?inline=1 (mismo origen). Solo 'self' → no abre
  // superficie a contenido <object> de terceros. Sin esto, el navegador bloquea
  // la vista previa incrustada aunque el archivo se sirva desde el propio dominio.
  "object-src 'self'",
].join('; ')

const nextConfig: NextConfig = {
  serverExternalPackages: ['gray-matter', 'reading-time', 'puppeteer-core', '@sparticuz/chromium'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // camera y geolocation permitidos en el propio dominio: el portal trabajador
          // los usa (foto ticket/albarán/foto avance + GPS al fichar). microphone
          // y FLoC bloqueados (no se usa, privacy).
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), interest-cohort=()' },
          { key: 'Content-Security-Policy', value: CSP_HEADER },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
    ]
  },
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/spaces.html', destination: '/servicios/reformas-integrales-madrid', permanent: true },
      { source: '/reforma-piso-madrid.html', destination: '/servicios/reformas-integrales-madrid', permanent: true },
      { source: '/interiorismo-madrid.html', destination: '/servicios/interiorismo-madrid', permanent: true },
      { source: '/arquitectura-madrid.html', destination: '/servicios/arquitectura-madrid', permanent: true },
      { source: '/estudio-arquitectura-madrid.html', destination: '/servicios/arquitectura-madrid', permanent: true },
      { source: '/cambio-uso-local-vivienda-madrid.html', destination: '/servicios/cambio-uso-local-vivienda-madrid', permanent: true },
      { source: '/reformas-madrid.html', destination: '/servicios/reformas-integrales-madrid', permanent: true },
      { source: '/reformas-salamanca.html', destination: '/zonas/reformas-salamanca', permanent: true },
      { source: '/reformas-chamberi.html', destination: '/zonas/reformas-chamberi', permanent: true },
      { source: '/reformas-chamartin.html', destination: '/zonas/reformas-chamartin', permanent: true },
      { source: '/reformas-pozuelo.html', destination: '/zonas/reformas-pozuelo', permanent: true },
      { source: '/reformas-las-rozas.html', destination: '/zonas/reformas-las-rozas', permanent: true },
      { source: '/reformas-majadahonda.html', destination: '/zonas/reformas-majadahonda', permanent: true },
      { source: '/zonas-madrid.html', destination: '/zonas', permanent: true },
      { source: '/nosotros.html', destination: '/nosotros', permanent: true },
      { source: '/contacto.html', destination: '/contacto', permanent: true },
      { source: '/proyectos.html', destination: '/proyectos', permanent: true },
      { source: '/legal.html', destination: '/legal', permanent: true },
    ]
  },
}

export default nextConfig
