/**
 * POST /api/admin/login
 * Body: { email: string, password: string }
 * Returns: { ok: true } on success, { error: string } on failure (401/429)
 *
 * Endpoint proxy de login que aplica rate-limit server-side ANTES de validar
 * credenciales contra Supabase. Bloquea brute-force que el rate-limit
 * client-side (sessionStorage) no podría parar.
 *
 * Política:
 *   - Máx 10 intentos fallidos por IP en 15 minutos → HTTP 429
 *   - Si excede: respuesta incluye `retryAfter` en segundos
 *   - Tras login exitoso, las cookies de sesión se setean automáticamente
 *     vía createServerSupabaseClient() (Supabase SSR maneja la cookie)
 *   - Tras login exitoso NO se devuelve la sesión al cliente — solo `{ok: true}`
 *     para evitar que se loggee el JWT por accidente
 *
 * Tras éxito, el cliente debe redirigir a /admin. El middleware se encargará
 * del flujo MFA si el usuario tiene Google Authenticator configurado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'

const MAX_ATTEMPTS = 10
const WINDOW_MINUTES = 15

function getClientIp(request: NextRequest): string {
  // Vercel inyecta x-forwarded-for con la IP real del cliente
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? null
  const adminClient = createAdminSupabaseClient()

  // 1. Check rate-limit antes de hacer nada
  const { data: rateCheck } = await adminClient.rpc('check_login_rate_limit', {
    p_ip: ip,
    p_max_attempts: MAX_ATTEMPTS,
    p_window_minutes: WINDOW_MINUTES,
  })
  const limit = Array.isArray(rateCheck) ? rateCheck[0] : rateCheck
  if (limit && !limit.allowed) {
    const retryAfter = Math.max(1, limit.retry_after_seconds ?? 60)
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos desde tu IP. Espera ${Math.ceil(retryAfter / 60)} minutos.`,
        retryAfter,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    )
  }

  // 2. Parse body
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 })
  }

  // 3. Intentar login (las cookies se setean automáticamente en el response vía SSR)
  const supabase = await createServerSupabaseClient()
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

  // 4. Registrar intento (fire-and-forget)
  void adminClient.from('login_attempts').insert({
    ip,
    email,
    success: !authError,
    user_agent: userAgent,
  })

  if (authError) {
    // Mensaje genérico — no revelar si el email existe o no (anti-enumeration)
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  // 5. Limpieza periódica oportunista (1% de los logins exitosos)
  if (Math.random() < 0.01) {
    void adminClient.rpc('cleanup_old_login_attempts')
  }

  return NextResponse.json({ ok: true })
}
