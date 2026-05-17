/**
 * /admin/sistema/flags — admin UI feature_flags
 *
 * RSC: verifica auth + allow-list, lee flags vía service_role,
 * pasa data inicial al Client Component `FlagsManager` que hace mutaciones
 * vía Server Actions con `useOptimistic` + `useTransition`.
 */
import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import FlagsManager from './FlagsManager'
import type { FeatureFlag } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export default async function FeatureFlagsPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: authError } = await authClient.auth.getUser()
  if (authError || !userData?.user?.email) redirect('/admin/login')
  if (!isAdminEmail(userData.user.email)) redirect('/admin')

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, enabled, description, rollout_pct, metadata, updated_at, updated_by')
    .order('key', { ascending: true })

  const flags = (error ? [] : data ?? []) as FeatureFlag[]

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Marcas de funcionalidad</h1>
        <p className="mt-1 text-sm text-stone-600">
          Activación en tiempo de ejecución + despliegue porcentual. Caché 60 s — los cambios se aplican{' '}
          inmediatamente vía <code className="rounded bg-stone-100 px-1">revalidateTag</code>.
        </p>
        {error ? (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error leyendo marcas: {error.message}
          </p>
        ) : null}
      </header>

      <FlagsManager initialFlags={flags} />
    </div>
  )
}
