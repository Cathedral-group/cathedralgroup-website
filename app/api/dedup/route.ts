/**
 * POST /api/dedup
 *
 * Microutility endpoint: dedup lookup contra tablas Supabase.
 * Versión v3 (17/05/2026) — Smart dedup con gate de protección trabajo manual.
 *
 * Llamado por:
 *   - workflow n8n general (HTTP Request node) — cutover Tarea 4 (ADR-0008)
 *     Sustituye Code node "Check Duplicados Unificado" V8.
 *   - Portal trabajador upload-receipt vía `callDedup()` helper.
 *
 * Body (OR lookup — file_hash O email_message_id+filename):
 *   {
 *     "file_hash"?: string,                  // SHA-256 hex 64 chars — preferido
 *     "email_message_id"?: string,           // fallback si no hay file_hash
 *     "filename"?: string,                   // requerido con email_message_id
 *     "include_deleted"?: boolean            // default false
 *   }
 *
 * Response 200 (v3 = superconjunto v2, backward compat):
 *   {
 *     // Campos v1 (backward compat):
 *     "is_duplicate": boolean,
 *     "existing_id": uuid | null,
 *     "table": "invoices" | "quotes" | "documents" | null,
 *     "created_at": ISO8601 | null,
 *     // Campos v2 (paridad n8n legacy):
 *     "duplicate_reason": string | null,
 *     "linked_doc_id": uuid | null,
 *     "was_deleted": boolean,
 *     "dedup_method": "file_hash" | "email_message_id" | null,
 *     // Campos v3 (Smart dedup):
 *     "reprocess_existing": boolean,         // true si row existe pero permite UPDATE (gate abierto)
 *     "existing_updated_at": ISO8601 | null, // optimistic lock — n8n usa en PATCH ?updated_at=eq.{X}
 *     "existing_review_status": string | null,
 *     "existing_ai_confidence": number | null,
 *     "existing_reprocess_attempts": number | null,
 *     "skip_reason": string | null,          // por qué NO reprocesar (UI/debug)
 *     "source": "cathedral-dedup-v3"
 *   }
 *
 * Lógica Smart dedup gate (skip reprocess = "is_duplicate=true + reprocess_existing=false"):
 *   - table='documents'                       → siempre skip (sin review fields)
 *   - manually_edited=true                    → skip (humano editó)
 *   - review_status IN (revisado,confirmado)  → skip (humano marcó OK)
 *   - reviewed_at IS NOT NULL OR reviewed_by IS NOT NULL → skip (humano tocó)
 *   - ai_confidence >= CONFIDENCE_THRESHOLD   → skip (OCR ya bueno)
 *   - reprocess_attempts >= MAX_REPROCESS     → skip (cap anti-loop)
 *   - else                                    → reprocess_existing=true (UPDATE permitido)
 *
 * Feature flag `use_smart_dedup` (tabla feature_flags):
 *   - OFF (default) → reprocess_existing siempre false (comportamiento v2 legacy)
 *   - ON + rollout determinista por file_hash → activa gate
 *
 * Auth: header `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}`.
 *
 * Refs:
 *   - docs/adr/0008-cutover-workflow-general-deferido.md (Plan A 100%)
 *   - sesión 17/05/2026 Smart dedup (estudio 4 agentes industria + validación)
 *   - migration 20260517000000_smart_dedup_columns.sql
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { getFlag, isInRollout } from '@/lib/feature-flags'
import { z } from 'zod'

const BodySchema = z
  .object({
    file_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'SHA-256 hex requerido (64 chars lowercase)')
      .optional(),
    email_message_id: z.string().max(200).optional(),
    filename: z.string().max(500).optional(),
    include_deleted: z.boolean().optional().default(false),
  })
  .refine(
    (d) =>
      Boolean(d.file_hash) || (Boolean(d.email_message_id) && Boolean(d.filename)),
    { error: 'Requiere file_hash O (email_message_id + filename)' }
  )

type DedupBody = z.infer<typeof BodySchema>

const DEDUP_TABLES = ['invoices', 'quotes', 'documents'] as const
type DedupTable = (typeof DEDUP_TABLES)[number]

// Industry standard: Mindee 0.7-0.8, Rossum 0.975. Cathedral usa 0.75 (compromise PYME).
// Subir a 0.85+ cuando flow estable post-cutover.
const CONFIDENCE_THRESHOLD = 0.75
const MAX_REPROCESS = 3
const SMART_DEDUP_FLAG_KEY = 'use_smart_dedup'

interface MatchRow {
  id: string
  number: string | null
  created_at: string
  deleted_at: string | null
  // Smart dedup fields (NULL si tabla=documents)
  updated_at: string | null
  review_status: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  ai_confidence: number | null
  manually_edited: boolean | null
  reprocess_attempts: number | null
}

async function lookupInTable(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: DedupTable,
  body: DedupBody
): Promise<MatchRow | null> {
  // SELECT condicional: documents no tiene review/confidence/manually_edited columns
  const cols =
    table === 'documents'
      ? 'id, created_at, deleted_at'
      : 'id, number, created_at, deleted_at, updated_at, review_status, reviewed_at, reviewed_by, ai_confidence, manually_edited, reprocess_attempts'

  let query = supabase.from(table).select(cols).limit(1)

  if (body.file_hash) {
    query = query.eq('file_hash', body.file_hash)
  } else if (body.email_message_id && body.filename) {
    query = query
      .eq('email_message_id', body.email_message_id)
      .eq('original_filename', body.filename)
  } else {
    return null
  }

  if (!body.include_deleted) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error(`[dedup v3] ${table} lookup error:`, error.message)
    return null
  }
  if (!data) return null

  const row = data as unknown as {
    id: string
    number?: string
    created_at: string
    deleted_at: string | null
    updated_at?: string
    review_status?: string
    reviewed_at?: string
    reviewed_by?: string
    ai_confidence?: number
    manually_edited?: boolean
    reprocess_attempts?: number
  }

  return {
    id: row.id,
    number: row.number ?? null,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    updated_at: row.updated_at ?? null,
    review_status: row.review_status ?? null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    ai_confidence: row.ai_confidence ?? null,
    manually_edited: row.manually_edited ?? null,
    reprocess_attempts: row.reprocess_attempts ?? null,
  }
}

/**
 * Smart dedup gate. Devuelve {reprocess, skipReason}.
 * reprocess=true → workflow debe UPDATEar row existente.
 * reprocess=false → workflow debe SKIPear (dedup tradicional).
 */
