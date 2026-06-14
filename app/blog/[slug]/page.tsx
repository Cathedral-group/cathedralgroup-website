import { notFound } from 'next/navigation'
import { getAllPosts, getPostBySlug, renderMarkdown } from '@/lib/blog'
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

  const contentHtml = renderMarkdown(post.content)
  const contentHtmlEn = post.contentEn ? renderMarkdown(post.contentEn) : contentHtml

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

      <BlogPostContent post={post} relatedPosts={relatedPosts} contentHtml={contentHtml} contentHtmlEn={contentHtmlEn} />
    </>
  )
}
