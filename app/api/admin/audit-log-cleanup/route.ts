/**
 * POST /api/admin/audit-log-cleanup
 *
 * Borra rows admin_audit_log más antiguos que `older_than_days` (default 365).
 * Retention policy ADR-0011: audit log NO crece indefinidamente.
 *
 * Body:
 *   { "older_than_days"?: number, "dry_run"?: boolean }
 *
 * Defaults:
 *   - older_than_days = 365 (1 año retention)
 *   - dry_run = false (aplica DELETE real)
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Safety:
 *   - older_than_days min 30 (no borrar rows recientes accidentalmente)
 *   - dry_run=true devuelve count sin borrar (preview impact)
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "deleted_count": number | null (null si dry_run),
 *     "older_than_days": number,
 *     "cutoff_date": ISO8601,
 *     "dry_run": boolean,
 *     "source": "cathedral-audit-log-cleanup-v1"
 *   }
 *
 * Uso típico (cron mensual):
 *   curl -X POST .../api/admin/audit-log-cleanup -H "Auth..." -d '{}'
 *
 * Preview mensual previo cleanup:
 *   curl -X POST .../api/admin/audit-log-cleanup -d '{"dry_run":true}'
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { z } from 'zod'

const BodySchema = z.object({
  older_than_days: z.number().int().min(30).max(3650).default(365),
  dry_run: z.boolean().default(false),
})

export async function POST(request: Request) {
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown = {}
  try {
    raw = await request.json()
  } catch {
    // body vacío OK — usa defaults
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

  const { older_than_days, dry_run } = parsed.data
  const cutoff = new Date(Date.now() - older_than_days * 86400000).toISOString()

  const supabase = createAdminSupabaseClient()

  if (dry_run) {
    // Preview: count rows que se borrarían
    const { count, error } = await supabase
      .from('admin_audit_log')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff)

    if (error) {
      console.error('[audit-cleanup] preview error:', error.message)
      return Response.json(
        { error: 'Upstream database error', detail: error.message },
        { status: 503, headers: { 'Retry-After': '5' } }
      )
    }

    return Response.json({
      ok: true,
      deleted_count: null,
      preview_count: count ?? 0,
      older_than_days,
      cutoff_date: cutoff,
      dry_run: true,
      source: 'cathedral-audit-log-cleanup-v1',
    })
  }

  // Real DELETE
  const { count, error } = await supabase
    .from('admin_audit_log')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (error) {
    console.error('[audit-cleanup] DELETE error:', error.message)
    return Response.json(
      { error: 'Upstream database error', detail: error.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  console.log(
    `[audit-cleanup] deleted=${count ?? 0} older_than_days=${older_than_days} cutoff=${cutoff}`
  )

  return Response.json({
    ok: true,
    deleted_count: count ?? 0,
    older_than_days,
    cutoff_date: cutoff,
    dry_run: false,
    source: 'cathedral-audit-log-cleanup-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
