import type { Locale } from '@/lib/translations'

type LText = Record<Locale, string>

export interface Zone {
  slug: string
  name: LText
  description: LText
  heroImage: string
}

export const zones: Zone[] = [
  {
    slug: 'reformas-salamanca',
    name: { es: 'Salamanca', en: 'Salamanca' },
    description: {
      es: 'El barrio más exclusivo de Madrid, con edificios señoriales y una demanda constante de reformas de alto nivel. Especializados en áticos y pisos de representación en las calles Serrano, Velázquez y Ortega y Gasset.',
      en: 'Madrid’s most exclusive neighbourhood, with stately buildings and a steady demand for high-end renovations. We specialise in penthouses and signature apartments on Serrano, Velázquez and Ortega y Gasset.',
    },
    heroImage: '/img/zona-salamanca.jpg',
  },
  {
    slug: 'reformas-chamberi',
    name: { es: 'Chamberí', en: 'Chamberí' },
    description: {
      es: 'Barrio señorial con edificios de principios del siglo XX, techos altos y una arquitectura que invita a reformas que preserven su carácter original con acabados contemporáneos.',
      en: 'A stately district of early twentieth-century buildings, high ceilings and architecture that invites renovations preserving its original character alongside contemporary finishes.',
    },
    heroImage: '/img/zona-chamberi.jpg',
  },
  {
    slug: 'reformas-chamartin',
    name: { es: 'Chamartín', en: 'Chamartín' },
    description: {
      es: 'Zona residencial premium con grandes viviendas familiares. Reformas integrales que maximizan el potencial de espacios amplios con distribuciones modernas.',
      en: 'A premium residential area of large family homes. Comprehensive renovations that make the most of generous spaces with modern layouts.',
    },
    heroImage: '/img/zona-chamartin.jpg',
  },
  {
    slug: 'reformas-retiro',
    name: { es: 'Retiro', en: 'Retiro' },
    description: {
      es: 'Junto al pulmón verde de Madrid, viviendas con vistas al parque que merecen reformas a la altura de su privilegiada ubicación.',
      en: 'Beside Madrid’s green lung, homes with views over the park that deserve renovations worthy of their privileged setting.',
    },
    heroImage: '/img/zona-retiro.jpg',
  },
  {
    slug: 'reformas-pozuelo',
    name: { es: 'Pozuelo de Alarcón', en: 'Pozuelo de Alarcón' },
    description: {
      es: 'El municipio con mayor renta per cápita de España. Chalets y villas de alto standing que demandan reformas integrales con los más altos estándares.',
      en: 'The municipality with the highest income per capita in Spain. High-end villas and detached homes that call for comprehensive renovations to the very highest standards.',
    },
    heroImage: '/img/zona-pozuelo.jpg',
  },
  {
    slug: 'reformas-las-rozas',
    name: { es: 'Las Rozas', en: 'Las Rozas' },
    description: {
      es: 'Urbanizaciones exclusivas con amplios espacios exteriores. Reformas que integran interior y exterior para crear viviendas contemporáneas.',
      en: 'Exclusive residential developments with generous outdoor space. Renovations that bring interior and exterior together to create contemporary homes.',
    },
    heroImage: '/img/zona-las-rozas.jpg',
  },
  {
    slug: 'reformas-majadahonda',
    name: { es: 'Majadahonda', en: 'Majadahonda' },
    description: {
      es: 'Zona residencial familiar de alto standing. Reformas que combinan funcionalidad para familias con acabados de alto standing.',
      en: 'A high-end family residential area. Renovations that combine practical family living with high-end finishes.',
    },
    heroImage: '/img/zona-majadahonda.jpg',
  },
  {
    slug: 'reformas-aravaca',
    name: { es: 'Aravaca', en: 'Aravaca' },
    description: {
      es: 'Enclave tranquilo con viviendas unifamiliares de calidad. Reformas que respetan el entorno natural y maximizan la luz y los espacios.',
      en: 'A peaceful enclave of quality detached homes. Renovations that respect the natural surroundings while maximising light and space.',
    },
    heroImage: '/img/zona-aravaca.jpg',
  },
  {
    slug: 'reformas-la-moraleja',
    name: { es: 'La Moraleja', en: 'La Moraleja' },
    description: {
      es: 'La urbanización más exclusiva de Madrid. Mansiones y villas que requieren proyectos de reforma y diseño al más alto nivel internacional.',
      en: 'Madrid’s most exclusive residential estate. Mansions and villas that demand renovation and design projects at the highest international level.',
    },
    heroImage: '/img/zona-la-moraleja.jpg',
  },
]

export function getZoneBySlug(slug: string) {
  return zones.find((z) => z.slug === slug)
}
