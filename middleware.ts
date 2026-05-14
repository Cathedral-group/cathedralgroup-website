import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect admin routes — skip login and reset-password
  if (!pathname.startsWith('/admin')) return NextResponse.next()
  if (
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/admin/reset-password') ||
    pathname.startsWith('/admin/mfa')
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    return NextResponse.redirect(loginUrl)
  }

  // Allow-list enforcement: solo emails autorizados (defensa contra signups o usuarios huérfanos)
  if (!isAdminEmail(data.user.email)) {
    // Logout y redirect — la sesión es válida pero el email NO está en la allow-list
    await supabase.auth.signOut()
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    loginUrl.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(loginUrl)
  }

  // MFA enforcement: check assurance level
  // FP18 fix: chequear error explícito. Si MFA endpoint falla, denegar acceso
  // (fail-closed) en vez de continuar con aal=null y arriesgar redirect-loop.
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError) {
    console.error('[middleware] MFA getAuthenticatorAssuranceLevel error:', aalError.message, {
      user: data.user.email,
    })
    // Fail-closed: redirigir a login con error genérico (NO revelar detalle)
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    loginUrl.searchParams.set('error', 'mfa_check_failed')
    return NextResponse.redirect(loginUrl)
  }
  if (!aal) {
    // Caso atípico: sin error pero sin data. Fail-closed igual.
    console.warn('[middleware] MFA aal data is null without error, fail-closed', { user: data.user.email })
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    loginUrl.searchParams.set('error', 'mfa_check_failed')
    return NextResponse.redirect(loginUrl)
  }
  if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    // User has MFA enrolled but hasn't verified it this session
    const mfaUrl = request.nextUrl.clone()
    mfaUrl.pathname = '/admin/mfa'
    return NextResponse.redirect(mfaUrl)
  }
  if (aal.nextLevel !== 'aal2') {
    // User has no MFA factor enrolled yet — force setup
    const setupUrl = request.nextUrl.clone()
    setupUrl.pathname = '/admin/mfa/setup'
    return NextResponse.redirect(setupUrl)
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
