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
