/**
 * GET /api/feature-flag-check?key=<flag>&subject_id=<id>
 *
 * Microutility: n8n consulta si un subject (file_hash, employee_id, etc.)
 * cae dentro del rollout de un feature flag. Devuelve `should_use` boolean
 * + metadata para que el workflow decida ruta.
 *
 * Llamado por:
 *   - workflow general n8n (HTTP Request node antes de cada utility candidata)
 *   - Portal trabajador upload-receipt (futuro, Tarea 5)
 *
 * Auth: header `Authorization: Bearer ${CATHEDRAL_INTERNAL_TOKEN}`.
 *
 * Response 200:
 *   {
 *     "should_use": boolean,        // flag.enabled && isInRollout(key, subject_id, pct)
 *     "flag_enabled": boolean,
 *     "rollout_pct": number,        // 0-100
 *     "source": "cathedral-flag-check-v1"
 *   }
 *
 * Performance: `getFlag` usa `unstable_cache` 60s + tag `feature-flags`,
 * por lo que <50ms p95 tras primer warmup (cache hit). Cuando admin cambia
 * un flag via Server Action → `revalidateTag('feature-flags')` invalida
 * inmediatamente → siguiente request relee BD.
 *
 * Diseño cutover progresivo (sin shadow comparison):
 *   - rollout_pct=0  → 0% tráfico al endpoint, 100% Code legacy
 *   - rollout_pct=10 → 10% (deterministic by subject_id, mismo file_hash siempre misma ruta)
 *   - rollout_pct=100 → cutover completo, eliminar Code legacy próxima sesión
 */
import { type NextRequest } from 'next/server'
import { getFlag, isInRollout } from '@/lib/feature-flags'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const QuerySchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/, 'key debe ser snake_case [a-z0-9_]'),
  subject_id: z.string().min(1).max(200),
})

function checkAuth(request: NextRequest): boolean {
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

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const parsed = QuerySchema.safeParse({
    key: searchParams.get('key') ?? '',
    subject_id: searchParams.get('subject_id') ?? '',
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

  const { key, subject_id } = parsed.data

  const flag = await getFlag(key)
  if (!flag) {
    return Response.json(
      { error: 'Flag not found', key, source: 'cathedral-flag-check-v1' },
      { status: 404 }
    )
  }

  const should_use = flag.enabled && isInRollout(key, subject_id, flag.rollout_pct)

  return Response.json({
    should_use,
    flag_enabled: flag.enabled,
    rollout_pct: flag.rollout_pct,
    source: 'cathedral-flag-check-v1',
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
