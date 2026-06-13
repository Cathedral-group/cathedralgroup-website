'use client'

import { useState } from 'react'
import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'
import type { BlogPost } from '@/lib/blog'

const ALL = 'todos'

const chipBase =
  'text-xs font-bold uppercase tracking-widest pb-1 cursor-pointer transition-colors'
const chipActive = 'text-primary border-b-2 border-primary'
const chipIdle = 'text-neutral-400 hover:text-primary'

export default function BlogList({
  posts,
  categories,
}: {
  posts: BlogPost[]
  categories: string[]
}) {
  const [selected, setSelected] = useState<string>(ALL)

  const filtered =
    selected === ALL ? posts : posts.filter((p) => p.category === selected)

  return (
    <>
      {/* Header */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6" data-animate="fade-up">
          <SectionLabel text="Blog" className="mb-4" />
          <h1 className="text-2xl font-medium uppercase tracking-wide mb-4">
            Guías y Tendencias
          </h1>
          <p className="text-neutral-600 max-w-2xl">
            Artículos sobre reformas, interiorismo, normativa y tendencias en arquitectura de alto standing en Madrid.
          </p>

          {/* Category filters */}
          <div className="flex gap-4 mt-8 flex-wrap">
            <button
              type="button"
              onClick={() => setSelected(ALL)}
              aria-pressed={selected === ALL}
              className={`${chipBase} ${selected === ALL ? chipActive : chipIdle}`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelected(cat)}
                aria-pressed={selected === cat}
                className={`${chipBase} ${selected === cat ? chipActive : chipIdle}`}
              >
                {cat}
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
                    {post.category}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {post.readingTime}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {new Date(post.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <h2 className="text-lg font-medium leading-snug group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-neutral-600 mt-2 line-clamp-2">
                  {post.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
