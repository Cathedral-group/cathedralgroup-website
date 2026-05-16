/**
 * POST /api/fuzzy-supplier
 *
 * Microutility endpoint: fuzzy matching de proveedores Cathedral.
 *
 * Llamado por:
 *   - workflow n8n general (sustituye Code node fuzzy matching actual)
 *   - Portal trabajador upload (futuro, integración pendiente)
 *
 * Body:
 *   { "name": "<nombre proveedor extraído OCR>", "nif"?: "<NIF opcional>" }
 *
 * Response 200:
 *   {
 *     "match_found": boolean,
 *     "supplier_id": uuid | null,
 *     "supplier_name": string | null,
 *     "supplier_nif": string | null,
 *     "match_type": "nif_exact" | "name_fuzzy" | null,
 *     "confidence": number,            // 0.0 a 1.0
 *     "auto_assign": boolean,          // true si nif_exact o confidence >= 0.90
 *     "needs_review": boolean,         // true si confidence 0.65-0.89 (candidate suggest)
 *     "candidates": [...],             // alternativas si hay >1 match fuzzy
 *     "source": "cathedral-fuzzy-supplier-v1"
 *   }
 *
 * Auth: header `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}`.
 *
 * Performance objetivo: <800ms p95 (RPC server-side con GIN trigram index).
 *
 * Algoritmo (RPC `fuzzy_match_supplier` Supabase):
 *   1. NIF exact match (prioridad, normalizado upper + sin espacios/puntos/guiones)
 *   2. Fuzzy name match con pg_trgm similarity() server-side
 *      - Normalización: lower + tildes ASCII + remove sufijos legales (SL/SA/SLU/SAU)
 *      - Threshold default 0.65 (tunable)
 *   3. Devuelve top 3 candidates ordenados por confidence DESC
 *
 * Filtros obligatorios (validator review 16/05):
 *   - company_id (multi-empresa Bloque 0)
 *   - deleted_at IS NULL (soft-delete aware)
 *   - active = true
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { z } from 'zod'

const BodySchema = z.object({
  name: z.string().min(1).max(500),
  nif: z.string().max(20).optional(),
})

const CATHEDRAL_COMPANY_ID = '00000000-0000-0000-0000-cca7ed1a1000'
const DEFAULT_THRESHOLD = 0.65
const AUTO_ASSIGN_THRESHOLD = 0.9

// Auth via lib/api-auth (refactor 16/05 noche).

interface FuzzyMatchRow {
  supplier_id: string
  supplier_name: string
  supplier_nif: string | null
  match_type: 'nif_exact' | 'name_fuzzy'
  confidence: number
}

export async function POST(request: Request) {
  const startedAt = Date.now()

  // 1. Auth
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Body parse
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        detail: parsed.error.issues[0]?.message ?? 'Invalid payload',
      },
      { status: 400 }
    )
  }

  const { name, nif } = parsed.data

  // 3. RPC call
  const supabase = createAdminSupabaseClient()

  try {
    const { data, error } = await supabase.rpc('fuzzy_match_supplier', {
      p_name: name,
      p_nif: nif ?? null,
      p_company_id: CATHEDRAL_COMPANY_ID,
      p_threshold: DEFAULT_THRESHOLD,
    })

    if (error) {
      console.error('[fuzzy-supplier] RPC error:', error.message)
      return Response.json(
        { error: 'Upstream database error', detail: error.message },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    const rows = (data ?? []) as FuzzyMatchRow[]
    const elapsedMs = Date.now() - startedAt

    if (rows.length === 0) {
      console.log(
        `[fuzzy-supplier] name="${name.slice(0, 30)}" nif=${nif ?? '-'} match=none t=${elapsedMs}ms`
      )
      return Response.json({
        match_found: false,
        supplier_id: null,
        supplier_name: null,
        supplier_nif: null,
        match_type: null,
        confidence: 0,
        auto_assign: false,
        needs_review: false,
        candidates: [],
        source: 'cathedral-fuzzy-supplier-v1',
      })
    }

    const best = rows[0]
    const autoAssign =
      best.match_type === 'nif_exact' || best.confidence >= AUTO_ASSIGN_THRESHOLD
    const needsReview = !autoAssign

    console.log(
      `[fuzzy-supplier] name="${name.slice(0, 30)}" nif=${nif ?? '-'} ` +
        `match=${best.match_type} supplier="${best.supplier_name.slice(0, 30)}" ` +
        `conf=${best.confidence.toFixed(2)} t=${elapsedMs}ms`
    )

    return Response.json({
      match_found: true,
      supplier_id: best.supplier_id,
      supplier_name: best.supplier_name,
      supplier_nif: best.supplier_nif,
      match_type: best.match_type,
      confidence: best.confidence,
      auto_assign: autoAssign,
      needs_review: needsReview,
      candidates: rows.slice(1).map((r) => ({
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        supplier_nif: r.supplier_nif,
        confidence: r.confidence,
      })),
      source: 'cathedral-fuzzy-supplier-v1',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[fuzzy-supplier] Unexpected error:', message)
    return Response.json(
      { error: 'Upstream error', detail: message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
