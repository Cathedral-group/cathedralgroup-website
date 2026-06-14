import type { Locale } from '@/lib/translations'

type LText = Record<Locale, string>

export interface Service {
  slug: string
  title: LText
  description: LText
  heroImage: string
  projectType: string
}

export const services: Service[] = [
  {
    slug: 'reformas-integrales-madrid',
    title: {
      es: 'Reformas Integrales en Madrid',
      en: 'Complete Renovations in Madrid',
    },
    description: {
      es: 'Transformamos viviendas en espacios de alto standing con reformas integrales de alto standing. Diseño, proyecto y ejecución llave en mano en las mejores zonas de Madrid.',
      en: 'We transform homes into high-end spaces with comprehensive renovations. Design, project and turnkey execution in the finest areas of Madrid.',
    },
    heroImage: '/img/serv-reformas-integrales.jpg',
    projectType: 'reforma',
  },
  {
    slug: 'interiorismo-madrid',
    title: {
      es: 'Interiorismo en Madrid',
      en: 'Interior Design in Madrid',
    },
    description: {
      es: 'Creamos interiores que combinan funcionalidad y estética, con materiales nobles y un diseño que refleja la personalidad de cada cliente.',
      en: 'We create interiors that combine function and beauty, with noble materials and a design that reflects the personality of each client.',
    },
    heroImage: '/img/serv-interiorismo.jpg',
    projectType: 'interiorismo',
  },
  {
    slug: 'arquitectura-madrid',
    title: {
      es: 'Arquitectura en Madrid',
      en: 'Architecture in Madrid',
    },
    description: {
      es: 'Proyectos arquitectónicos residenciales y comerciales con una visión contemporánea que respeta la herencia constructiva madrileña.',
      en: 'Residential and commercial architecture projects with a contemporary vision that respects Madrid’s building heritage.',
    },
    heroImage: '/img/serv-arquitectura.jpg',
    projectType: 'otro',
  },
  {
    slug: 'cambio-uso-local-vivienda-madrid',
    title: {
      es: 'Cambio de Uso de Local a Vivienda en Madrid',
      en: 'Commercial to Residential Conversion in Madrid',
    },
    description: {
      es: 'Convertimos locales comerciales en viviendas de alto standing, gestionando toda la tramitación urbanística y el diseño integral del espacio.',
      en: 'We convert commercial premises into high-end homes, handling all the planning procedures and the complete design of the space.',
    },
    heroImage: '/img/serv-cambio-uso.jpg',
    projectType: 'cambio-uso',
  },
  {
    slug: 'obra-nueva-madrid',
    title: {
      es: 'Obra Nueva en Madrid',
      en: 'New Construction in Madrid',
    },
    description: {
      es: 'Diseño y construcción de viviendas de nueva planta con los más altos estándares de calidad, eficiencia energética y diseño arquitectónico.',
      en: 'Design and construction of new-build homes to the highest standards of quality, energy efficiency and architectural design.',
    },
    heroImage: '/img/serv-obra-nueva.jpg',
    projectType: 'obra-nueva',
  },
  {
    slug: 'promocion-inmobiliaria-madrid',
    title: {
      es: 'Promoción Inmobiliaria en Madrid',
      en: 'Real Estate Development in Madrid',
    },
    description: {
      es: 'Desarrollo integral de promociones residenciales exclusivas, desde la adquisición del suelo hasta la comercialización final.',
      en: 'End-to-end development of exclusive residential projects, from land acquisition to final sale.',
    },
    heroImage: '/img/serv-promocion.jpg',
    projectType: 'promocion',
  },
]

export function getServiceBySlug(slug: string) {
  return services.find((s) => s.slug === slug)
}
