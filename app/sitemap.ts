import { MetadataRoute } from 'next'
import { services } from '@/content/services'
import { zones } from '@/content/zones'
import { getAllPosts } from '@/lib/blog'

const BASE_URL = 'https://cathedralgroup.es'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts()

  const staticPages = [
    '', '/nosotros', '/contacto', '/proyectos', '/servicios', '/zonas', '/blog', '/legal',
  ]

  const staticEntries = staticPages.flatMap((page) => [
    { url: `${BASE_URL}${page}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: page === '' ? 1 : 0.8 },
    { url: `${BASE_URL}/en${page}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: page === '' ? 0.9 : 0.7 },
  ])

  const serviceEntries = services.flatMap((s) => [
    { url: `${BASE_URL}/servicios/${s.slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: `${BASE_URL}/en/servicios/${s.slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.7 },
  ])

  const zoneEntries = zones.flatMap((z) => [
    { url: `${BASE_URL}/zonas/${z.slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: `${BASE_URL}/en/zonas/${z.slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.7 },
  ])

  const blogEntries = posts.flatMap((p) => [
    { url: `${BASE_URL}/blog/${p.slug}`, lastModified: new Date(p.date), changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${BASE_URL}/en/blog/${p.slug}`, lastModified: new Date(p.date), changeFrequency: 'monthly' as const, priority: 0.5 },
  ])

  return [...staticEntries, ...serviceEntries, ...zoneEntries, ...blogEntries]
}
