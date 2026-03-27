interface JsonLdProps {
  data: Record<string, unknown>
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
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

export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'HomeAndConstructionBusiness',
  name: 'Cathedral Group',
  url: 'https://cathedralgroup.es',
  logo: 'https://cathedralgroup.es/img/logo.png',
  description: 'Estudio de arquitectura, diseño y reformas de lujo en Madrid.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Paseo de la Castellana 40, 8º',
    addressLocality: 'Madrid',
    postalCode: '28046',
    addressCountry: 'ES',
  },
  telephone: '+34684725606',
  email: 'info@cathedralgroup.es',
  areaServed: {
    '@type': 'City',
    name: 'Madrid',
  },
  sameAs: [],
}
