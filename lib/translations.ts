const es = {
  nav: {
    projects: 'Proyectos',
    services: 'Servicios',
    zones: 'Zonas',
    about: 'Nosotros',
    contact: 'Contacto',
    blog: 'Blog',
    consult: 'Consultar',
  },
  hero: {
    title: 'Cathedral Spaces:',
    subtitle: 'Arquitectura y diseño de alto nivel',
    cta: 'Explorar Proyectos',
  },
  divisions: {
    label: 'Nuestras Divisiones',
    title: 'Estructura de Excelencia',
    spaces: 'Spaces',
    spacesDesc: 'Arquitectura residencial y reformas integrales de alto standing.',
    capital: 'Capital',
    capitalDesc: 'Gestión estratégica de inversiones y consultoría inmobiliaria.',
    properties: 'Properties',
    propertiesDesc: 'Comercialización selecta de activos residenciales de lujo.',
    developments: 'Developments',
    developmentsDesc: 'Promoción y desarrollo de proyectos arquitectónicos singulares.',
    explore: 'Explorar división',
  },
  projects: {
    label: 'Portafolio',
    title: 'Proyectos Destacados',
    viewAll: 'Ver Todos',
  },
  zones: {
    label: 'Donde Trabajamos',
    title: 'Zonas de',
    titleHighlight: 'Actuación',
    description: 'Operamos en los barrios más exclusivos de Madrid, donde la herencia arquitectónica y el diseño arquitectónico alcanza su máxima expresión.',
  },
  about: {
    label: 'Sobre Nosotros',
    title: 'La Filosofía Cathedral',
    paragraph1: 'Fundada con la visión de elevar los estándares de la vivienda de lujo en Madrid, Cathedral Group se ha convertido en un referente de sofisticación y precisión técnica.',
    paragraph2: 'No solo diseñamos espacios; orquestamos experiencias sensoriales donde la luz, la materia y la proporción convergen para crear entornos de serenidad y distinción absoluta.',
    yearsLabel: 'Años de Experiencia',
    projectsLabel: 'Proyectos Entregados',
  },
  form: {
    title: 'Inicie su Proyecto',
    subtitle: 'Complete el formulario y nuestro equipo se pondrá en contacto para una sesión privada.',
    name: 'Nombre Completo',
    email: 'Email',
    phone: 'Teléfono',
    projectType: 'Tipo de Proyecto',
    zone: 'Zona',
    sqm: 'm² aproximados',
    budget: 'Presupuesto Estimado',
    message: 'Mensaje / Interés',
    submit: 'Enviar Solicitud',
    selectOption: 'Seleccione una opción',
    step1: 'Proyecto',
    step2: 'Ubicación',
    step3: 'Presupuesto',
    step4: 'Contacto',
  },
  footer: {
    description: 'Holding inmobiliario en Madrid, especializado en arquitectura de lujo, inversión estratégica y desarrollo de proyectos residenciales exclusivos.',
    divisions: 'Divisiones',
    contact: 'Contacto',
    follow: 'Síguenos',
    legal: 'Aviso Legal',
    privacy: 'Privacidad',
    cookies: 'Cookies',
    rights: 'Cathedral House Investment S.L. Todos los derechos reservados.',
  },
  excellence: {
    label: 'Excelencia y Rigor',
    text1: 'Redefinimos el concepto de lujo a través de',
    bold: 'reformas residenciales de alto nivel',
    text2: ', interiorismo sofisticado y una construcción meticulosamente orientada al diseño.',
    text3: 'Ubicados en el corazón de Madrid, nuestro estudio fusiona la herencia arquitectónica con las tendencias contemporáneas para crear hogares que son verdaderas obras de arte.',
  },
}

const en = {
  nav: {
    projects: 'Projects',
    services: 'Services',
    zones: 'Areas',
    about: 'About',
    contact: 'Contact',
    blog: 'Blog',
    consult: 'Enquire',
  },
  hero: {
    title: 'Cathedral Spaces:',
    subtitle: 'Architecture and design of the highest level',
    cta: 'Explore Projects',
  },
  divisions: {
    label: 'Our Divisions',
    title: 'Structure of Excellence',
    spaces: 'Spaces',
    spacesDesc: 'Residential architecture and high-end comprehensive renovations.',
    capital: 'Capital',
    capitalDesc: 'Strategic investment management and real estate consultancy.',
    properties: 'Properties',
    propertiesDesc: 'Select marketing of luxury residential assets.',
    developments: 'Developments',
    developmentsDesc: 'Promotion and development of singular architectural projects.',
    explore: 'Explore division',
  },
  projects: {
    label: 'Portfolio',
    title: 'Featured Projects',
    viewAll: 'View All',
  },
  zones: {
    label: 'Where We Work',
    title: 'Areas of',
    titleHighlight: 'Operation',
    description: 'We operate in the most exclusive neighbourhoods of Madrid, where architectural heritage and design reach their highest expression.',
  },
  about: {
    label: 'About Us',
    title: 'The Cathedral Philosophy',
    paragraph1: 'Founded with the vision of elevating the standards of luxury living in Madrid, Cathedral Group has become a benchmark for sophistication and technical precision.',
    paragraph2: 'We don\'t just design spaces; we orchestrate sensory experiences where light, material and proportion converge to create environments of serenity and absolute distinction.',
    yearsLabel: 'Years of Experience',
    projectsLabel: 'Projects Delivered',
  },
  form: {
    title: 'Start Your Project',
    subtitle: 'Complete the form and our team will get in touch for a private consultation.',
    name: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    projectType: 'Project Type',
    zone: 'Area',
    sqm: 'Approx. m²',
    budget: 'Estimated Budget',
    message: 'Message / Interest',
    submit: 'Submit Request',
    selectOption: 'Select an option',
    step1: 'Project',
    step2: 'Location',
    step3: 'Budget',
    step4: 'Contact',
  },
  footer: {
    description: 'Real estate holding in Madrid, specialising in luxury architecture, strategic investment and exclusive residential project development.',
    divisions: 'Divisions',
    contact: 'Contact',
    follow: 'Follow Us',
    legal: 'Legal Notice',
    privacy: 'Privacy',
    cookies: 'Cookies',
    rights: 'Cathedral House Investment S.L. All rights reserved.',
  },
  excellence: {
    label: 'Excellence and Rigour',
    text1: 'We redefine the concept of luxury through',
    bold: 'high-end residential renovations',
    text2: ', sophisticated interior design and construction meticulously oriented towards design.',
    text3: 'Based in the heart of Madrid, our studio fuses architectural heritage with contemporary trends to create homes that are true works of art.',
  },
}

const allTranslations = { es, en }

export type Locale = 'es' | 'en'
type Section = keyof typeof es

// Read locale from cookie (works on client only)
function getLocaleFromCookie(): Locale {
  if (typeof document === 'undefined') return 'es'
  const match = document.cookie.match(/locale=(es|en)/)
  return (match?.[1] as Locale) || 'es'
}

export function setLocale(locale: Locale) {
  if (typeof document !== 'undefined') {
    document.cookie = `locale=${locale};path=/;max-age=31536000`
  }
}

export function getLocale(): Locale {
  return getLocaleFromCookie()
}

export function useT(section: Section) {
  const locale = getLocaleFromCookie()
  return (key: string) => {
    const s = allTranslations[locale][section] as Record<string, string>
    return s[key] ?? key
  }
}

export default allTranslations
