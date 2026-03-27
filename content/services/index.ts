export interface Service {
  slug: string
  titleEs: string
  titleEn: string
  descriptionEs: string
  descriptionEn: string
  heroImage: string
  projectType: string
}

export const services: Service[] = [
  {
    slug: 'reformas-integrales-madrid',
    titleEs: 'Reformas Integrales en Madrid',
    titleEn: 'Complete Renovations in Madrid',
    descriptionEs: 'Transformamos viviendas en espacios de lujo con reformas integrales de alto standing. Diseño, proyecto y ejecución llave en mano en las mejores zonas de Madrid.',
    descriptionEn: 'We transform homes into luxury spaces with high-end comprehensive renovations. Design, project and turnkey execution in the best areas of Madrid.',
    heroImage: '/img/project1.jpg',
    projectType: 'reforma',
  },
  {
    slug: 'interiorismo-madrid',
    titleEs: 'Interiorismo en Madrid',
    titleEn: 'Interior Design in Madrid',
    descriptionEs: 'Creamos interiores que combinan funcionalidad y estética, con materiales nobles y un diseño que refleja la personalidad de cada cliente.',
    descriptionEn: 'We create interiors that combine functionality and aesthetics, with noble materials and a design that reflects each client\'s personality.',
    heroImage: '/img/about_upscaled.jpg',
    projectType: 'interiorismo',
  },
  {
    slug: 'arquitectura-madrid',
    titleEs: 'Arquitectura en Madrid',
    titleEn: 'Architecture in Madrid',
    descriptionEs: 'Proyectos arquitectónicos residenciales y comerciales con una visión contemporánea que respeta la herencia constructiva madrileña.',
    descriptionEn: 'Residential and commercial architectural projects with a contemporary vision that respects Madrid\'s construction heritage.',
    heroImage: '/img/hero_final.jpg',
    projectType: 'otro',
  },
  {
    slug: 'cambio-uso-local-vivienda-madrid',
    titleEs: 'Cambio de Uso de Local a Vivienda en Madrid',
    titleEn: 'Commercial to Residential Conversion in Madrid',
    descriptionEs: 'Convertimos locales comerciales en viviendas de lujo, gestionando toda la tramitación urbanística y el diseño integral del espacio.',
    descriptionEn: 'We convert commercial premises into luxury homes, managing all urban planning procedures and the comprehensive space design.',
    heroImage: '/img/project2b.jpg',
    projectType: 'cambio-uso',
  },
  {
    slug: 'obra-nueva-madrid',
    titleEs: 'Obra Nueva en Madrid',
    titleEn: 'New Construction in Madrid',
    descriptionEs: 'Diseño y construcción de viviendas de nueva planta con los más altos estándares de calidad, eficiencia energética y diseño arquitectónico.',
    descriptionEn: 'Design and construction of new homes with the highest standards of quality, energy efficiency and architectural design.',
    heroImage: '/img/hero_final.jpg',
    projectType: 'obra-nueva',
  },
  {
    slug: 'promocion-inmobiliaria-madrid',
    titleEs: 'Promoción Inmobiliaria en Madrid',
    titleEn: 'Real Estate Development in Madrid',
    descriptionEs: 'Desarrollo integral de promociones residenciales exclusivas, desde la adquisición del suelo hasta la comercialización final.',
    descriptionEn: 'Comprehensive development of exclusive residential projects, from land acquisition to final commercialization.',
    heroImage: '/img/project2b.jpg',
    projectType: 'promocion',
  },
]

export function getServiceBySlug(slug: string) {
  return services.find((s) => s.slug === slug)
}
