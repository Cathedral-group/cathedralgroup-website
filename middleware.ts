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
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal) {
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
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
