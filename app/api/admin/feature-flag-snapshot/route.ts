/**
 * GET /api/admin/feature-flag-snapshot
 *
 * Devuelve snapshot completo de todos los flags incluyendo metadata + updated_at
 * para backup pre-cutover. Diferente de /api/admin/feature-flag-list que solo
 * devuelve campos esenciales.
 *
 * Snapshot diseñado para:
 *   - Backup JSON pre-cutover (commit en repo para reference histórica)
 *   - Restore via /api/admin/feature-flag-batch (replay updates)
 *   - Audit estado en momento concreto
 *
 * Response 200:
 *   {
 *     "snapshot_at": ISO8601,
 *     "flags": [
 *       { key, enabled, rollout_pct, description, metadata, created_at,
 *         updated_at, updated_by }
 *     ],
 *     "count": number,
 *     "source": "cathedral-flag-snapshot-v1"
 *   }
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Uso típico (pre-cutover backup):
 *   curl -s -H "Authorization: Bearer $T" \
 *     https://cathedralgroup-website.vercel.app/api/admin/feature-flag-snapshot \
 *     > backups/flags-$(date -u +%Y%m%d-%H%M%S).json
 *
 * Restore (cuidado, sobrescribe estado actual):
 *   cat backup.json | jq '{updates: [.flags[] |
 *     {key, enabled, rollout_pct, description}]}' | curl -X POST \
 *     .../api/admin/feature-flag-batch -d @-
 */

import { type NextRequest } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { checkCathedralInternalAuth } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, enabled, rollout_pct, description, metadata, created_at, updated_at, updated_by')
    .order('key', { ascending: true })

  if (error) {
    console.error('[flag-snapshot] error:', error.message)
    return Response.json(
      { error: 'Upstream database error', detail: error.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  const flags = data ?? []
  return Response.json({
    snapshot_at: new Date().toISOString(),
    flags,
    count: flags.length,
    source: 'cathedral-flag-snapshot-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
