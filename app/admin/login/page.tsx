'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Script from 'next/script'

const TURNSTILE_SITE_KEY = '0x4AAAAAACoXVuKbf-SK4IC1'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
    }
  }
}

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 min lockout

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [showReset, setShowReset] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReady, setTurnstileReady] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Check if already authenticated
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.push('/admin')
    })
  }, [router])

  // Restore lockout from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('login_lockout')
    if (stored) {
      const until = parseInt(stored, 10)
      if (until > Date.now()) {
        setLockedUntil(until)
        setAttempts(MAX_ATTEMPTS)
      } else {
        sessionStorage.removeItem('login_lockout')
      }
    }
  }, [])

  // Countdown timer
  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        setLockedUntil(null)
        setAttempts(0)
        sessionStorage.removeItem('login_lockout')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  // Render Turnstile widget once script is loaded
  useEffect(() => {
    if (!turnstileReady || !turnstileRef.current || showReset) return
    if (widgetIdRef.current) return
    widgetIdRef.current = window.turnstile!.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'light',
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => setTurnstileToken(null),
    })
  }, [turnstileReady, showReset])

  // Reset widget when switching back to login form
  useEffect(() => {
    if (!showReset && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
      setTurnstileToken(null)
    }
  }, [showReset])

  const isLocked = lockedUntil !== null && lockedUntil > Date.now()

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (isLocked) return

    if (!turnstileToken) {
      setError('Completa la verificación de seguridad.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    // Validate Turnstile server-side before attempting auth
    const verifyRes = await fetch('/api/auth/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: turnstileToken }),
    })
    if (!verifyRes.ok) {
      setError('Verificación de seguridad fallida. Inténtalo de nuevo.')
      setTurnstileToken(null)
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current)
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setTurnstileToken(null)
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current)

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS
        setLockedUntil(until)
        sessionStorage.setItem('login_lockout', until.toString())
        setError(`Demasiados intentos. Bloqueado ${Math.ceil(LOCKOUT_MS / 60000)} minutos.`)
      } else {
        setError(`Credenciales incorrectas (${MAX_ATTEMPTS - newAttempts} intentos restantes)`)
      }
      setLoading(false)
      return
    }

    // Success
    setAttempts(0)
    sessionStorage.removeItem('login_lockout')
    router.push('/admin')
    router.refresh()
  }

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Introduce tu email para recuperar la contraseña.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/admin/reset-password` }
    )

    if (resetError) {
      setError('Error al enviar el email. Inténtalo de nuevo.')
    } else {
      setSuccess('Te hemos enviado un email con instrucciones para restablecer tu contraseña.')
    }
    setLoading(false)
  }

  return (
    <>
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      onReady={() => setTurnstileReady(true)}
    />
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full bg-white p-8 shadow-sm max-w-sm mx-auto mt-20">
        <div className="text-center mb-10">
          <h1 className="text-xl font-medium uppercase tracking-wide mb-2">Admin</h1>
          <p className="text-sm text-neutral-500">Cathedral Group</p>
        </div>

        {!showReset ? (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLocked}
                  autoComplete="email"
                  className="w-full bg-neutral-50 border border-neutral-200 text-neutral-900 focus:ring-1 focus:ring-primary p-4 text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLocked}
                  autoComplete="current-password"
                  className="w-full bg-neutral-50 border border-neutral-200 text-neutral-900 focus:ring-1 focus:ring-primary p-4 text-sm disabled:opacity-50"
                />
              </div>

              {/* Cloudflare Turnstile — bot protection */}
              {!isLocked && (
                <div ref={turnstileRef} className="flex justify-center" />
              )}

              {error && <p className="text-red-600 text-sm text-center">{error}</p>}
              {isLocked && countdown > 0 && (
                <p className="text-neutral-500 text-xs text-center">
                  Desbloqueado en {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || isLocked || !turnstileToken}
                className="w-full bg-[#5A5550] text-white py-3 font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLocked ? 'Bloqueado' : loading ? '...' : 'Acceder'}
              </button>
            </form>

            <button
              onClick={() => { setShowReset(true); setError(''); setSuccess('') }}
              className="w-full text-center mt-4 text-xs text-primary hover:underline transition-colors"
            >
              ¿Has olvidado tu contraseña?
            </button>
          </>
        ) : (
          <>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-sm text-neutral-600 text-center mb-2">
                Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
              </p>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full bg-neutral-50 border border-neutral-200 text-neutral-900 focus:ring-1 focus:ring-primary p-4 text-sm"
                />
              </div>

              {error && <p className="text-red-600 text-sm text-center">{error}</p>}
              {success && <p className="text-green-600 text-sm text-center">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#5A5550] text-white py-3 font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'Enviar enlace'}
              </button>
            </form>

            <button
              onClick={() => { setShowReset(false); setError(''); setSuccess('') }}
              className="w-full text-center mt-4 text-xs text-primary hover:underline transition-colors"
            >
              ← Volver al login
            </button>
          </>
        )}

        <p className="text-[10px] text-neutral-300 text-center mt-8">
          Acceso restringido a personal autorizado
        </p>
      </div>
    </div>
    </>
  )
}
