/**
 * POST /api/admin/revalidate-flags-cache
 *
 * Fuerza invalidación cache `unstable_cache` 60s `feature-flags` tag.
 * Útil cuando:
 *   - Admin cambia flag directo via Supabase SQL Editor (bypass endpoints)
 *   - Debug cache stale tras incident
 *   - Pre-cutover snapshot consistency check
 *
 * Body: vacío. Solo trigger acción.
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "tag": "feature-flags",
 *     "revalidated_at": ISO8601,
 *     "source": "cathedral-revalidate-flags-cache-v1"
 *   }
 *
 * Nota: revalidateTag NO purga cache distribuido CDN Vercel. Solo cache
 * memoria proceso `unstable_cache` 60s. Próxima call a getAllFlags() relee BD.
 */

import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { FLAG_CACHE_TAG } from '@/lib/feature-flags'
import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  if (!checkCathedralInternalAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  revalidateTag(FLAG_CACHE_TAG)

  console.log(`[revalidate-flags-cache] tag=${FLAG_CACHE_TAG} invalidated`)

  return Response.json({
    ok: true,
    tag: FLAG_CACHE_TAG,
    revalidated_at: new Date().toISOString(),
    source: 'cathedral-revalidate-flags-cache-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
