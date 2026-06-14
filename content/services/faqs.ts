import type { Locale } from '@/lib/translations'

type LText = Record<Locale, string>

export interface FAQ {
  question: LText
  answer: LText
}

export const serviceFaqs: Record<string, FAQ[]> = {
  'reformas-integrales-madrid': [
    {
      question: {
        es: '¿Cuánto cuesta una reforma integral en Madrid?',
        en: 'How much does a full renovation cost in Madrid?',
      },
      answer: {
        es: 'El precio de una reforma integral en Madrid oscila entre 600 y 2.500 €/m², dependiendo del nivel de acabados. Para un piso de 100 m² con acabados premium, el presupuesto típico se sitúa entre 80.000 y 150.000 €.',
        en: 'The price of a full renovation in Madrid ranges between €600 and €2,500/m², depending on the level of finishes. For a 100 m² apartment with premium finishes, the typical budget falls between €80,000 and €150,000.',
      },
    },
    {
      question: {
        es: '¿Cuánto tiempo dura una reforma integral?',
        en: 'How long does a full renovation take?',
      },
      answer: {
        es: 'Una reforma integral en Madrid dura entre 3 y 6 meses, dependiendo de la superficie y complejidad del proyecto. Los proyectos de alto standing con materiales importados pueden extenderse hasta 8 meses.',
        en: 'A full renovation in Madrid takes between 3 and 6 months, depending on the surface area and complexity of the project. High-end projects with imported materials can extend to 8 months.',
      },
    },
    {
      question: {
        es: '¿Necesito licencia de obra para una reforma integral?',
        en: 'Do I need a building permit for a full renovation?',
      },
      answer: {
        es: 'Sí, las reformas integrales en Madrid requieren licencia de obra mayor, que incluye proyecto técnico visado por un arquitecto. El trámite tarda entre 2 y 4 meses en el Ayuntamiento de Madrid.',
        en: 'Yes. Full renovations in Madrid require a major works permit, which includes a technical project certified by an architect. The process takes between 2 and 4 months at Madrid City Council.',
      },
    },
    {
      question: {
        es: '¿Qué incluye una reforma integral?',
        en: 'What does a full renovation include?',
      },
      answer: {
        es: 'Una reforma integral incluye: demoliciones, redistribución de espacios, instalaciones eléctricas y de fontanería nuevas, revestimientos de suelos y paredes, cocina y baños completos, carpintería, pintura y acabados finales.',
        en: 'A full renovation includes demolition, the redistribution of spaces, new electrical and plumbing systems, floor and wall finishes, a complete kitchen and bathrooms, joinery, painting and the final finishes.',
      },
    },
  ],
  'interiorismo-madrid': [
    {
      question: {
        es: '¿Cuánto cuesta un proyecto de interiorismo en Madrid?',
        en: 'How much does an interior design project cost in Madrid?',
      },
      answer: {
        es: 'Un proyecto de interiorismo en Madrid cuesta entre 50 y 150 €/m² solo por el diseño, sin incluir ejecución. Un proyecto completo de diseño + ejecución para un piso de 120 m² se sitúa entre 80.000 y 200.000 €.',
        en: 'An interior design project in Madrid costs between €50 and €150/m² for the design alone, excluding the works. A complete design and execution project for a 120 m² apartment falls between €80,000 and €200,000.',
      },
    },
    {
      question: {
        es: '¿Qué diferencia hay entre interiorismo y decoración?',
        en: 'What is the difference between interior design and decoration?',
      },
      answer: {
        es: 'El interiorismo trabaja la arquitectura interior del espacio: distribución, iluminación, materiales y mobiliario a medida. La decoración se centra en los elementos superficiales: textiles, accesorios y objetos decorativos.',
        en: 'Interior design works on the interior architecture of the space: layout, lighting, materials and bespoke furniture. Decoration focuses on the surface elements: textiles, accessories and decorative objects.',
      },
    },
  ],
  'cambio-uso-local-vivienda-madrid': [
    {
      question: {
        es: '¿Se puede convertir un local comercial en vivienda en Madrid?',
        en: 'Can commercial premises be converted into a home in Madrid?',
      },
      answer: {
        es: 'Sí, siempre que el local cumpla los requisitos urbanísticos del PGOU de Madrid: superficie mínima, ventilación natural, altura libre mínima de 2,50 m y acceso independiente desde zona común del edificio.',
        en: 'Yes, provided the premises meet the planning requirements of Madrid’s urban development plan (PGOU): a minimum surface area, natural ventilation, a minimum clear height of 2.50 m and independent access from the common areas of the building.',
      },
    },
    {
      question: {
        es: '¿Cuánto cuesta un cambio de uso de local a vivienda?',
        en: 'How much does a commercial to residential conversion cost?',
      },
      answer: {
        es: 'El coste total de un cambio de uso en Madrid oscila entre 1.200 y 2.000 €/m², incluyendo proyecto técnico, licencias, obra y acabados. Para un local de 80 m², el presupuesto típico es de 100.000 a 160.000 €.',
        en: 'The total cost of a change of use in Madrid ranges between €1,200 and €2,000/m², including the technical project, permits, works and finishes. For an 80 m² unit, the typical budget is €100,000 to €160,000.',
      },
    },
  ],
  'arquitectura-madrid': [
    {
      question: {
        es: '¿Cuánto cobra un estudio de arquitectura en Madrid?',
        en: 'How much does an architecture firm charge in Madrid?',
      },
      answer: {
        es: 'Los honorarios de un estudio de arquitectura en Madrid oscilan entre el 8% y el 15% del presupuesto de ejecución material. Para proyectos residenciales de alto standing, los honorarios suelen situarse en el 10-12%.',
        en: 'Architecture firm fees in Madrid range between 8% and 15% of the material execution budget. For high-end residential projects, fees are usually around 10-12%.',
      },
    },
  ],
  'obra-nueva-madrid': [
    {
      question: {
        es: '¿Cuánto cuesta construir una casa en Madrid?',
        en: 'How much does it cost to build a house in Madrid?',
      },
      answer: {
        es: 'El coste de construcción de una vivienda nueva en Madrid oscila entre 1.500 y 3.000 €/m², dependiendo de la calidad de los materiales y la complejidad del diseño. No incluye el precio del suelo.',
        en: 'The cost of building a new home in Madrid ranges between €1,500 and €3,000/m², depending on the quality of the materials and the complexity of the design. The price of the land is not included.',
      },
    },
  ],
  'promocion-inmobiliaria-madrid': [
    {
      question: {
        es: '¿Qué es una promoción inmobiliaria?',
        en: 'What is a real estate development?',
      },
      answer: {
        es: 'Una promoción inmobiliaria es el desarrollo integral de un proyecto residencial: desde la adquisición del suelo, el diseño arquitectónico, la obtención de licencias, la construcción y la comercialización de las viviendas.',
        en: 'A real estate development is the end-to-end delivery of a residential project: from land acquisition, architectural design and obtaining permits through to construction and the sale of the homes.',
      },
    },
  ],
}
