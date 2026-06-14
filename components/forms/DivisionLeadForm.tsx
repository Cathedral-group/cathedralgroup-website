'use client'

import { useState } from 'react'
import { useT } from '@/lib/translations'

// Formulario de captación para las landings de división. Clon ligero del de la
// calculadora: pide datos mínimos y un mensaje opcional, y genera el campo
// `mensaje` (requerido por /api/contact) a partir del contexto si se deja vacío.
export default function DivisionLeadForm({
  source,
  division,
}: {
  source: string
  division: string
}) {
  const t = useT('division')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [empresaWeb, setEmpresaWeb] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          email,
          telefono: telefono.replace(/\s/g, ''),
          // mensaje es obligatorio en la API: si el usuario no escribe, generamos contexto
          mensaje: mensaje.trim() || `Interés en ${division}`,
          empresa_web: empresaWeb,
          source_page: source,
        }),
      })
      setStatus(res.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'ok') {
    return (
      <div className="border border-primary/30 bg-beige-subtle p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 mx-auto mb-4 border-2 border-primary flex items-center justify-center">
          <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-light uppercase tracking-wide text-neutral-800 mb-2">
          {t('successTitle')}
        </h3>
        <p className="text-sm text-neutral-600">{t('successText')}</p>
      </div>
    )
  }

  const inputClass =
    'w-full bg-white border border-neutral-300 focus:border-primary focus:ring-1 focus:ring-primary p-3.5 text-sm text-neutral-900 placeholder:text-neutral-400'

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-3">
      <input
        type="text"
        required
        minLength={2}
        maxLength={100}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder={t('name')}
        className={inputClass}
        autoComplete="name"
      />
      <input
        type="email"
        required
        maxLength={200}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('email')}
        className={inputClass}
        autoComplete="email"
      />
      <input
        type="tel"
        maxLength={20}
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder={t('phone')}
        className={inputClass}
        autoComplete="tel"
      />
      <textarea
        rows={3}
        maxLength={2000}
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        placeholder={t('message')}
        className={inputClass}
      />
      {/* Honeypot anti-spam: oculto para humanos */}
      <input
        type="text"
        name="empresa_web"
        value={empresaWeb}
        onChange={(e) => setEmpresaWeb(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      {status === 'error' && (
        <p className="text-xs text-red-600 text-center" role="alert">
          {t('error')}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full px-10 py-3.5 border border-neutral-800 text-neutral-800 text-xs font-bold uppercase tracking-[0.15em] hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] transition-all duration-500 disabled:opacity-50 disabled:cursor-wait"
      >
        {status === 'sending' ? t('sending') : t('submit')}
      </button>
    </form>
  )
}
