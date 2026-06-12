import { MetadataRoute } from 'next'
import { services } from '@/content/services'
import { zones } from '@/content/zones'
import { getAllPosts } from '@/lib/blog'

const BASE_URL = 'https://cathedralgroup.es'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts()

  // OJO: NO añadir rutas /en/* — el idioma EN funciona por cookie sobre las
  // mismas URLs (no existen rutas /en), anunciarlas generaba 35 URLs 404.
  const staticPages = [
    '', '/spaces', '/capital', '/properties', '/developments',
    '/nosotros', '/contacto', '/proyectos', '/servicios', '/zonas', '/blog', '/legal', '/presupuesto',
  ]

  const staticEntries = staticPages.map((page) => (
    { url: `${BASE_URL}${page}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: page === '' ? 1 : 0.8 }
  ))

  const serviceEntries = services.map((s) => (
    { url: `${BASE_URL}/servicios/${s.slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 }
  ))

  const zoneEntries = zones.map((z) => (
    { url: `${BASE_URL}/zonas/${z.slug}`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 }
  ))

  const blogEntries = posts.map((p) => (
    { url: `${BASE_URL}/blog/${p.slug}`, lastModified: new Date(p.date), changeFrequency: 'monthly' as const, priority: 0.6 }
  ))

  return [...staticEntries, ...serviceEntries, ...zoneEntries, ...blogEntries]
}
