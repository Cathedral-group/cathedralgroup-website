/**
 * /admin/sistema/registry
 *
 * UI admin para editar el Single Source of Truth Cathedral:
 *   - Doc types (catálogo tipos documento)
 *   - Prompts IA
 *   - Providers IA
 *
 * Cualquier cambio aquí afecta workflow n8n + UI + libs server-side.
 * Cache invalidation: trigger pg_notify ya activo en BD; clientes refrescan
 * con sessionStorage 5min TTL.
 */
import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import RegistryEditor from './RegistryEditor'

export const dynamic = 'force-dynamic'

export default async function RegistryPage() {
  const authClient = await createServerSupabaseClient()
  const { data: userData } = await authClient.auth.getUser()
  const user = userData?.user
  if (!user?.email || !isAdminEmail(user.email)) {
    redirect('/admin/login')
  }
  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') {
    redirect('/admin/mfa?next=/admin/sistema/registry')
  }

  const supabase = createAdminSupabaseClient()
  const [docTypesRes, promptsRes, providersRes] = await Promise.all([
    supabase.from('doc_types_registry').select('*').order('display_order', { ascending: true }),
    supabase.from('prompt_templates').select('*').order('code'),
    supabase.from('ai_providers_registry').select('*').order('use_case').order('priority'),
  ])

  return (
    <RegistryEditor
      initialDocTypes={docTypesRes.data || []}
      initialPrompts={promptsRes.data || []}
      initialProviders={providersRes.data || []}
    />
  )
}
