import { notFound } from 'next/navigation'
import { getAllPosts, getPostBySlug } from '@/lib/blog'
import JsonLd, { createBlogPostSchema, createBreadcrumbSchema } from '@/components/seo/JsonLd'
import BlogPostContent from './BlogPostContent'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  // Metadatos SEO en español (server-side): el contenido visible del cuerpo
  // permanece en español; el título/entradilla del chrome se traduce en cliente.
  return {
    // Sin sufijo "| Cathedral Group": lo añade el title.template del root layout
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      images: [post.image],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) notFound()

  const allPosts = getAllPosts()
  const relatedPosts = allPosts
    .filter((p) => p.slug !== slug && (p.category === post.category || p.tags.some((t) => post.tags.includes(t))))
    .slice(0, 2)

  // Parse markdown content into HTML (simple approach).
  // Defensa XSS: escapar `<` `>` `&` en la fuente ANTES de aplicar las regex
  // que añaden tags HTML válidos. Aunque hoy el contenido es estático del
  // filesystem (no input usuario), evita que un post comprometido o un
  // futuro flujo CMS pueda inyectar scripts.
  const safeSource = post.content
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

  return (
    <>
      <JsonLd data={createBlogPostSchema(post.title, post.description, post.slug, post.date)} />
      <JsonLd
        data={createBreadcrumbSchema([
          { name: 'Inicio', url: '/' },
          { name: 'Blog', url: '/blog' },
          { name: post.title, url: `/blog/${post.slug}` },
        ])}
      />

      <BlogPostContent post={post} relatedPosts={relatedPosts} contentHtml={contentHtml} />
    </>
  )
}
