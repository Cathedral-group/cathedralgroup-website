'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [linkError, setLinkError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    // Listener sincrónico (race-safe): el evento de recovery puede dispararse durante el init
    // del cliente; suscribirse aquí (no dentro de un .then) garantiza no perderlo.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (
        event === 'PASSWORD_RECOVERY' ||
        ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session)
      ) {
        setReady(true)
      }
    })

    ;(async () => {
      // ¿Sesión ya activa?
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { if (mounted) setReady(true); return }

      // Tokens en el hash (#access_token=): el cliente es flowType:'pkce' (hardcoded en
      // @supabase/ssr) y NO consume el hash, así que lo procesamos a mano. setSession establece
      // la sesión de recovery que updateUser() necesita.
      const hp = new URLSearchParams(window.location.hash.substring(1))
      const access_token = hp.get('access_token')
      const refresh_token = hp.get('refresh_token')
      if (access_token && refresh_token) {
        const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token })
        if (!mounted) return
        if (sErr) {
          setLinkError(true)
        } else {
          // Limpiar el token de la barra de direcciones por seguridad.
          window.history.replaceState(null, '', window.location.pathname)
          setReady(true)
        }
        return
      }

      // Fallback PKCE (?code=) por si resetPasswordForEmail usa ese flujo en el futuro.
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error: cErr } = await supabase.auth.exchangeCodeForSession(code)
        if (!mounted) return
        if (cErr) setLinkError(true)
        else setReady(true)
        return
      }

      // Sin token ni sesión → enlace ausente/inválido.
      if (mounted) setLinkError(true)
    })()

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 9) {
      setError('La contraseña debe tener al menos 9 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(`No se pudo actualizar la contraseña: ${updateError.message}. Si el enlace caducó, solicita uno nuevo.`)
      setLoading(false)
      return
    }

    // Tras cambiar la contraseña, invalidar TODAS las sesiones existentes (otros dispositivos,
    // sesiones del atacante si el enlace fue interceptado, etc.) y forzar re-login con la nueva.
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/admin/login?reset=success')
    router.refresh()
  }

  if (!ready) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-neutral-500 mb-4">
            {linkError ? 'El enlace ha caducado o no es válido.' : 'Verificando enlace...'}
          </p>
          <p className="text-xs text-neutral-400">
            {linkError ? 'Solicita uno nuevo desde el login.' : 'Si no funciona, solicita un nuevo enlace desde el login.'}
          </p>
          <a href="/admin/login" className="text-xs text-primary hover:underline mt-4 inline-block">
            Ir al login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full bg-white p-8 shadow-sm max-w-sm mx-auto mt-20">
        <div className="text-center mb-10">
          <h1 className="text-xl font-medium uppercase tracking-wide mb-2">Nueva contraseña</h1>
          <p className="text-sm text-neutral-500">Elige tu nueva contraseña</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={9}
              autoComplete="new-password"
              className="w-full bg-neutral-50 border border-neutral-200 text-neutral-900 focus:ring-1 focus:ring-primary p-4 text-sm"
              placeholder="Mínimo 9 caracteres"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full bg-neutral-50 border border-neutral-200 text-neutral-900 focus:ring-1 focus:ring-primary p-4 text-sm"
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5A5550] text-white py-3 font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
