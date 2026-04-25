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
//
// Si añades nuevos servicios externos, actualiza la directiva relevante.
const CSP_HEADER = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://cpqsnajuypgjjapvbqsr.supabase.co",
  // 'unsafe-inline' es necesario por Next.js (hidrataciones inline). Sin nonces dinámicos.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://cpqsnajuypgjjapvbqsr.supabase.co https://challenges.cloudflare.com https://vitals.vercel-insights.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  serverExternalPackages: ['gray-matter', 'reading-time'],
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
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
