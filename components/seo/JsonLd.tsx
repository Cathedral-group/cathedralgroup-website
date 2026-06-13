interface JsonLdProps {
  data: Record<string, unknown>
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export function createServiceSchema(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    url: `https://cathedralgroup.es${url}`,
    provider: {
      '@type': 'HomeAndConstructionBusiness',
      name: 'Cathedral Group',
      url: 'https://cathedralgroup.es',
      telephone: '+34684725606',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Paseo de la Castellana 40, 8º',
        addressLocality: 'Madrid',
        postalCode: '28046',
        addressCountry: 'ES',
      },
    },
    areaServed: {
      '@type': 'City',
      name: 'Madrid',
    },
  }
}

export function createBlogPostSchema(title: string, description: string, slug: string, date: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url: `https://cathedralgroup.es/blog/${slug}`,
    datePublished: date,
    dateModified: date,
    author: {
      '@type': 'Organization',
      name: 'Cathedral Group',
      url: 'https://cathedralgroup.es',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Cathedral Group',
      logo: {
        '@type': 'ImageObject',
        url: 'https://cathedralgroup.es/img/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://cathedralgroup.es/blog/${slug}`,
    },
  }
}

export function createBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `https://cathedralgroup.es${item.url}`,
    })),
  }
}

export function createFaqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }
}

export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'HomeAndConstructionBusiness',
  '@id': 'https://cathedralgroup.es/#organization',
  name: 'Cathedral Group',
  url: 'https://cathedralgroup.es',
  logo: 'https://cathedralgroup.es/img/logo.png',
  image: 'https://cathedralgroup.es/img/proj-atico.jpg',
  description: 'Grupo inmobiliario en Madrid especializado en arquitectura y reformas de alto standing, inversión estratégica, comercialización selecta y promoción de proyectos singulares.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Paseo de la Castellana 40, 8º',
    addressLocality: 'Madrid',
    postalCode: '28046',
    addressCountry: 'ES',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 40.4368,
    longitude: -3.6903,
  },
  telephone: '+34684725606',
  email: 'info@cathedralgroup.es',
  priceRange: '€€€€',
  areaServed: [
    { '@type': 'City', name: 'Madrid' },
    'Barrio de Salamanca',
    'Chamberí',
    'Chamartín',
    'Retiro',
    'Pozuelo de Alarcón',
    'Las Rozas',
    'Majadahonda',
    'Aravaca',
    'La Moraleja',
  ],
  sameAs: [],
}
