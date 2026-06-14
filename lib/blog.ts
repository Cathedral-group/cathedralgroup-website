import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'
import { categoryLabel, type BlogPost } from '@/lib/blog-categories'

// Re-export de los helpers cliente-seguros para los consumidores server que los
// importaban via este modulo. La logica vive en lib/blog-categories.ts (SIN
// 'fs') para que los componentes 'use client' no arrastren fs/path/gray-matter
// al bundle de cliente (rompia el build: "Can't resolve 'fs'").
export { categoryLabel }
export type { BlogPost }

const BLOG_DIR = path.join(process.cwd(), 'content/blog')

// Cache in-memory build-time. Posts MDX no cambian en runtime (Next.js SSG/RSC
// con archivo system). 1 lectura disk + parse por proceso, no por request.
// Audit 16/05: detectado O(n²) cuando paginaciones llamaban getAllPosts repetido.
let _cachedPosts: BlogPost[] | null = null

export function getAllPosts(): BlogPost[] {
  if (_cachedPosts) return _cachedPosts

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx') && !f.endsWith('.en.mdx'))

  const posts = files.map((filename) => {
    const slug = filename.replace('.mdx', '')
    const filePath = path.join(BLOG_DIR, filename)
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(fileContent)
    const stats = readingTime(content)

    const enPath = path.join(BLOG_DIR, `${slug}.en.mdx`)
    const contentEn = fs.existsSync(enPath) ? matter(fs.readFileSync(enPath, 'utf-8')).content : ''

    return {
      slug,
      title: data.title || '',
      titleEn: data.titleEn || data.title || '',
      description: data.description || '',
      descriptionEn: data.descriptionEn || data.description || '',
      category: data.category || 'general',
      division: data.division || 'spaces',
      tags: data.tags || [],
      image: data.image || '/img/hero_final.jpg',
      date: data.date || new Date().toISOString().split('T')[0],
      readingTime: stats.text.replace('min read', 'min'),
      content,
      contentEn,
    }
  })

  _cachedPosts = posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return _cachedPosts
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find((p) => p.slug === slug)
}

export function getPostsByCategory(category: string): BlogPost[] {
  return getAllPosts().filter((p) => p.category === category)
}

export function getAllCategories(): string[] {
  const posts = getAllPosts()
  return [...new Set(posts.map((p) => p.category))]
}

// Parse markdown content into HTML (simple approach).
// Defensa XSS: escapar `<` `>` `&` en la fuente ANTES de aplicar las regex
// que añaden tags HTML válidos. Aunque hoy el contenido es estático del
// filesystem (no input usuario), evita que un post comprometido o un
// futuro flujo CMS pueda inyectar scripts.
export function renderMarkdown(source: string): string {
  const safeSource = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const contentHtml = safeSource
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium mt-8 mb-3">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-medium mt-10 mb-4">$1</h2>')
    // Enlaces [texto](url) — solo rutas internas o https, nunca javascript: u otros esquemas
    .replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, '<a href="$2" class="text-primary underline underline-offset-4 hover:no-underline">$1</a>')
    // Negritas **texto** en cualquier punto de la línea (antes solo al inicio)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 text-neutral-700">• $1</li>')
    .replace(/^\| (.*$)/gm, '<div class="text-sm text-neutral-600 border-b border-neutral-100 py-1">$1</div>')
    .replace(/\n\n/g, '</p><p class="text-neutral-700 leading-relaxed mb-4">')
    .replace(/^(?!<[hl]|<li|<div|<str)/gm, '')
  return contentHtml
}
