'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function MFAVerifyPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.[0]
      if (totp) setFactorId(totp.id)
      else router.push('/admin/mfa/setup')
    })
    inputRef.current?.focus()
  }, [router])

  const handleVerify = async (e: React.FormEvent) => {
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
      setError('Código incorrecto. Comprueba tu aplicación de autenticación.')
      setCode('')
      inputRef.current?.focus()
      setLoading(false)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full bg-white p-8 shadow-sm max-w-sm mx-auto mt-20">
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-medium uppercase tracking-wide mb-2">Verificación</h1>
          <p className="text-sm text-neutral-500">Introduce el código de 6 dígitos de tu aplicación de autenticación</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
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

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-[#5A5550] text-white py-3 font-bold uppercase tracking-widest hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '...' : 'Verificar'}
          </button>
        </form>

        <p className="text-[10px] text-neutral-300 text-center mt-8">
          Abre Google Authenticator o similar y busca Cathedral Group
        </p>
      </div>
    </div>
  )
}
