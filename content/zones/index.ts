export interface Zone {
  slug: string
  nameEs: string
  nameEn: string
  descriptionEs: string
  descriptionEn: string
  heroImage: string
}

export const zones: Zone[] = [
  {
    slug: 'reformas-salamanca',
    nameEs: 'Salamanca',
    nameEn: 'Salamanca',
    descriptionEs: 'El barrio más exclusivo de Madrid, con edificios señoriales y una demanda constante de reformas de alto nivel. Especializados en áticos y pisos de representación en las calles Serrano, Velázquez y Ortega y Gasset.',
    descriptionEn: 'Madrid\'s most exclusive neighborhood, with stately buildings and a constant demand for high-end renovations. Specialized in penthouses and representative apartments on Serrano, Velázquez and Ortega y Gasset streets.',
    heroImage: '/img/project1.jpg',
  },
  {
    slug: 'reformas-chamberi',
    nameEs: 'Chamberí',
    nameEn: 'Chamberí',
    descriptionEs: 'Barrio señorial con edificios de principios del siglo XX, techos altos y una arquitectura que invita a reformas que preserven su carácter original con acabados contemporáneos.',
    descriptionEn: 'A stately neighborhood with early 20th century buildings, high ceilings and architecture that invites renovations preserving its original character with contemporary finishes.',
    heroImage: '/img/about_upscaled.jpg',
  },
  {
    slug: 'reformas-chamartin',
    nameEs: 'Chamartín',
    nameEn: 'Chamartín',
    descriptionEs: 'Zona residencial premium con grandes viviendas familiares. Reformas integrales que maximizan el potencial de espacios amplios con distribuciones modernas.',
    descriptionEn: 'Premium residential area with large family homes. Comprehensive renovations that maximize the potential of spacious areas with modern layouts.',
    heroImage: '/img/hero_final.jpg',
  },
  {
    slug: 'reformas-retiro',
    nameEs: 'Retiro',
    nameEn: 'Retiro',
    descriptionEs: 'Junto al pulmón verde de Madrid, viviendas con vistas al parque que merecen reformas a la altura de su privilegiada ubicación.',
    descriptionEn: 'Next to Madrid\'s green lung, homes with park views that deserve renovations matching their privileged location.',
    heroImage: '/img/project2b.jpg',
  },
  {
    slug: 'reformas-pozuelo',
    nameEs: 'Pozuelo de Alarcón',
    nameEn: 'Pozuelo de Alarcón',
    descriptionEs: 'El municipio con mayor renta per cápita de España. Chalets y villas de lujo que demandan reformas integrales con los más altos estándares.',
    descriptionEn: 'Spain\'s municipality with the highest per capita income. Luxury chalets and villas demanding comprehensive renovations with the highest standards.',
    heroImage: '/img/project1.jpg',
  },
  {
    slug: 'reformas-las-rozas',
    nameEs: 'Las Rozas',
    nameEn: 'Las Rozas',
    descriptionEs: 'Urbanizaciones exclusivas con amplios espacios exteriores. Reformas que integran interior y exterior para crear viviendas contemporáneas.',
    descriptionEn: 'Exclusive residential developments with spacious outdoor areas. Renovations integrating interior and exterior to create contemporary homes.',
    heroImage: '/img/about_upscaled.jpg',
  },
  {
    slug: 'reformas-majadahonda',
    nameEs: 'Majadahonda',
    nameEn: 'Majadahonda',
    descriptionEs: 'Zona residencial familiar de alto standing. Reformas que combinan funcionalidad para familias con acabados de lujo.',
    descriptionEn: 'High-end family residential area. Renovations combining family functionality with luxury finishes.',
    heroImage: '/img/hero_final.jpg',
  },
  {
    slug: 'reformas-aravaca',
    nameEs: 'Aravaca',
    nameEn: 'Aravaca',
    descriptionEs: 'Enclave tranquilo con viviendas unifamiliares de calidad. Reformas que respetan el entorno natural y maximizan la luz y los espacios.',
    descriptionEn: 'Quiet enclave with quality single-family homes. Renovations respecting the natural environment and maximizing light and spaces.',
    heroImage: '/img/project2b.jpg',
  },
  {
    slug: 'reformas-la-moraleja',
    nameEs: 'La Moraleja',
    nameEn: 'La Moraleja',
    descriptionEs: 'La urbanización más exclusiva de Madrid. Mansiones y villas que requieren proyectos de reforma y diseño al más alto nivel internacional.',
    descriptionEn: 'Madrid\'s most exclusive residential area. Mansions and villas requiring renovation and design projects at the highest international level.',
    heroImage: '/img/project1.jpg',
  },
]

export function getZoneBySlug(slug: string) {
  return zones.find((z) => z.slug === slug)
}
