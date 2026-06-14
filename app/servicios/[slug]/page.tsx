import { notFound } from 'next/navigation'
import { services, getServiceBySlug } from '@/content/services'
import { serviceFaqs } from '@/content/services/faqs'
import JsonLd, { createServiceSchema, createBreadcrumbSchema, createFaqSchema } from '@/components/seo/JsonLd'
import ServiceContent from './ServiceContent'

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = getServiceBySlug(slug)
  if (!service) return {}

  // Metadatos SEO en español (server-side): el contenido visible se traduce en cliente.
  const title = service.title.es
  const description = service.description.es
  return {
    // Sin sufijo "| Cathedral Group": lo añade el title.template del root layout
    title,
    description,
    alternates: { canonical: `/servicios/${slug}` },
    openGraph: {
      type: 'website',
      siteName: 'Cathedral Group',
      locale: 'es_ES',
      title,
      description,
      url: `/servicios/${slug}`,
      images: [service.heroImage],
    },
  }
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = getServiceBySlug(slug)

  if (!service) notFound()

  const faqs = serviceFaqs[slug]

  // Schema (server-side) en español, coherente con los metadatos SEO.
  const title = service.title.es
  const description = service.description.es

  return (
    <>
      <JsonLd data={createServiceSchema(title, description, `/servicios/${slug}`)} />
      <JsonLd
        data={createBreadcrumbSchema([
          { name: 'Inicio', url: '/' },
          { name: 'Servicios', url: '/servicios' },
          { name: title, url: `/servicios/${slug}` },
        ])}
      />
      {faqs && faqs.length > 0 && (
        <JsonLd data={createFaqSchema(faqs.map((f) => ({ question: f.question.es, answer: f.answer.es })))} />
      )}

      <ServiceContent service={service} faqs={faqs} />
    </>
  )
}