function evaluateGate(
  table: DedupTable,
  row: MatchRow
): { reprocess: boolean; skipReason: string | null } {
  if (table === 'documents') {
    return { reprocess: false, skipReason: 'table=documents (sin review fields)' }
  }
  if (row.manually_edited === true) {
    return { reprocess: false, skipReason: 'manually_edited=true (humano editó)' }
  }
  if (
    row.review_status &&
    ['revisado', 'confirmado'].includes(row.review_status)
  ) {
    return {
      reprocess: false,
      skipReason: `review_status=${row.review_status} (humano marcó OK)`,
    }
  }
  if (row.reviewed_at !== null || row.reviewed_by !== null) {
    return { reprocess: false, skipReason: 'reviewed_at/by set (humano tocó)' }
  }
  if ((row.ai_confidence ?? 0) >= CONFIDENCE_THRESHOLD) {
    return {
      reprocess: false,
      skipReason: `ai_confidence=${row.ai_confidence} >= ${CONFIDENCE_THRESHOLD} (OCR bueno)`,
    }
  }
  if ((row.reprocess_attempts ?? 0) >= MAX_REPROCESS) {
    return {
      reprocess: false,
      skipReason: `reprocess_attempts=${row.reprocess_attempts} >= ${MAX_REPROCESS} (cap anti-loop)`,
    }
  }
  return { reprocess: true, skipReason: null }
}

