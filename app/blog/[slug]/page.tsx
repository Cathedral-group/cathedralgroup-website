import { notFound } from 'next/navigation'
import { getAllPosts, getPostBySlug } from '@/lib/blog'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}

  return {
    title: `${locale === 'en' ? post.titleEn : post.title} | Cathedral Group`,
    description: locale === 'en' ? post.descriptionEn : post.description,
    openGraph: {
      title: locale === 'en' ? post.titleEn : post.title,
      description: locale === 'en' ? post.descriptionEn : post.description,
      images: [post.image],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params
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
    .replace(/^\*\*(.*?)\*\*/gm, '<strong>$1</strong>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 text-neutral-700">• $1</li>')
    .replace(/^\| (.*$)/gm, '<div class="text-sm text-neutral-600 border-b border-neutral-100 py-1">$1</div>')
    .replace(/\n\n/g, '</p><p class="text-neutral-700 leading-relaxed mb-4">')
    .replace(/^(?!<[hl]|<li|<div|<str)/gm, '')

  return (
    <>
      {/* Hero */}
      <section className="relative h-[50vh] flex items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url('${post.image}')` }}
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 max-w-3xl mx-auto px-6 pb-12 w-full">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-white/90 px-2 py-1">
              {post.category}
            </span>
            <span className="text-xs text-white/70">{post.readingTime}</span>
          </div>
          <h1 className="text-white text-xl md:text-2xl font-medium leading-tight">
            {locale === 'en' ? post.titleEn : post.title}
          </h1>
          <p className="text-white/60 text-xs mt-3">
            {new Date(post.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div
            className="prose prose-neutral max-w-none"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>
      </section>

      {/* Tags */}
      <section className="pb-8 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex flex-wrap gap-2 pt-8 border-t border-neutral-200">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 border border-neutral-200 px-3 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="py-16 bg-beige-subtle">
          <div className="max-w-5xl mx-auto px-6">
            <SectionLabel text="Artículos relacionados" className="mb-8" />
            <div className="grid md:grid-cols-2 gap-8">
              {relatedPosts.map((rp) => (
                <a key={rp.slug} href={`/blog/${rp.slug}`} className="group block">
                  <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100 mb-3">
                    <div
                      className="w-full h-full bg-center bg-cover transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url('${rp.image}')` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{rp.category}</span>
                  <h3 className="text-sm font-medium mt-1 group-hover:text-primary transition-colors">{rp.title}</h3>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SmartForm CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
            {locale === 'en' ? 'Start Your Project' : 'Inicie su Proyecto'}
          </h2>
          <SmartForm source={`blog-${post.slug}`} />
        </div>
      </section>
    </>
  )
}
