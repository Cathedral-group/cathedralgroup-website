import type { Locale } from '@/lib/translations'

// Etiqueta de categoria del blog segun idioma. En 'es' devuelve el valor tal y
// como se muestra hoy (minuscula, igual que el frontmatter). En 'en' traduce.
// Vive aparte de lib/blog.ts (que importa 'fs') para que lo puedan usar
// componentes 'use client' sin arrastrar fs/path/gray-matter al bundle de cliente.
const CATEGORY_LABELS_EN: Record<string, string> = {
  compraventa: 'Sales',
  fiscalidad: 'Taxation',
  'guías': 'Guides',
  'inversión': 'Investment',
  normativa: 'Regulations',
  precios: 'Pricing',
  'promoción': 'Development',
  tendencias: 'Trends',
  zonas: 'Areas',
}

export function categoryLabel(category: string, locale: Locale): string {
  if (locale === 'en') return CATEGORY_LABELS_EN[category] ?? category
  return category
}

// Tipo del post. Vive aqui (no en lib/blog.ts) para que los componentes
// 'use client' puedan tiparlo sin importar el modulo que arrastra 'fs'.
export interface BlogPost {
  slug: string
  title: string
  titleEn: string
  description: string
  descriptionEn: string
  category: string
  division: string
  tags: string[]
  image: string
  date: string
  readingTime: string
  content: string
  contentEn: string
}
