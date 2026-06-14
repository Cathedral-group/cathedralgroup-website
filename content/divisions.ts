// Datos de las cuatro divisiones de Cathedral Group.
// Spaces ya tiene su sección propia (la web de reformas actual); aquí viven las
// tres divisiones nuevas. Copy de presentación, sin cifras ni datos concretos.
// Bilingüe (es/en): DivisionLanding elige por getLocale().

import type { Locale } from '@/lib/translations'

type LText = Record<Locale, string>

export type Division = {
  slug: string
  name: string
  heroImage: string
  formSource: string
  tagline: LText
  intro: LText
  pillars: { title: LText; desc: LText }[]
  ctaTitle: LText
}

export const divisions: Record<string, Division> = {
  capital: {
    slug: 'capital',
    name: 'Cathedral Capital',
    heroImage: '/img/division-capital.jpg',
    formSource: 'division-capital',
    tagline: {
      es: 'Inversión inmobiliaria estratégica',
      en: 'Strategic real estate investment',
    },
    intro: {
      es: 'Identificamos, analizamos y gestionamos oportunidades de inversión inmobiliaria de alto standing en Madrid. Acompañamos al inversor en cada decisión con criterio técnico, discreción y una visión a largo plazo del valor del activo.',
      en: 'We identify, analyse and manage high-end real estate investment opportunities in Madrid. We support investors in every decision with technical judgement, discretion and a long-term view of asset value.',
    },
    pillars: [
      {
        title: { es: 'Análisis de oportunidad', en: 'Opportunity analysis' },
        desc: {
          es: 'Estudio riguroso de cada activo: ubicación, estado, potencial de revalorización y rentabilidad esperada.',
          en: 'A rigorous study of each asset: location, condition, appreciation potential and expected return.',
        },
      },
      {
        title: { es: 'Gestión integral', en: 'End-to-end management' },
        desc: {
          es: 'Coordinamos la operación de principio a fin, desde la adquisición hasta la puesta en valor del inmueble.',
          en: 'We coordinate the operation from start to finish, from acquisition to enhancing the value of the property.',
        },
      },
      {
        title: { es: 'Visión patrimonial', en: 'Wealth perspective' },
        desc: {
          es: 'Estructuramos la inversión pensando en la solidez y el crecimiento del patrimonio a largo plazo.',
          en: 'We structure the investment for the soundness and long-term growth of your wealth.',
        },
      },
    ],
    ctaTitle: { es: 'Hablemos de su inversión', en: 'Let us discuss your investment' },
  },
  properties: {
    slug: 'properties',
    name: 'Cathedral Properties',
    heroImage: '/img/division-properties.jpg',
    formSource: 'division-properties',
    tagline: {
      es: 'Comercialización selecta de activos residenciales',
      en: 'Select marketing of residential assets',
    },
    intro: {
      es: 'Comercializamos activos residenciales exclusivos con un enfoque discreto y a medida. Cada propiedad recibe una presentación cuidada y un acompañamiento personalizado, dirigido a un perfil de cliente exigente.',
      en: 'We market exclusive residential assets with a discreet, tailored approach. Each property receives a refined presentation and personalised guidance, aimed at a discerning client.',
    },
    pillars: [
      {
        title: { es: 'Presentación cuidada', en: 'Refined presentation' },
        desc: {
          es: 'Cada inmueble se presenta con el nivel de detalle y la estética que corresponde a su categoría.',
          en: 'Each property is presented with the level of detail and the aesthetics its category deserves.',
        },
      },
      {
        title: { es: 'Red selecta', en: 'Select network' },
        desc: {
          es: 'Conectamos cada activo con el perfil de comprador adecuado, con discreción y criterio.',
          en: 'We connect each asset with the right buyer profile, with discretion and judgement.',
        },
      },
      {
        title: { es: 'Acompañamiento integral', en: 'End-to-end support' },
        desc: {
          es: 'Asesoramos en cada paso de la operación, hasta la firma y más allá.',
          en: 'We advise at every step of the operation, through to signing and beyond.',
        },
      },
    ],
    ctaTitle: { es: 'Confíenos su propiedad', en: 'Entrust us with your property' },
  },
  developments: {
    slug: 'developments',
    name: 'Cathedral Developments',
    heroImage: '/img/division-developments.jpg',
    formSource: 'division-developments',
    tagline: {
      es: 'Promoción y desarrollo de proyectos singulares',
      en: 'Development of distinctive projects',
    },
    intro: {
      es: 'Promovemos y desarrollamos proyectos residenciales singulares en las mejores ubicaciones de Madrid. Del suelo a la entrega, dirigimos cada fase con rigor técnico y una exigencia de calidad sin concesiones.',
      en: 'We promote and develop distinctive residential projects in the best locations in Madrid. From land to handover, we direct every phase with technical rigour and an uncompromising standard of quality.',
    },
    pillars: [
      {
        title: { es: 'Visión de proyecto', en: 'Project vision' },
        desc: {
          es: 'Concebimos cada promoción con una identidad arquitectónica propia y coherente con su entorno.',
          en: 'We conceive each development with its own architectural identity, coherent with its surroundings.',
        },
      },
      {
        title: { es: 'Dirección técnica', en: 'Technical management' },
        desc: {
          es: 'Gestionamos el desarrollo completo con control de calidad, plazos y presupuesto en cada fase.',
          en: 'We manage the full development with quality, schedule and budget control at every phase.',
        },
      },
      {
        title: { es: 'Calidad sin concesiones', en: 'Uncompromising quality' },
        desc: {
          es: 'Materiales, ejecución y acabados a la altura del estándar de alto standing que nos define.',
          en: 'Materials, execution and finishes worthy of the high-end standard that defines us.',
        },
      },
    ],
    ctaTitle: { es: 'Desarrollemos su proyecto', en: 'Let us develop your project' },
  },
}
