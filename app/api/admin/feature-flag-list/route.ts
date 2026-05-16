/**
 * GET /api/admin/feature-flag-list
 *
 * Devuelve TODOS los flags Cathedral con estado actual. Útil para scripts
 * automation que no quieren montar Supabase service_role key (solo precisan
 * CATHEDRAL_INTERNAL_TOKEN). Complemento a `/api/admin/feature-flag-toggle`
 * (write) — este es read-only list.
 *
 * Response 200:
 *   {
 *     "flags": [{ key, enabled, rollout_pct, description, updated_at, updated_by }, ...],
 *     "count": number,
 *     "source": "cathedral-flag-list-v1"
 *   }
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN (mismo patrón otros utilities).
 *
 * Uso típico (bash automation):
 *   curl -s -H "Authorization: Bearer $TOKEN" \
 *     https://cathedralgroup-website.vercel.app/api/admin/feature-flag-list | \
 *     jq '.flags[] | select(.rollout_pct > 0)'
 *
 * NO cachea — devuelve estado actual BD para reflejar cambios admin UI inmediato.
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
    .select('key, enabled, rollout_pct, description, updated_at, updated_by')
    .order('key', { ascending: true })

  if (error) {
    console.error('[flag-list] error:', error.message)
    return Response.json(
      { error: 'Upstream database error', detail: error.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  const flags = data ?? []
  return Response.json({
    flags,
    count: flags.length,
    source: 'cathedral-flag-list-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
