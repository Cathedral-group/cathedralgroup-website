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
  {
    slug: 'reformas-el-viso',
    name: { es: 'El Viso', en: 'El Viso' },
    description: {
      es: 'La colonia más singular de Madrid, una trama discreta de hotelitos racionalistas de los años treinta junto a la Castellana, en pleno Chamartín. Viviendas unifamiliares de época, con su volumetría y sus líneas originales protegidas, que exigen reformas de alta especificación tan exigentes como respetuosas con su valor arquitectónico. Intervenimos con la mesura que estas casas reclaman: actualizar instalaciones y confort sin alterar el carácter que las hace irrepetibles.',
      en: 'Madrid’s most distinctive colonia, a discreet enclave of 1930s rationalist villas beside the Castellana, in the heart of Chamartín. These period detached houses, with their original massing and protected lines, call for high-specification renovations as demanding as they are respectful of their architectural value. We work with the restraint such homes deserve: bringing services and comfort up to date without disturbing the character that makes them irreplaceable.',
    },
    heroImage: '/img/zona-chamartin.jpg',
  },
  {
    slug: 'reformas-puerta-de-hierro',
    name: { es: 'Puerta de Hierro', en: 'Puerta de Hierro' },
    description: {
      es: 'Uno de los enclaves más exclusivos de Madrid, de grandes viviendas unifamiliares y residencias de embajada en torno al Club de Campo. Aquí abordamos reformas integrales y ampliaciones de casas señoriales sobre parcelas generosas, donde la privacidad y la calidad de los materiales son innegociables. Cada proyecto se concibe a medida, con la discreción que corresponde a una de las direcciones más reservadas de la ciudad.',
      en: 'One of Madrid’s most exclusive enclaves, of large detached homes and embassy residences around the Club de Campo. Here we undertake comprehensive renovations and extensions of grand single-family houses on generous plots, where privacy and the quality of materials are non-negotiable. Every project is conceived bespoke, with the discretion befitting one of the city’s most private addresses.',
    },
    heroImage: '/img/zona-la-moraleja.jpg',
  },
  {
    slug: 'reformas-centro-madrid',
    name: { es: 'Centro', en: 'City Centre' },
    description: {
      es: 'El casco histórico de Madrid —el Barrio de las Letras, Justicia, Cortes— reúne edificios de época y fachadas protegidas que piden una mano experta. Reformamos pisos clásicos conciliando el patrimonio con acabados contemporáneos, atendiendo a los condicionantes de los distritos centrales: licencias más estrictas, niveles de protección y la logística propia de obras en calles históricas. Un equilibrio entre la memoria del edificio y el confort de hoy.',
      en: 'Madrid’s historic core — the Barrio de las Letras, Justicia, Cortes — brings together period buildings and protected façades that call for an expert hand. We renovate classic flats reconciling heritage with contemporary finishes, attentive to the constraints of the central districts: stricter permits, listed protections and the logistics of working on historic streets. A balance between the building’s memory and the comfort of today.',
    },
    heroImage: '/img/zona-chamberi.jpg',
  },
  {
    slug: 'reformas-conde-de-orgaz',
    name: { es: 'Conde de Orgaz', en: 'Conde de Orgaz' },
    description: {
      es: 'Una colonia residencial premium dentro de la ciudad, en Hortaleza, donde la trama de Conde de Orgaz y La Piovera reúne viviendas unifamiliares con jardín y piscina. Realizamos reformas integrales de villas familiares que buscan más luz, distribuciones actuales y una relación fluida entre interior y exterior. La tranquilidad de un entorno ajardinado a pocos minutos del centro, con la calidad de acabados que la zona merece.',
      en: 'A premium residential colony within the city, in Hortaleza, where the Conde de Orgaz and La Piovera enclave gathers detached homes with garden and pool. We carry out comprehensive renovations of family villas seeking more light, contemporary layouts and a seamless relationship between inside and out. The calm of a landscaped setting minutes from the centre, with the quality of finish the area deserves.',
    },
    heroImage: '/img/zona-aravaca.jpg',
  },
  {
    slug: 'reformas-boadilla',
    name: { es: 'Boadilla del Monte', en: 'Boadilla del Monte' },
    description: {
      es: 'Municipio premium al suroeste de Madrid, con urbanizaciones muy demandadas como Las Lomas, Bonanza o Valdecabañas, donde las viviendas unifamiliares se asientan sobre parcelas generosas. Acometemos reformas integrales que integran el interior con el exterior ajardinado, ganando amplitud, luz natural y continuidad entre las estancias y la parcela. Proyectos pensados para familias que buscan espacio y altos estándares sin renunciar a la cercanía con la capital.',
      en: 'A premium municipality south-west of Madrid, with highly sought-after developments such as Las Lomas, Bonanza and Valdecabañas, where detached homes sit on generous plots. We undertake comprehensive renovations that integrate the interior with the landscaped exterior, gaining spaciousness, natural light and continuity between rooms and grounds. Projects designed for families seeking space and high standards without giving up proximity to the capital.',
    },
    heroImage: '/img/zona-pozuelo.jpg',
  },
  {
    slug: 'reformas-tres-cantos',
    name: { es: 'Tres Cantos', en: 'Tres Cantos' },
    description: {
      es: 'Ciudad planificada al norte de Madrid, de trazado ordenado y viviendas unifamiliares y pareadas de calidad. Aquí las reformas se orientan a modernizar distribuciones y a mejorar de forma decidida la eficiencia energética, con envolventes y carpinterías a la altura de las exigencias actuales. Un enfoque que combina confort, sostenibilidad y un diseño contemporáneo y sereno.',
      en: 'A planned town north of Madrid, of ordered layout and quality detached and semi-detached homes. Here renovations focus on modernising layouts and decisively improving energy performance, with building envelopes and joinery that meet today’s demands. An approach that combines comfort, sustainability and a contemporary, serene design.',
    },
    heroImage: '/img/zona-las-rozas.jpg',
  },
  {
    slug: 'reformas-villaviciosa-de-odon',
    name: { es: 'Villaviciosa de Odón', en: 'Villaviciosa de Odón' },
    description: {
      es: 'Municipio del suroeste madrileño con un parque residencial de viviendas unifamiliares, en particular la conocida urbanización de El Bosque, de grandes parcelas arboladas. Reformamos villas con amplios jardines buscando luz, amplitud y una conexión natural con el entorno verde que las rodea. Intervenciones cuidadas que actualizan la vivienda sin perder la calma del enclave.',
      en: 'A municipality in south-west Madrid with a stock of detached houses, notably the well-known El Bosque estate, of large wooded plots. We renovate villas with generous gardens in search of light, spaciousness and a natural connection with the green surroundings. Considered interventions that bring the home up to date without losing the calm of the setting.',
    },
    heroImage: '/img/zona-majadahonda.jpg',
  },
  {
    slug: 'reformas-galapagar',
    name: { es: 'Galapagar', en: 'Galapagar' },
    description: {
      es: 'En la sierra noroeste de Madrid, Galapagar reúne viviendas unifamiliares sobre grandes parcelas, con piedra natural y un entorno privilegiado. Nuestras reformas priorizan el aislamiento, la entrada de luz y una verdadera vida interior-exterior, esencial en un clima de sierra con inviernos exigentes. El objetivo: casas más cálidas, eficientes y abiertas al paisaje que las rodea.',
      en: 'In the sierra north-west of Madrid, Galapagar gathers detached homes on large plots, with natural stone and a privileged setting. Our renovations prioritise insulation, the flow of light and genuine indoor-outdoor living, essential in a mountain climate with demanding winters. The aim: warmer, more efficient homes open to the surrounding landscape.',
    },
    heroImage: '/img/zona-aravaca.jpg',
  },
  {
    slug: 'reformas-collado-villalba',
    name: { es: 'Collado Villalba', en: 'Collado Villalba' },
    description: {
      es: 'En plena sierra noroeste, Collado Villalba combina viviendas familiares y chalets que a menudo precisan una puesta al día completa. Acometemos reformas integrales que modernizan propiedades de sierra de cierta antigüedad, mejorando aislamiento, instalaciones y distribuciones para adaptarlas a la forma de vivir actual. Confort de montaña, sin renunciar a un diseño actual y bien resuelto.',
      en: 'Set in the sierra north-west, Collado Villalba combines family homes and detached houses that often need a thorough update. We undertake comprehensive renovations that modernise older sierra properties, improving insulation, services and layouts to suit how we live today. Mountain comfort, without giving up a contemporary, well-resolved design.',
    },
    heroImage: '/img/zona-las-rozas.jpg',
  },
  {
    slug: 'reformas-san-sebastian-de-los-reyes',
    name: { es: 'San Sebastián de los Reyes', en: 'San Sebastián de los Reyes' },
    description: {
      es: 'Al norte de Madrid, San Sebastián de los Reyes cuenta con áreas residenciales de calidad como el Club de Golf o Fuente del Fresno, de viviendas unifamiliares y entornos cuidados. Realizamos reformas de chalets y casas familiares que actualizan distribuciones, acabados y eficiencia, manteniendo el carácter de cada vivienda. Proyectos a medida para una zona consolidada y bien comunicada con la capital.',
      en: 'North of Madrid, San Sebastián de los Reyes offers quality residential areas such as the Club de Golf and Fuente del Fresno, of detached homes and well-kept surroundings. We renovate detached and family houses, updating layouts, finishes and efficiency while keeping the character of each home. Bespoke projects for an established area well connected to the capital.',
    },
    heroImage: '/img/zona-majadahonda.jpg',
  },
]

export function getZoneBySlug(slug: string) {
  return zones.find((z) => z.slug === slug)
}
