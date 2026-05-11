/**
 * GET /api/admin/push/vapid-key
 *
 * Devuelve la clave pública VAPID del server. El navegador la necesita para
 * registrar una PushSubscription (la usa para verificar que los pushes vienen
 * realmente de este server).
 *
 * Auth: admin allow-list + AAL2.
 *
 * Si no hay clave configurada en env → 503 (el botón "Activar notificaciones"
 * queda deshabilitado y el cliente sabe que falta config).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { getVapidPublicKey } from '@/lib/push-server'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function GET(_request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const publicKey = getVapidPublicKey()
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Push notifications no configuradas en el server (falta VAPID_PUBLIC_KEY)' },
      { status: 503 },
    )
  }

  return NextResponse.json({ publicKey })
}

export const dynamic = 'force-dynamic'
