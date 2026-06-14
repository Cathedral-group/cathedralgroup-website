'use client'

import { useState } from 'react'
import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'
import { getLocale, useT } from '@/lib/translations'
import { categoryLabel, type BlogPost } from '@/lib/blog-categories'

const ALL = 'todos'

// Filtro por DIVISIÓN (un blog único; chips Todos·Spaces·Capital·Properties·Developments).
const DIVISIONS = [
  { key: 'spaces', label: 'Spaces' },
  { key: 'capital', label: 'Capital' },
  { key: 'properties', label: 'Properties' },
  { key: 'developments', label: 'Developments' },
]

const chipBase =
  'text-xs font-bold uppercase tracking-widest pb-1 cursor-pointer transition-colors'
const chipActive = 'text-primary border-b-2 border-primary'
const chipIdle = 'text-neutral-400 hover:text-primary'

export default function BlogList({ posts }: { posts: BlogPost[] }) {
  const [selected, setSelected] = useState<string>(ALL)
  const locale = getLocale()
  const t = useT('blog')

  const filtered =
    selected === ALL ? posts : posts.filter((p) => p.division === selected)

  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text={t('label')} className="mb-4" />
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">
            {t('title')}
          </h1>
          <p className="text-neutral-600 max-w-2xl">
            {t('intro')}
          </p>

          {/* Filtros por división */}
          <div className="flex gap-4 mt-8 flex-wrap">
            <button
              type="button"
              onClick={() => setSelected(ALL)}
              aria-pressed={selected === ALL}
              className={`${chipBase} ${selected === ALL ? chipActive : chipIdle}`}
            >
              {t('all')}
            </button>
            {DIVISIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelected(d.key)}
                aria-pressed={selected === d.key}
                className={`${chipBase} ${selected === d.key ? chipActive : chipIdle}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Posts grid */}
      <section className="pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {/* key={selected} remonta la rejilla al filtrar: nodos nuevos = opacity 1
              por defecto (GSAP stagger solo tocó los hijos del montaje inicial). */}
          <div key={selected} className="grid md:grid-cols-2 gap-8" data-animate="stagger">
            {filtered.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100 mb-4">
                  <div
                    className="w-full h-full bg-center bg-cover transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url('${post.image}')` }}
                  />
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    {categoryLabel(post.category, locale)}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {post.readingTime} {t('readingTimeSuffix')}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {new Date(post.date).toLocaleDateString(locale === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <h2 className="text-lg font-medium leading-snug group-hover:text-primary transition-colors">
                  {locale === 'en' ? post.titleEn : post.title}
                </h2>
                <p className="text-sm text-neutral-600 mt-2 line-clamp-2">
                  {locale === 'en' ? post.descriptionEn : post.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
