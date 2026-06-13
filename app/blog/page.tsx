import { getAllPosts, getAllCategories } from '@/lib/blog'
import BlogList from './BlogList'

export const metadata = {
  // Sin sufijo "| Cathedral Group": lo añade el title.template del root layout
  title: 'Blog',
  description: 'Guías, tendencias y consejos sobre reformas, interiorismo y arquitectura de alto standing en Madrid.',
  alternates: { canonical: '/blog' },
}

export default function BlogPage() {
  const posts = getAllPosts()
  const categories = getAllCategories()

  return <BlogList posts={posts} categories={categories} />
}
