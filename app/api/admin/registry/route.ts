/**
 * GET /api/admin/registry
 *
 * Endpoint unificado SSOT (Single Source of Truth) Cathedral Group.
 * Devuelve registry completo (doc_types + prompts + providers) en una sola
 * respuesta para que el cliente cache todo y minimice round-trips.
 *
 * Consumido por:
 *   - Hook useRegistry() React (cache react-query 5min)
 *   - Workflow n8n "Cargar Registry" Code node (cache $workflowStaticData 5min)
 *   - Backend routes Next.js (decide-table, upload, classify-project)
 *   - Migración futura: lib/ocr-providers/*.ts para prompts dinámicos
 *
 * No requiere autenticación AAL2 — datos son configuración pública del sistema
 * (no PII, no secretos). Solo señalan QUÉ procesar, no cómo autorizar.
 *
 * Cache: max-age 300 (5 min) + stale-while-revalidate 60s.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DocType = {
  code: string
  display_name: string
  display_name_plural: string | null
  table_name: string
  category: string | null
  prompt_aliases: string[]
  vision_hints: string | null
  extraction_hints: string | null
  schema_fields: Record<string, unknown>
  drive_subfolder_map: Record<string, string | null>
  drive_admin_folder: string | null
  drive_uploadable: boolean
  ui_icon: string | null
  ui_color: string | null
  display_order: number
  enabled: boolean
}

type PromptTemplate = {
  code: string
  display_name: string
  category: string
  content: string
  description: string | null
  version: number
  variables: string[]
  enabled: boolean
}

type AiProvider = {
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

export async function GET() {
  const supabase = createAdminSupabaseClient()

  const [docTypesRes, promptsRes, providersRes] = await Promise.all([
    supabase
      .from('doc_types_registry')
      .select('code,display_name,display_name_plural,table_name,category,prompt_aliases,vision_hints,extraction_hints,schema_fields,drive_subfolder_map,drive_admin_folder,drive_uploadable,ui_icon,ui_color,display_order,enabled')
      .eq('enabled', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('prompt_templates')
      .select('code,display_name,category,content,description,version,variables,enabled')
      .eq('enabled', true),
    supabase
      .from('ai_providers_registry')
      .select('code,display_name,family,endpoint,model_id,use_case,priority,cost_per_1k_input,cost_per_1k_output,max_budget_per_call_usd,rate_limit_rpm,enabled')
      .eq('enabled', true)
      .order('priority', { ascending: true }),
  ])

  if (docTypesRes.error || promptsRes.error || providersRes.error) {
    return NextResponse.json(
      {
        error: 'Error cargando registry',
        details: {
          doc_types: docTypesRes.error?.message,
          prompts: promptsRes.error?.message,
          providers: providersRes.error?.message,
        },
      },
      { status: 500 }
    )
  }

  const payload = {
    doc_types: (docTypesRes.data || []) as DocType[],
    prompts: (promptsRes.data || []) as PromptTemplate[],
    providers: (providersRes.data || []) as AiProvider[],
    fetched_at: new Date().toISOString(),
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
    },
  })
}
