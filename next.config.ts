import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['gray-matter', 'reading-time'],
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
