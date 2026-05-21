/**
 * Cathedral Group — Single Source of Truth Registry
 *
 * Tipos compartidos + helpers para consumir registry desde:
 *   - Componentes React (vía hook useRegistry)
 *   - API routes server-side (vía fetchRegistry)
 *   - Scripts CLI / cron jobs
 *
 * El registry vive en BD Supabase (tablas doc_types_registry, prompt_templates,
 * ai_providers_registry). Esta lib es helper de acceso, no fuente de datos.
 */

export type DocType = {
  code: string
  display_name: string
  display_name_plural: string | null
  table_name: string
  category: string | null
  prompt_aliases: string[]
  vision_hints: string | null
  extraction_hints: string | null
  schema_fields: Record<string, { source?: string; type?: string; required?: boolean }>
  drive_subfolder_map: Record<string, string | null>
  drive_admin_folder: string | null
  drive_uploadable: boolean
  ui_icon: string | null
  ui_color: string | null
  display_order: number
  enabled: boolean
}

export type PromptTemplate = {
  code: string
  display_name: string
  category: string
  content: string
  description: string | null
  version: number
  variables: string[]
  enabled: boolean
}

export type AiProvider = {
  code: string
  display_name: string
  family: string
  endpoint: string | null
  model_id: string | null
  use_case: string
  priority: number
  cost_per_1k_input: number | null
  cost_per_1k_output: number | null
  max_budget_per_call_usd: number
  rate_limit_rpm: number | null
  enabled: boolean
}

export type Registry = {
  doc_types: DocType[]
  prompts: PromptTemplate[]
  providers: AiProvider[]
  fetched_at: string
}

/**
 * Fetch del registry completo desde la API.
 * Server-side: usa siempre URL absoluta (Vercel needs full URL en SSR).
 * Client-side: URL relativa.
 */
export async function fetchRegistry(baseUrl?: string): Promise<Registry> {
  const url = baseUrl ? `${baseUrl}/api/admin/registry` : '/api/admin/registry'
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Registry fetch failed: HTTP ${res.status}`)
  return res.json()
}

/**
 * Renderiza template prompt sustituyendo {{placeholders}} con valores reales.
 * Soportados:
 *   - {{doc_types_list}}  → lista bullet de code + display_name + aliases
 *   - {{doc_type_display}} → display_name del doc_type concreto
 *   - {{extraction_hint}}  → extraction_hints del doc_type
 *   - {{today}}            → fecha ISO YYYY-MM-DD
 *   - {{empresa}}          → "Cathedral House Investment SL"
 *
 * Variables custom se pueden pasar en `vars` map.
 */
export function renderPrompt(
  template: PromptTemplate,
  registry: Registry,
  ctx: {
    doc_type_code?: string
    vars?: Record<string, string>
  } = {}
): string {
  let content = template.content

  const docTypesList = registry.doc_types
    .filter((t) => t.enabled)
    .map((t) => `- ${t.code}: ${t.display_name} (aliases: ${(t.prompt_aliases || []).join(', ')})`)
    .join('\n')
  content = content.replaceAll('{{doc_types_list}}', docTypesList)

  if (ctx.doc_type_code) {
    const dt = registry.doc_types.find((t) => t.code === ctx.doc_type_code)
    if (dt) {
      content = content.replaceAll('{{doc_type_display}}', dt.display_name)
      content = content.replaceAll('{{extraction_hint}}', dt.extraction_hints || '')
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  content = content.replaceAll('{{today}}', today)
  content = content.replaceAll('{{empresa}}', 'Cathedral House Investment SL')

  if (ctx.vars) {
    for (const [k, v] of Object.entries(ctx.vars)) {
      content = content.replaceAll(`{{${k}}}`, v)
    }
  }

  return content
}

/** Devuelve el provider primario (priority=1) para un use_case dado. */
export function primaryProvider(registry: Registry, useCase: AiProvider['use_case']): AiProvider | null {
  return registry.providers.find((p) => p.enabled && p.use_case === useCase && p.priority === 1) || null
}

/** Devuelve la cascada completa (priority asc) de providers para un use_case. */
export function providerCascade(registry: Registry, useCase: AiProvider['use_case']): AiProvider[] {
  return registry.providers
    .filter((p) => p.enabled && p.use_case === useCase)
    .sort((a, b) => a.priority - b.priority)
}

/** Devuelve doc_type por código. */
export function getDocType(registry: Registry, code: string): DocType | null {
  return registry.doc_types.find((t) => t.code === code) || null
}

/** Devuelve subfolder Drive para un doc_type + proyecto_code (prefix detectado). */
export function resolveDriveSubfolder(
  docType: DocType,
  proyectoCode: string | null
): string | null {
  if (docType.drive_admin_folder) return docType.drive_admin_folder
  if (!proyectoCode) return null
  const prefix = proyectoCode.split('-')[0]?.toUpperCase() || ''
  return docType.drive_subfolder_map?.[prefix] || null
}
