/**
 * POST /api/admin/feature-flag-delete
 *
 * Borra un flag de la tabla `feature_flags`. Endpoint admin para cleanup
 * de flags obsoletos tras cutover completo (e.g. cuando un flag llegó a
 * rollout=100 y se eliminaron los nodos legacy del workflow → el flag
 * ya no tiene consumers vivos).
 *
 * Body:
 *   { "key": "use_dedup_endpoint", "confirm": "DELETE-FLAG-NAME-HERE" }
 *
 * Safety: requiere `confirm` con valor exacto `DELETE-${key}` para prevenir
 * borrados accidentales por curl con typo. Patrón AWS terraform destroy.
 *
 * Auth: Bearer CATHEDRAL_INTERNAL_TOKEN.
 *
 * Tras DELETE: `revalidateTag('feature-flags')` invalida cache `unstable_cache`.
 *
 * Use cases:
 *   - Cleanup flag post-cutover completo (workflow productivo n8n no consulta más)
 *   - Eliminar flag temporal de tests
 *   - Recovery accidental flag mal creado
 *
 * NO recomendado: borrar flag activo (rollout_pct > 0) sin antes bajar a 0 +
 * verificar 24h sin tráfico residual. Mejor: rollback → wait → delete.
 *
 * Response 200 con previous state (audit trail).
 * Response 404 si key no existe.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { FLAG_CACHE_TAG } from '@/lib/feature-flags'
import { checkCathedralInternalAuth } from '@/lib/api-auth'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

const BodySchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/).max(80),
  confirm: z.string().max(200),
})

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

  const { key, confirm } = parsed.data
  const expectedConfirm = `DELETE-${key}`

  if (confirm !== expectedConfirm) {
    return Response.json(
      {
        error: 'Confirmación inválida',
        detail: `Para borrar flag '${key}', enviar confirm="${expectedConfirm}"`,
      },
      { status: 400 }
    )
  }

  const supabase = createAdminSupabaseClient()

  // Read current para audit trail
  const { data: current, error: readErr } = await supabase
    .from('feature_flags')
    .select('key, enabled, rollout_pct, description')
    .eq('key', key)
    .maybeSingle()

  if (readErr) {
    console.error('[flag-delete] read error:', readErr.message)
    return Response.json(
      { error: 'Upstream database error', detail: readErr.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  if (!current) {
    return Response.json({ error: 'Flag not found', key }, { status: 404 })
  }

  const previous = current as {
    key: string
    enabled: boolean
    rollout_pct: number
    description: string | null
  }

  // Safety check adicional: si flag está activo (enabled+rollout>0), warn
  // pero permitir borrado (caller ya confirmó con DELETE-${key}).
  const wasActive = previous.enabled && previous.rollout_pct > 0

  const { error: delErr } = await supabase
    .from('feature_flags')
    .delete()
    .eq('key', key)

  if (delErr) {
    console.error('[flag-delete] DELETE error:', delErr.message)
    return Response.json(
      { error: 'Upstream database error', detail: delErr.message },
      { status: 503, headers: { 'Retry-After': '5' } }
    )
  }

  revalidateTag(FLAG_CACHE_TAG)

  console.log(
    `[flag-delete] key=${key} deleted previous_enabled=${previous.enabled} pct=${previous.rollout_pct} was_active=${wasActive}`
  )

  return Response.json({
    ok: true,
    key,
    previous,
    was_active: wasActive,
    warning: wasActive
      ? 'Flag estaba ACTIVO al borrar. Consumers que consultaban este flag obtendrán now 404.'
      : null,
    source: 'cathedral-flag-delete-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