export async function POST(request: Request) {
  const startedAt = Date.now()

  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const body = parsed.data
  const dedupMethod: 'file_hash' | 'email_message_id' = body.file_hash
    ? 'file_hash'
    : 'email_message_id'

  // Feature flag check — rollout determinista por file_hash
  let smartDedupActive = false
  try {
    const flag = await getFlag(SMART_DEDUP_FLAG_KEY)
    if (flag?.enabled) {
      const subjectId = body.file_hash ?? body.email_message_id ?? 'no-subject'
      smartDedupActive = isInRollout(
        SMART_DEDUP_FLAG_KEY,
        subjectId,
        flag.rollout_pct
      )
    }
  } catch (err) {
    console.warn(
      '[dedup v3] feature flag lookup failed, defaulting OFF:',
      err instanceof Error ? err.message : err
    )
  }

  const supabase = createAdminSupabaseClient()

  try {
    const results = await Promise.all(
      DEDUP_TABLES.map(async (table) => ({
        table,
        row: await lookupInTable(supabase, table, body),
      }))
    )

    const matched = results.find((r) => r.row !== null)
    const elapsedMs = Date.now() - startedAt

    if (!matched) {
      console.log(
        `[dedup v3] method=${dedupMethod} match=none smart=${smartDedupActive} t=${elapsedMs}ms`
      )
      return Response.json({
        is_duplicate: false,
        existing_id: null,
        table: null,
        created_at: null,
        duplicate_reason: null,
        linked_doc_id: null,
        was_deleted: false,
        dedup_method: dedupMethod,
        reprocess_existing: false,
        existing_updated_at: null,
        existing_review_status: null,
        existing_ai_confidence: null,
        existing_reprocess_attempts: null,
        skip_reason: null,
        source: 'cathedral-dedup-v3',
      })
    }

    const { table, row } = matched
    if (!row) {
      throw new Error('matched.row null — unexpected')
    }

    const wasDeleted = Boolean(row.deleted_at)
    const docLabel = row.number ?? row.id
    const duplicateReason = wasDeleted
      ? `${dedupMethod} ya procesado en ${table} (${docLabel}) — soft-deleted ${row.deleted_at}`
      : `${dedupMethod} ya procesado en ${table} (${docLabel})`

    // Evaluar gate solo si Smart dedup activo. Si OFF: comportamiento v2 (siempre dedup tradicional).
    const gate = smartDedupActive
      ? evaluateGate(table, row)
      : { reprocess: false, skipReason: 'smart_dedup flag OFF (rollout)' }

    console.log(
      `[dedup v3] method=${dedupMethod} match=${table} id=${row.id.slice(0, 8)} ` +
        `smart=${smartDedupActive} reprocess=${gate.reprocess} skip=${gate.skipReason ?? '—'} ` +
        `t=${elapsedMs}ms`
    )

    return Response.json({
      // is_duplicate semántica v3: TRUE = no reprocesar (skip).
      // FALSE = ya existe pero gate permite reproceso (UPDATE).
      is_duplicate: !gate.reprocess,
      existing_id: row.id,
      table,
      created_at: row.created_at,
      duplicate_reason: duplicateReason,
      linked_doc_id: row.id,
      was_deleted: wasDeleted,
      dedup_method: dedupMethod,
      reprocess_existing: gate.reprocess,
      existing_updated_at: row.updated_at,
      existing_review_status: row.review_status,
      existing_ai_confidence: row.ai_confidence,
      existing_reprocess_attempts: row.reprocess_attempts,
      skip_reason: gate.skipReason,
      source: 'cathedral-dedup-v3',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[dedup v3] Unexpected error:', message)
    return Response.json(
      { error: 'Upstream error', detail: message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
