export interface FAQ {
  question: string
  questionEn: string
  answer: string
  answerEn: string
}

export const serviceFaqs: Record<string, FAQ[]> = {
  'reformas-integrales-madrid': [
    {
      question: '¿Cuánto cuesta una reforma integral en Madrid?',
      questionEn: 'How much does a full renovation cost in Madrid?',
      answer: 'El precio de una reforma integral en Madrid oscila entre 600 y 2.500 €/m², dependiendo del nivel de acabados. Para un piso de 100 m² con acabados premium, el presupuesto típico se sitúa entre 80.000 y 150.000 €.',
      answerEn: 'The price of a full renovation in Madrid ranges between €600 and €2,500/m², depending on the level of finishes. For a 100 m² apartment with premium finishes, the typical budget is between €80,000 and €150,000.',
    },
    {
      question: '¿Cuánto tiempo dura una reforma integral?',
      questionEn: 'How long does a full renovation take?',
      answer: 'Una reforma integral en Madrid dura entre 3 y 6 meses, dependiendo de la superficie y complejidad del proyecto. Los proyectos de lujo con materiales importados pueden extenderse hasta 8 meses.',
      answerEn: 'A full renovation in Madrid takes between 3 and 6 months, depending on the surface area and project complexity. Luxury projects with imported materials can extend up to 8 months.',
    },
    {
      question: '¿Necesito licencia de obra para una reforma integral?',
      questionEn: 'Do I need a building permit for a full renovation?',
      answer: 'Sí, las reformas integrales en Madrid requieren licencia de obra mayor, que incluye proyecto técnico visado por un arquitecto. El trámite tarda entre 2 y 4 meses en el Ayuntamiento de Madrid.',
      answerEn: 'Yes, full renovations in Madrid require a major works permit, which includes a technical project endorsed by an architect. The process takes between 2 and 4 months at the Madrid City Council.',
    },
    {
      question: '¿Qué incluye una reforma integral?',
      questionEn: 'What does a full renovation include?',
      answer: 'Una reforma integral incluye: demoliciones, redistribución de espacios, instalaciones eléctricas y de fontanería nuevas, revestimientos de suelos y paredes, cocina y baños completos, carpintería, pintura y acabados finales.',
      answerEn: 'A full renovation includes: demolitions, space redistribution, new electrical and plumbing installations, floor and wall coverings, complete kitchen and bathrooms, carpentry, painting and final finishes.',
    },
  ],
  'interiorismo-madrid': [
    {
      question: '¿Cuánto cuesta un proyecto de interiorismo en Madrid?',
      questionEn: 'How much does an interior design project cost in Madrid?',
      answer: 'Un proyecto de interiorismo en Madrid cuesta entre 50 y 150 €/m² solo por el diseño, sin incluir ejecución. Un proyecto completo de diseño + ejecución para un piso de 120 m² se sitúa entre 80.000 y 200.000 €.',
      answerEn: 'An interior design project in Madrid costs between €50 and €150/m² for design only, excluding execution. A complete design + execution project for a 120 m² apartment ranges between €80,000 and €200,000.',
    },
    {
      question: '¿Qué diferencia hay entre interiorismo y decoración?',
      questionEn: 'What is the difference between interior design and decoration?',
      answer: 'El interiorismo trabaja la arquitectura interior del espacio: distribución, iluminación, materiales y mobiliario a medida. La decoración se centra en los elementos superficiales: textiles, accesorios y objetos decorativos.',
      answerEn: 'Interior design works on the interior architecture of the space: layout, lighting, materials and custom furniture. Decoration focuses on surface elements: textiles, accessories and decorative objects.',
    },
  ],
  'cambio-uso-local-vivienda-madrid': [
    {
      question: '¿Se puede convertir un local comercial en vivienda en Madrid?',
      questionEn: 'Can a commercial premises be converted into a home in Madrid?',
      answer: 'Sí, siempre que el local cumpla los requisitos urbanísticos del PGOU de Madrid: superficie mínima, ventilación natural, altura libre mínima de 2,50 m y acceso independiente desde zona común del edificio.',
      answerEn: 'Yes, as long as the premises meets the urban planning requirements of the Madrid PGOU: minimum surface area, natural ventilation, minimum clear height of 2.50 m and independent access from the common area of the building.',
    },
    {
      question: '¿Cuánto cuesta un cambio de uso de local a vivienda?',
      questionEn: 'How much does a commercial to residential conversion cost?',
      answer: 'El coste total de un cambio de uso en Madrid oscila entre 1.200 y 2.000 €/m², incluyendo proyecto técnico, licencias, obra y acabados. Para un local de 80 m², el presupuesto típico es de 100.000 a 160.000 €.',
      answerEn: 'The total cost of a change of use in Madrid ranges between €1,200 and €2,000/m², including technical project, licenses, construction and finishes. For an 80 m² premises, the typical budget is €100,000 to €160,000.',
    },
  ],
  'arquitectura-madrid': [
    {
      question: '¿Cuánto cobra un estudio de arquitectura en Madrid?',
      questionEn: 'How much does an architecture firm charge in Madrid?',
      answer: 'Los honorarios de un estudio de arquitectura en Madrid oscilan entre el 8% y el 15% del presupuesto de ejecución material. Para proyectos residenciales de lujo, los honorarios suelen situarse en el 10-12%.',
      answerEn: 'Architecture firm fees in Madrid range between 8% and 15% of the material execution budget. For luxury residential projects, fees are usually around 10-12%.',
    },
  ],
  'obra-nueva-madrid': [
    {
      question: '¿Cuánto cuesta construir una casa en Madrid?',
      questionEn: 'How much does it cost to build a house in Madrid?',
      answer: 'El coste de construcción de una vivienda nueva en Madrid oscila entre 1.500 y 3.000 €/m², dependiendo de la calidad de los materiales y la complejidad del diseño. No incluye el precio del suelo.',
      answerEn: 'The construction cost of a new home in Madrid ranges between €1,500 and €3,000/m², depending on the quality of materials and design complexity. This does not include land price.',
    },
  ],
  'promocion-inmobiliaria-madrid': [
    {
      question: '¿Qué es una promoción inmobiliaria?',
      questionEn: 'What is a real estate development?',
      answer: 'Una promoción inmobiliaria es el desarrollo integral de un proyecto residencial: desde la adquisición del suelo, el diseño arquitectónico, la obtención de licencias, la construcción y la comercialización de las viviendas.',
      answerEn: 'A real estate development is the comprehensive development of a residential project: from land acquisition, architectural design, obtaining permits, construction and marketing of the homes.',
    },
  ],
}
