/**
 * POST /api/dedup
 *
 * Microutility endpoint: dedup lookup contra tablas Supabase (v2).
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
 *     "include_deleted"?: boolean            // default false (portal no quiere soft-deleted)
 *   }
 *
 * Response 200:
 *   {
 *     // Campos v1 (backward compat con consumers actuales):
 *     "is_duplicate": boolean,
 *     "existing_id": uuid | null,
 *     "table": "invoices" | "quotes" | "documents" | null,
 *     "created_at": ISO8601 | null,
 *     // Campos v2 (paridad funcional n8n legacy):
 *     "duplicate_reason": string | null,     // formato: "<method> ya procesado en <table> (<number|id>)..."
 *     "linked_doc_id": uuid | null,          // = existing_id (alias por compat n8n)
 *     "was_deleted": boolean,                // true si match es soft-deleted (solo cuando include_deleted=true)
 *     "dedup_method": "file_hash" | "email_message_id" | null,
 *     "source": "cathedral-dedup-v2"
 *   }
 *
 * Auth: header `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}`.
 * NO público. Llamado solo desde n8n + endpoints internos Cathedral.
 *
 * Cambios v2 (16/05/2026 noche):
 *   - 3 tablas (añadido `quotes`): invoices > quotes > documents prioridad
 *   - OR lookup: file_hash prioridad, fallback email+filename
 *   - `include_deleted` flag → n8n envía true (paridad legacy), portal omite (default false)
 *   - Campos extra: duplicate_reason, linked_doc_id, was_deleted, dedup_method
 *   - source bumpeado a v2 (v1 consumers reciben superconjunto, sin breaking change)
 *
 * Tabla `documents` NO tiene columna `number` → SELECT condicional.
 *
 * Performance: ambos lookups (file_hash y email_message_id+filename) cubiertos por
 * indexes B-tree existentes en las 3 tablas (verificado empíricamente 16/05).
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { timingSafeEqual } from 'node:crypto'
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

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const expected = (process.env.CATHEDRAL_INTERNAL_TOKEN ?? '').trim()

  if (!token || !expected) return false
  if (token.length !== expected.length) return false

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

// Tablas en orden de prioridad para lookup (primer match gana).
const DEDUP_TABLES = ['invoices', 'quotes', 'documents'] as const
type DedupTable = (typeof DEDUP_TABLES)[number]

interface MatchRow {
  id: string
  number: string | null
  created_at: string
  deleted_at: string | null
}

async function lookupInTable(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: DedupTable,
  body: DedupBody
): Promise<MatchRow | null> {
  // `documents` no tiene columna `number` → SELECT condicional
  const cols =
    table === 'documents'
      ? 'id, created_at, deleted_at'
      : 'id, number, created_at, deleted_at'

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

  // Política deleted_at: solo filtra cuando include_deleted=false (default portal)
  if (!body.include_deleted) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error(`[dedup v2] ${table} lookup error:`, error.message)
    return null
  }
  if (!data) return null
  // Supabase TS infiere ParserError con select string dinámico — cast via unknown.
  // `documents` no tiene `number` → undefined → null en el row final.
  const row = data as unknown as {
    id: string
    number?: string
    created_at: string
    deleted_at: string | null
  }
  return {
    id: row.id,
    number: row.number ?? null,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now()

  if (!checkAuth(request)) {
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

  const supabase = createAdminSupabaseClient()

  try {
    // 3 lookups paralelos. Resultado por tabla, primer match gana en prioridad
    // invoices > quotes > documents.
    const results = await Promise.all(
      DEDUP_TABLES.map(async (table) => ({
        table,
        row: await lookupInTable(supabase, table, body),
      }))
    )

    // Prioridad lookup: invoices > quotes > documents
    const matched = results.find((r) => r.row !== null)
    const elapsedMs = Date.now() - startedAt

    if (!matched) {
      console.log(
        `[dedup v2] method=${dedupMethod} match=none include_deleted=${body.include_deleted} t=${elapsedMs}ms`
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
        source: 'cathedral-dedup-v2',
      })
    }

    const { table, row } = matched
    if (!row) {
      // defensive — type narrowing
      throw new Error('matched.row null — unexpected')
    }

    const wasDeleted = Boolean(row.deleted_at)
    const docLabel = row.number ?? row.id
    const duplicateReason = wasDeleted
      ? `${dedupMethod} ya procesado en ${table} (${docLabel}) — soft-deleted ${row.deleted_at}`
      : `${dedupMethod} ya procesado en ${table} (${docLabel})`

    console.log(
      `[dedup v2] method=${dedupMethod} match=${table} id=${row.id.slice(0, 8)} deleted=${wasDeleted} t=${elapsedMs}ms`
    )

    return Response.json({
      is_duplicate: true,
      existing_id: row.id,
      table,
      created_at: row.created_at,
      duplicate_reason: duplicateReason,
      linked_doc_id: row.id,
      was_deleted: wasDeleted,
      dedup_method: dedupMethod,
      source: 'cathedral-dedup-v2',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[dedup v2] Unexpected error:', message)
    return Response.json(
      { error: 'Upstream error', detail: message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }
}

// Endpoint solo POST. GET/etc devuelve 405 implícito.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
