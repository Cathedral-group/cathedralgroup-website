/**
 * GET /api/admin/audit-log-recent?table=feature_flags&limit=50
 *
 * Lista admin_audit_log entries recientes. Útil:
 *   - Verificar Server Actions feature-flags loggean correctamente
 *   - Audit trail cambios admin (quién hizo qué cuándo)
 *   - Investigar incidentes producción
 *
 * Query params:
 *   - table: filtro table_name (opcional, e.g. 'feature_flags')
 *   - limit: max rows (default 50, max 200)
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Response 200:
 *   {
 *     "rows": [{ user_email, action, table_name, record_id, ip, created_at }, ...],
 *     "count": number,
 *     "source": "cathedral-audit-log-recent-v1"
 *   }
 */

import { type NextRequest } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { z } from 'zod'

const QuerySchema = z.object({
  table: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: NextRequest) {
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const parsed = QuerySchema.safeParse({
    table: sp.get('table') ?? undefined,
    limit: sp.get('limit') ?? undefined,
  })

  if (!parsed.success) {
    return Response.json(
      {
        error: 'Validation failed',
        detail: parsed.error.issues[0]?.message ?? 'Invalid query params',
      },
      { status: 400 }
    )
  }

  const { table, limit } = parsed.data
  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('admin_audit_log')
    .select('user_email, action, table_name, record_id, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (table) {
    query = query.eq('table_name', table)
  }

  const { data, error } = await query

  if (error) {
    console.error('[audit-log-recent] read error:', error.message)
    return Response.json(
      { error: 'Upstream database error', detail: error.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  const rows = data ?? []
  return Response.json({
    rows,
    count: rows.length,
    source: 'cathedral-audit-log-recent-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
