/**
 * POST /api/admin/feature-flag-toggle
 *
 * Endpoint curl-friendly para activar/desactivar flags + cambiar rollout_pct sin
 * abrir UI admin. Alternativa a Server Action `updateFlagAction` para scripts
 * CI, cutover automation, alertas Hetzner rollback automático.
 *
 * Body:
 *   {
 *     "key": "use_dedup_endpoint",
 *     "enabled"?: boolean,         // opcional, mantiene actual si omite
 *     "rollout_pct"?: number,      // opcional 0-100, mantiene actual si omite
 *     "description"?: string|null  // opcional
 *   }
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "key": "...",
 *     "previous": {enabled, rollout_pct},
 *     "current": {enabled, rollout_pct},
 *     "source": "cathedral-flag-toggle-v1"
 *   }
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN (mismo patrón otros utilities).
 *
 * Tras update: `revalidateTag('feature-flags')` invalida cache `unstable_cache`
 * 60s → siguiente call a `/api/feature-flag-check` lee BD inmediatamente.
 *
 * Usos típicos:
 *
 *   # Activar rollout 10%
 *   curl -X POST https://cathedralgroup-website.vercel.app/api/admin/feature-flag-toggle \
 *     -H "Authorization: Bearer $TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"key":"use_dedup_endpoint","enabled":true,"rollout_pct":10}'
 *
 *   # Subir a 50%
 *   curl -X POST ... -d '{"key":"use_dedup_endpoint","rollout_pct":50}'
 *
 *   # Rollback emergency
 *   curl -X POST ... -d '{"key":"use_dedup_endpoint","rollout_pct":0,"enabled":false}'
 *
 * NO sustituye UI admin (`/admin/sistema/flags`) — solo añade canal alternativo
 * para automation. UI sigue siendo la fuente principal para uso interactivo.
 *
 * Auditoría: este endpoint usa el mismo token que el resto de utilities (NO
 * requiere login admin web). Token rotable si compromiso sospechado.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { FLAG_CACHE_TAG } from '@/lib/feature-flags'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

const KEY_REGEX = /^[a-z0-9_]+$/

const BodySchema = z
  .object({
    key: z.string().regex(KEY_REGEX, 'key debe ser snake_case [a-z0-9_]').max(80),
    enabled: z.boolean().optional(),
    rollout_pct: z.number().int().min(0).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine(
    (d) =>
      d.enabled !== undefined ||
      d.rollout_pct !== undefined ||
      d.description !== undefined,
    { error: 'Al menos un campo (enabled, rollout_pct, description) requerido' }
  )

// Auth via lib/api-auth (refactor 16/05 noche).

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

  const { key, enabled, rollout_pct, description } = parsed.data
  const supabase = createAdminSupabaseClient()

  // Read current state primero para devolver previous/current diff
  const { data: current, error: readErr } = await supabase
    .from('feature_flags')
    .select('enabled, rollout_pct')
    .eq('key', key)
    .maybeSingle()

  if (readErr) {
    console.error('[flag-toggle] read error:', readErr.message)
    return Response.json(
      { error: 'Upstream database error', detail: readErr.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  if (!current) {
    return Response.json(
      { error: 'Flag not found', key },
      { status: 404 }
    )
  }

  const previous = current as { enabled: boolean; rollout_pct: number }

  // Construir patch solo con campos provistos
  const patch: Record<string, unknown> = {
    updated_by: 'cathedral-flag-toggle-api',
  }
  if (enabled !== undefined) patch.enabled = enabled
  if (rollout_pct !== undefined) patch.rollout_pct = rollout_pct
  if (description !== undefined) patch.description = description

  const { error: updErr } = await supabase
    .from('feature_flags')
    .update(patch)
    .eq('key', key)

  if (updErr) {
    console.error('[flag-toggle] update error:', updErr.message)
    return Response.json(
      { error: 'Upstream database error', detail: updErr.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  // Invalidate cache `unstable_cache` 60s en lib/feature-flags.ts
  revalidateTag(FLAG_CACHE_TAG)

  // Audit log persistente (CHECK constraint extendido commit 20260516210000)
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    await supabase.from('admin_audit_log').insert({
      user_email: 'api:cathedral-internal-token',
      action: 'flag_toggle_api',
      table_name: 'feature_flags',
      record_id: key,
      ip,
    })
  } catch (err) {
    console.warn('[flag-toggle] audit log failed (non-blocking):', err)
  }

  const currentResult = {
    enabled: enabled !== undefined ? enabled : previous.enabled,
    rollout_pct: rollout_pct !== undefined ? rollout_pct : previous.rollout_pct,
  }

  console.log(
    `[flag-toggle] key=${key} previous={enabled:${previous.enabled},pct:${previous.rollout_pct}} ` +
      `current={enabled:${currentResult.enabled},pct:${currentResult.rollout_pct}}`
  )

  return Response.json({
    ok: true,
    key,
    previous: { enabled: previous.enabled, rollout_pct: previous.rollout_pct },
    current: currentResult,
    source: 'cathedral-flag-toggle-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
