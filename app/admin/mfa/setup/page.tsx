'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function MFASetupPage() {
  const router = useRouter()
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/admin/login'); return }

      // Check if already enrolled
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (factors?.totp?.length) {
        // Already enrolled but session not verified — go to verify
        router.push('/admin/mfa')
        return
      }

      // Enroll new TOTP factor
      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Cathedral Group Admin',
        friendlyName: data.user.email ?? 'usuario',
      })
      if (enrollError || !enrollData) {
        setError('Error al generar el código QR. Recarga la página.')
        setEnrolling(false)
        return
      }
      setFactorId(enrollData.id)
      setQrCode(enrollData.totp.qr_code)
      setSecret(enrollData.totp.secret)
      setEnrolling(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    })
  }, [router])

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId || code.length !== 6) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    })
    if (verifyError) {
      setError('Código incorrecto. Asegúrate de haber escaneado el QR y espera el siguiente código.')
      setCode('')
      inputRef.current?.focus()
      setLoading(false)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  if (enrolling) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <p className="text-sm text-neutral-400">Preparando configuración...</p>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full bg-white p-8 shadow-sm max-w-sm mx-auto mt-10">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-medium uppercase tracking-wide mb-2">Verificación en 2 pasos</h1>
          <p className="text-sm text-neutral-500">
            Configura tu aplicación de autenticación para mayor seguridad. Solo tienes que hacerlo una vez.
          </p>
        </div>

        <ol className="space-y-4 text-sm text-neutral-600 mb-6">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center justify-center">1</span>
            <span>Instala <strong>Google Authenticator</strong> o <strong>Authy</strong> en tu móvil si no lo tienes.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center justify-center">2</span>
            <span>Escanea el código QR con la aplicación.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center justify-center">3</span>
            <span>Introduce el código de 6 dígitos que aparece en la app.</span>
          </li>
        </ol>

        {qrCode && (
          <div className="flex justify-center mb-4">
            <div className="p-3 border border-neutral-200 rounded-lg bg-white inline-block">
              <img src={qrCode} alt="QR Code MFA" className="w-44 h-44" />
            </div>
          </div>
        )}

        {secret && (
          <details className="mb-4">
            <summary className="text-[10px] text-neutral-400 cursor-pointer text-center hover:text-neutral-600">
              No puedo escanear el QR — introducir clave manual
            </summary>
            <p className="mt-2 text-center font-mono text-xs bg-neutral-50 border border-neutral-200 rounded p-2 break-all select-all">
              {secret}
            </p>
          </details>
        )}

        <form onSubmit={handleConfirm} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoComplete="one-time-code"
            className="w-full bg-neutral-50 border border-neutral-200 text-neutral-900 focus:ring-1 focus:ring-primary p-4 text-center text-2xl tracking-[0.5em] font-mono"
          />

          {error && <p className="text-red-600 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-[#5A5550] text-white py-3 font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '...' : 'Activar verificación en 2 pasos'}
          </button>
        </form>

        <p className="text-[10px] text-neutral-300 text-center mt-6">
          A partir de ahora necesitarás el código en cada acceso
        </p>
      </div>
    </div>
  )
}
