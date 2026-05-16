/**
 * POST /api/admin/feature-flag-batch
 *
 * Activa/desactiva múltiples flags en una sola call. Útil para:
 *   - Rollback masivo emergencia (todos flags → rollout_pct=0)
 *   - Activación coordinada cutover paralelo
 *   - Snapshot restore desde backup JSON
 *
 * Body:
 *   {
 *     "updates": [
 *       { "key": "use_dedup_endpoint", "enabled": true, "rollout_pct": 50 },
 *       { "key": "use_fuzzy_supplier_endpoint", "enabled": false, "rollout_pct": 0 }
 *     ]
 *   }
 *
 * Cada update es atomic individualmente. Si algún flag falla, otros siguen.
 * Response incluye result por flag.
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Cap defensive: max 20 updates per call (DoS prevention).
 *
 * Tras todos updates: `revalidateTag('feature-flags')` 1 sola vez.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { FLAG_CACHE_TAG } from '@/lib/feature-flags'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

const UpdateSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'key debe ser snake_case [a-z0-9_]')
    .max(80),
  enabled: z.boolean().optional(),
  rollout_pct: z.number().int().min(0).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
})

const BodySchema = z.object({
  updates: z.array(UpdateSchema).min(1).max(20),
})

interface UpdateResult {
  key: string
  ok: boolean
  previous?: { enabled: boolean; rollout_pct: number }
  current?: { enabled: boolean; rollout_pct: number }
  error?: string
}

export async function POST(request: Request) {
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

  const { updates } = parsed.data
  const supabase = createAdminSupabaseClient()
  const results: UpdateResult[] = []

  for (const update of updates) {
    // Validar al menos un campo presente (mismo patrón toggle single)
    if (
      update.enabled === undefined &&
      update.rollout_pct === undefined &&
      update.description === undefined
    ) {
      results.push({
        key: update.key,
        ok: false,
        error: 'Al menos un campo (enabled, rollout_pct, description) requerido',
      })
      continue
    }

    // Read current
    const { data: current, error: readErr } = await supabase
      .from('feature_flags')
      .select('enabled, rollout_pct')
      .eq('key', update.key)
      .maybeSingle()

    if (readErr) {
      results.push({ key: update.key, ok: false, error: readErr.message })
      continue
    }
    if (!current) {
      results.push({ key: update.key, ok: false, error: 'Flag not found' })
      continue
    }

    const previous = current as { enabled: boolean; rollout_pct: number }

    // Update patch
    const patch: Record<string, unknown> = {
      updated_by: 'cathedral-flag-batch-api',
    }
    if (update.enabled !== undefined) patch.enabled = update.enabled
    if (update.rollout_pct !== undefined) patch.rollout_pct = update.rollout_pct
    if (update.description !== undefined) patch.description = update.description

    const { error: updErr } = await supabase
      .from('feature_flags')
      .update(patch)
      .eq('key', update.key)

    if (updErr) {
      results.push({ key: update.key, ok: false, error: updErr.message })
      continue
    }

    results.push({
      key: update.key,
      ok: true,
      previous,
      current: {
        enabled: update.enabled !== undefined ? update.enabled : previous.enabled,
        rollout_pct:
          update.rollout_pct !== undefined ? update.rollout_pct : previous.rollout_pct,
      },
    })
  }

  // Invalidate cache 1 sola vez tras todos updates
  revalidateTag(FLAG_CACHE_TAG)

  const succeeded = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(
    `[flag-batch] processed=${updates.length} ok=${succeeded} failed=${failed}`
  )

  return Response.json({
    ok: failed === 0,
    succeeded,
    failed,
    results,
    source: 'cathedral-flag-batch-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
