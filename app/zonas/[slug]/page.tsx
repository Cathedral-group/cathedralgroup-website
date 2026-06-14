import { notFound } from 'next/navigation'
import { zones, getZoneBySlug } from '@/content/zones'
import JsonLd, { createBreadcrumbSchema } from '@/components/seo/JsonLd'
import ZoneContent from './ZoneContent'

export function generateStaticParams() {
  return zones.map((z) => ({ slug: z.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const zone = getZoneBySlug(slug)
  if (!zone) return {}

  // Metadatos SEO en español (server-side): el contenido visible se traduce en cliente.
  const name = zone.name.es
  const title = `Reformas en ${name}`
  const description = zone.description.es
  return {
    // Sin sufijo "| Cathedral Group": lo añade el title.template del root layout
    title,
    description,
    alternates: { canonical: `/zonas/${slug}` },
    openGraph: {
      type: 'website',
      siteName: 'Cathedral Group',
      locale: 'es_ES',
      title,
      description,
      url: `/zonas/${slug}`,
      images: [zone.heroImage],
    },
  }
}

export default async function ZonePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const zone = getZoneBySlug(slug)

  if (!zone) notFound()

  return (
    <>
      <JsonLd
        data={createBreadcrumbSchema([
          { name: 'Inicio', url: '/' },
          { name: 'Zonas', url: '/zonas' },
          { name: `Reformas en ${zone.name.es}`, url: `/zonas/${slug}` },
        ])}
      />

      <ZoneContent zone={zone} />
    </>
  )
}
