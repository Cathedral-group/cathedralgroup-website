'use server'

/**
 * Server Actions: feature_flags CRUD admin.
 *
 * Llamadas SOLO desde Client Components dentro del panel admin
 * (`/admin/sistema/flags`). Cada acción re-verifica auth + allow-list
 * (no se fía de middleware — defensa en profundidad).
 *
 * Tras cada mutación: `revalidateTag('feature-flags')` para invalidar
 * cache `unstable_cache` de `lib/feature-flags.ts`.
 */

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { FLAG_CACHE_TAG } from '@/lib/feature-flags'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

const KEY_REGEX = /^[a-z0-9_]+$/
const KEY_MAX_LEN = 80

const UpdateSchema = z.object({
  key: z.string().regex(KEY_REGEX, 'key debe ser snake_case [a-z0-9_]').max(KEY_MAX_LEN),
  enabled: z.boolean(),
  rollout_pct: z.number().int().min(0).max(100),
  description: z.string().max(500).nullable().optional(),
})

const CreateSchema = UpdateSchema.extend({
  description: z.string().max(500).nullable().optional(),
})

const DeleteSchema = z.object({
  key: z.string().regex(KEY_REGEX).max(KEY_MAX_LEN),
})

type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

async function requireAdmin(): Promise<{ email: string } | { error: string }> {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user?.email) {
    return { error: 'No autenticado' }
  }
  if (!isAdminEmail(data.user.email)) {
    return { error: 'Sin permiso (no en allow-list)' }
  }
  return { email: data.user.email }
}

export async function updateFlagAction(input: z.infer<typeof UpdateSchema>): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const parsed = UpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validación fallida' }
  }
  const { key, enabled, rollout_pct, description } = parsed.data

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('feature_flags')
    .update({
      enabled,
      rollout_pct,
      description: description ?? null,
      updated_by: auth.email,
    })
    .eq('key', key)

  if (error) {
    console.error('[feature-flags] update error:', error.message)
    return { ok: false, error: error.message }
  }

  revalidateTag(FLAG_CACHE_TAG)
  console.log(`[feature-flags] ${auth.email} updated key=${key} enabled=${enabled} pct=${rollout_pct}`)
  return { ok: true }
}

export async function createFlagAction(input: z.infer<typeof CreateSchema>): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validación fallida' }
  }
  const { key, enabled, rollout_pct, description } = parsed.data

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('feature_flags')
    .insert({
      key,
      enabled,
      rollout_pct,
      description: description ?? null,
      updated_by: auth.email,
    })

  if (error) {
    console.error('[feature-flags] insert error:', error.message)
    return { ok: false, error: error.message }
  }

  revalidateTag(FLAG_CACHE_TAG)
  console.log(`[feature-flags] ${auth.email} created key=${key}`)
  return { ok: true }
}

export async function deleteFlagAction(input: z.infer<typeof DeleteSchema>): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const parsed = DeleteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validación fallida' }
  }

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('feature_flags')
    .delete()
    .eq('key', parsed.data.key)

  if (error) {
    console.error('[feature-flags] delete error:', error.message)
    return { ok: false, error: error.message }
  }

  revalidateTag(FLAG_CACHE_TAG)
  console.log(`[feature-flags] ${auth.email} deleted key=${parsed.data.key}`)
  return { ok: true }
}
