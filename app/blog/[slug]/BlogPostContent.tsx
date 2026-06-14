'use client'

import Link from 'next/link'
import type { BlogPost } from '@/lib/blog'
import { getLocale, useT } from '@/lib/translations'
import SmartForm from '@/components/forms/SmartForm'
import SectionLabel from '@/components/ui/SectionLabel'

// Cuerpo del artículo (cliente). El contenido del post permanece en español
// (decisión de cliente): solo se traduce el "chrome" de la UI (migas, títulos
// de sección, CTA) y el título/entradilla via post.titleEn/descriptionEn.
// El HTML del cuerpo se prerenderiza en el servidor y llega ya saneado.
export default function BlogPostContent({
  post,
  relatedPosts,
  contentHtml,
}: {
  post: BlogPost
  relatedPosts: BlogPost[]
  contentHtml: string
}) {
  const locale = getLocale()
  const t = useT('blog')

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
            <span className="text-xs text-white/70">{post.readingTime} {t('readingTimeSuffix')}</span>
          </div>
          <h1 className="text-white text-xl md:text-2xl font-medium leading-tight">
            {locale === 'en' ? post.titleEn : post.title}
          </h1>
          <p className="text-white/60 text-xs mt-3">
            {new Date(post.date).toLocaleDateString(locale === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </section>

      {/* Content (el cuerpo del post permanece en español) */}
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
            <SectionLabel text={t('relatedArticles')} className="mb-8" />
            <div className="grid md:grid-cols-2 gap-8">
              {relatedPosts.map((rp) => (
                <Link key={rp.slug} href={`/blog/${rp.slug}`} className="group block">
                  <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100 mb-3">
                    <div
                      className="w-full h-full bg-center bg-cover transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url('${rp.image}')` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{rp.category}</span>
                  <h3 className="text-sm font-medium mt-1 group-hover:text-primary transition-colors">
                    {locale === 'en' ? rp.titleEn : rp.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SmartForm CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
          <h2 className="text-xl font-medium uppercase tracking-wide mb-8 text-center">
            {t('startProject')}
          </h2>
          <SmartForm source={`blog-${post.slug}`} />
        </div>
      </section>
    </>
  )
}
