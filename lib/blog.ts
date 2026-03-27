import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'

const BLOG_DIR = path.join(process.cwd(), 'content/blog')

export interface BlogPost {
  slug: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  category: string
  tags: string[]
  image: string
  date: string
  readingTime: string
  content: string
}

export function getAllPosts(): BlogPost[] {
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'))

  const posts = files.map((filename) => {
    const slug = filename.replace('.mdx', '')
    const filePath = path.join(BLOG_DIR, filename)
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(fileContent)
    const stats = readingTime(content)

    return {
      slug,
      title: data.title || '',
      titleEn: data.titleEn || data.title || '',
      description: data.description || '',
      descriptionEn: data.descriptionEn || data.description || '',
      category: data.category || 'general',
      tags: data.tags || [],
      image: data.image || '/img/hero_final.jpg',
      date: data.date || new Date().toISOString().split('T')[0],
      readingTime: stats.text.replace('min read', 'min'),
      content,
    }
  })

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
