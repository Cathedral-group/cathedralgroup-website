/**
 * Feature flags runtime — Cathedral
 *
 * Tabla `public.feature_flags` (migration 16/05/2026).
 *
 * Lectura cacheada vía Next.js 15 `unstable_cache` (60s TTL + tag `feature-flags`).
 * Escritura siempre con `revalidateTag('feature-flags')` para invalidar inmediatamente.
 *
 * Rollout determinista: `isInRollout(key, subjectId, pct)` — hash SHA-256 estable
 * sobre `${flagKey}:${subjectId}` mapeado a 0-99. Mismo subject siempre cae igual.
 *
 * Uso típico (RSC o Server Action o Route Handler):
 *
 *   import { getFlag, isInRollout } from '@/lib/feature-flags'
 *
 *   const flag = await getFlag('use_dedup_endpoint')
 *   if (flag?.enabled && isInRollout('use_dedup_endpoint', file_hash, flag.rollout_pct)) {
 *     // shadow / cutover lógica
 *   }
 *
 * NUNCA usar en Client Component (utiliza service_role indirectamente vía RSC).
 */
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'

export const FLAG_CACHE_TAG = 'feature-flags'
const CACHE_TTL_SECONDS = 60

export interface FeatureFlag {
  key: string
  enabled: boolean
  description: string | null
  rollout_pct: number
  metadata: Record<string, unknown>
  updated_at: string
  updated_by: string | null
}

/**
 * Lee TODOS los flags (cache 60s).
 * Devuelve Record<key, FeatureFlag> (NO Map — `unstable_cache` serializa con JSON
 * y `Map` se pierde en el round-trip; objetos planos sí sobreviven).
 */
export const getAllFlags = unstable_cache(
  async (): Promise<Record<string, FeatureFlag>> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, enabled, description, rollout_pct, metadata, updated_at, updated_by')

    if (error) {
      console.error('[feature-flags] read error:', error.message)
      return {}
    }

    const flags: Record<string, FeatureFlag> = {}
    for (const row of (data ?? []) as FeatureFlag[]) {
      flags[row.key] = row
    }
    return flags
  },
  ['feature-flags:all'],
  {
    tags: [FLAG_CACHE_TAG],
    revalidate: CACHE_TTL_SECONDS,
  }
)

/**
 * Lee un flag específico. Wrapper sobre `getAllFlags()`.
 * Devuelve `null` si el flag no existe en BD.
 */
export async function getFlag(key: string): Promise<FeatureFlag | null> {
  const all = await getAllFlags()
  return all[key] ?? null
}

/**
 * Determina si un subject (file_hash, employee_id, etc.) cae dentro del % rollout.
 *
 * Determinista: misma combinación (flagKey, subjectId) → mismo bucket 0-99.
 * Incluye flagKey en hash para evitar correlación entre flags distintos.
 *
 * Convención:
 *   - rollout_pct = 0   → siempre false (kill-switch puro vía `enabled`)
 *   - rollout_pct = 100 → siempre true si `enabled = true`
 *   - rollout_pct = N   → ~N% de subjects únicos caen en TRUE
 *
 * @param flagKey clave del flag (debe coincidir con feature_flags.key)
 * @param subjectId identificador estable (file_hash, supplier_id, employee_id...)
 * @param pct entero 0-100
 */
export function isInRollout(flagKey: string, subjectId: string, pct: number): boolean {
  if (pct <= 0) return false
  if (pct >= 100) return true

  const hash = createHash('sha256').update(`${flagKey}:${subjectId}`).digest()
  // Tomamos primeros 4 bytes → uint32 → módulo 100
  const bucket = hash.readUInt32BE(0) % 100
  return bucket < pct
}

/**
 * Helper combinado: flag enabled + subject dentro de rollout.
 * Si `subjectId` se omite, solo evalúa `enabled` (kill-switch global).
 */
export async function isFlagOn(key: string, subjectId?: string): Promise<boolean> {
  const flag = await getFlag(key)
  if (!flag || !flag.enabled) return false
  if (subjectId === undefined) return flag.rollout_pct >= 100
  return isInRollout(key, subjectId, flag.rollout_pct)
}
