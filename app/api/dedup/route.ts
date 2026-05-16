/**
 * POST /api/dedup
 *
 * Microutility endpoint: dedup SHA-256 lookup contra tablas Supabase.
 *
 * Llamado por:
 *   - workflow n8n general (HTTP Request node) sustituye Code node
 *     "Check Duplicado Supabase" — más rápido y reusable
 *   - Portal trabajador upload route (futuro, integración pendiente)
 *
 * Body:
 *   { "file_hash": "<SHA-256 hex 64 chars>" }
 *
 * Response 200:
 *   {
 *     "is_duplicate": boolean,
 *     "existing_id": uuid | null,
 *     "table": "invoices" | "documents" | null,
 *     "created_at": ISO8601 | null,
 *     "source": "cathedral-dedup-v1"
 *   }
 *
 * Auth: header `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}`.
 * NO público. Llamado solo desde n8n + endpoints internos Cathedral.
 *
 * Scope (ADR-0008 futuro ampliará a worker_attachments cuando se añada
 * columna file_hash en esa tabla — hoy no existe en schema).
 *
 * Performance objetivo: <500ms p95 (2 queries Supabase paralelas con
 * index B-tree UNIQUE en ambas tablas: invoices_file_hash_key +
 * uniq_documents_file_hash).
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const BodySchema = z.object({
  file_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'SHA-256 hex requerido (64 chars lowercase)'),
})

/**
 * Comparación constant-time del Bearer token.
 * `.trim()` en ambos lados para tolerar whitespace trailing en env vars
 * (caso común en Vercel + .env).
 * `timingSafeEqual` lanza si las longitudes no coinciden — manejamos con try/catch.
 */
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

export async function POST(request: Request) {
  const startedAt = Date.now()

  // 1. Auth
  if (!checkAuth(request)) {
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

  const { file_hash } = parsed.data

  // 3. Queries paralelas a 2 tablas con file_hash indexado.
  //    `.maybeSingle()` devuelve `data: null` sin error cuando 0 rows (vs `.single()`
  //    que devuelve PGRST116 error). Evita logs de error falso.
  //    Ambas tablas: filtramos `deleted_at IS NULL` para no devolver soft-deleted.
  const supabase = createAdminSupabaseClient()

  try {
    const [invoicesRes, documentsRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, created_at')
        .eq('file_hash', file_hash)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('documents')
        .select('id, created_at')
        .eq('file_hash', file_hash)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle(),
    ])

    // Error real de Supabase (no 0-rows)
    if (invoicesRes.error || documentsRes.error) {
      console.error(
        '[dedup] Supabase error invoices=%s documents=%s',
        invoicesRes.error?.message ?? 'ok',
        documentsRes.error?.message ?? 'ok'
      )
      return Response.json(
        { error: 'Upstream database error' },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    // Prioridad lookup: invoices primero (procesamiento principal), después documents
    const match = invoicesRes.data
      ? {
          table: 'invoices' as const,
          id: invoicesRes.data.id as string,
          created_at: invoicesRes.data.created_at as string,
        }
      : documentsRes.data
        ? {
            table: 'documents' as const,
            id: documentsRes.data.id as string,
            created_at: documentsRes.data.created_at as string,
          }
        : null

    const elapsedMs = Date.now() - startedAt
    console.log(
      `[dedup] hash=${file_hash.slice(0, 8)}… match=${match?.table ?? 'none'} t=${elapsedMs}ms`
    )

    return Response.json({
      is_duplicate: match !== null,
      existing_id: match?.id ?? null,
      table: match?.table ?? null,
      created_at: match?.created_at ?? null,
      source: 'cathedral-dedup-v1',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error('[dedup] Unexpected error:', message)
    return Response.json(
      { error: 'Upstream error', detail: message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }
}

// Endpoint solo POST. GET/etc devuelve 405 implícito.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Endpoint <500ms p95 — sobra con default. No subir maxDuration innecesariamente.
