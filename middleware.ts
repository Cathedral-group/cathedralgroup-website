import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Solo protegemos /admin — login, reset-password y mfa quedan fuera (manejan su propio flujo)
  if (!pathname.startsWith('/admin')) return NextResponse.next()
  if (
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/admin/reset-password') ||
    pathname.startsWith('/admin/mfa')
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next({ request: { headers: request.headers } })

  // @supabase/ssr puede refrescar y ROTAR el refresh-token durante getUser(). Capturamos las
  // cookies que escribe para copiarlas en CUALQUIER respuesta de redirect — si no, una rotación
  // durante un request que redirige perdería el token nuevo y cerraría la sesión antes de tiempo
  // (contrato @supabase/ssr).
  let pendingCookies: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          pendingCookies = cookiesToSet
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Redirect que preserva las cookies refrescadas (rotation-safe).
  const redirectTo = (path: string, errorCode?: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    if (errorCode) url.searchParams.set('error', errorCode)
    const res = NextResponse.redirect(url)
    pendingCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) return redirectTo('/admin/login')

  // Allow-list: solo emails autorizados (defensa contra signups o usuarios huérfanos)
  if (!isAdminEmail(data.user.email)) {
    await supabase.auth.signOut()
    return redirectTo('/admin/login', 'unauthorized')
  }

  // MFA enforcement: fail-closed si el chequeo de nivel falla (sin revelar detalle)
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal) {
    console.error('[middleware] MFA aal check failed', { user: data.user.email, err: aalError?.message })
    return redirectTo('/admin/login', 'mfa_check_failed')
  }
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    // Tiene MFA enrolado pero no verificado en esta sesión → verificar
    return redirectTo('/admin/mfa')
  }
  if (aal.nextLevel !== 'aal2') {
    // Sin factor MFA enrolado todavía → forzar setup
    return redirectTo('/admin/mfa/setup')
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
