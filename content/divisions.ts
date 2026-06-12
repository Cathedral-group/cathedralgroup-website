// Datos de las cuatro divisiones de Cathedral Group.
// Spaces ya tiene su sección propia (la web de reformas actual); aquí viven las
// tres divisiones nuevas. Copy de presentación, sin cifras ni datos concretos.

export type Division = {
  slug: string
  name: string
  tagline: string
  heroImage: string
  intro: string
  pillars: { title: string; desc: string }[]
  ctaTitle: string
  formSource: string
}

export const divisions: Record<string, Division> = {
  capital: {
    slug: 'capital',
    name: 'Cathedral Capital',
    tagline: 'Inversión inmobiliaria estratégica',
    heroImage: '/img/division-capital.jpg',
    intro:
      'Identificamos, analizamos y gestionamos oportunidades de inversión inmobiliaria de alto standing en Madrid. Acompañamos al inversor en cada decisión con criterio técnico, discreción y una visión a largo plazo del valor del activo.',
    pillars: [
      {
        title: 'Análisis de oportunidad',
        desc: 'Estudio riguroso de cada activo: ubicación, estado, potencial de revalorización y rentabilidad esperada.',
      },
      {
        title: 'Gestión integral',
        desc: 'Coordinamos la operación de principio a fin, desde la adquisición hasta la puesta en valor del inmueble.',
      },
      {
        title: 'Visión patrimonial',
        desc: 'Estructuramos la inversión pensando en la solidez y el crecimiento del patrimonio a largo plazo.',
      },
    ],
    ctaTitle: 'Hablemos de su inversión',
    formSource: 'division-capital',
  },
  properties: {
    slug: 'properties',
    name: 'Cathedral Properties',
    tagline: 'Comercialización selecta de activos residenciales',
    heroImage: '/img/division-properties.jpg',
    intro:
      'Comercializamos activos residenciales exclusivos con un enfoque discreto y a medida. Cada propiedad recibe una presentación cuidada y un acompañamiento personalizado, dirigido a un perfil de cliente exigente.',
    pillars: [
      {
        title: 'Presentación cuidada',
        desc: 'Cada inmueble se presenta con el nivel de detalle y la estética que corresponde a su categoría.',
      },
      {
        title: 'Red selecta',
        desc: 'Conectamos cada activo con el perfil de comprador adecuado, con discreción y criterio.',
      },
      {
        title: 'Acompañamiento integral',
        desc: 'Asesoramos en cada paso de la operación, hasta la firma y más allá.',
      },
    ],
    ctaTitle: 'Confíenos su propiedad',
    formSource: 'division-properties',
  },
  developments: {
    slug: 'developments',
    name: 'Cathedral Developments',
    tagline: 'Promoción y desarrollo de proyectos singulares',
    heroImage: '/img/division-developments.jpg',
    intro:
      'Promovemos y desarrollamos proyectos residenciales singulares en las mejores ubicaciones de Madrid. Del suelo a la entrega, dirigimos cada fase con rigor técnico y una exigencia de calidad sin concesiones.',
    pillars: [
      {
        title: 'Visión de proyecto',
        desc: 'Concebimos cada promoción con una identidad arquitectónica propia y coherente con su entorno.',
      },
      {
        title: 'Dirección técnica',
        desc: 'Gestionamos el desarrollo completo con control de calidad, plazos y presupuesto en cada fase.',
      },
      {
        title: 'Calidad sin concesiones',
        desc: 'Materiales, ejecución y acabados a la altura del estándar de alto standing que nos define.',
      },
    ],
    ctaTitle: 'Desarrollemos su proyecto',
    formSource: 'division-developments',
  },
}
