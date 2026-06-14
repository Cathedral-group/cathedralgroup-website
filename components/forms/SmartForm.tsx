'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useT } from '@/lib/translations'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

// Las etiquetas de tipo y presupuesto se traducen en cliente (claves form.*).
// Los nombres de zona son topónimos (no se traducen); solo "Otra zona" sí.
const PROJECT_TYPES = [
  { value: 'reforma', labelKey: 'typeReforma' },
  { value: 'interiorismo', labelKey: 'typeInteriorismo' },
  { value: 'cambio-uso', labelKey: 'typeCambioUso' },
  { value: 'obra-nueva', labelKey: 'typeObraNueva' },
  { value: 'promocion', labelKey: 'typePromocion' },
  { value: 'otro', labelKey: 'typeOtro' },
]

const ZONES = [
  'Salamanca', 'Chamberí', 'Chamartín', 'Retiro',
  'El Viso', 'Pozuelo de Alarcón', 'La Moraleja',
  'Aravaca', 'Puerta de Hierro', 'Las Rozas', 'Majadahonda',
]

const BUDGET_RANGES = [
  { value: '<50k', labelKey: 'budgetLt50' },
  { value: '50k-100k', labelKey: 'budget50100' },
  { value: '100k-200k', labelKey: 'budget100200' },
  { value: '200k-500k', labelKey: 'budget200500' },
  { value: '500k-1m', labelKey: 'budget5001m' },
  { value: '>1m', labelKey: 'budgetGt1m' },
]

interface SmartFormProps {
  defaultProjectType?: string
  defaultZone?: string
  compact?: boolean
  source?: string
}

export default function SmartForm({
  defaultProjectType = '',
  defaultZone = '',
  compact = false,
  source = 'homepage',
}: SmartFormProps) {
  const t = useT('form')
  const [step, setStep] = useState(1)
  const totalSteps = 5

  const [formData, setFormData] = useState({
    tipo_proyecto: defaultProjectType,
    zona: defaultZone,
    metros_cuadrados: '',
    presupuesto_rango: '',
    nombre: '',
    email: '',
    telefono_prefijo: '+34',
    telefono: '',
    mensaje: '',
    empresa_web: '', // honeypot
  })

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileRendered, setTurnstileRendered] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)

  // Load Turnstile script once
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    if (document.querySelector('script[src*="turnstile"]')) return
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }, [])

  // Render Turnstile widget when on the contact step (last step)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || step !== 5 || turnstileRendered) return

    const interval = setInterval(() => {
      const w = window as any
      if (w.turnstile && turnstileRef.current) {
        w.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          theme: 'light',
          size: 'flexible',
        })
        setTurnstileRendered(true)
        clearInterval(interval)
      }
    }, 300)

    return () => clearInterval(interval)
  }, [step, turnstileRendered])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const nextStep = () => setStep((s) => Math.min(s + 1, totalSteps))
  const prevStep = () => setStep((s) => Math.max(s - 1, 1))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          telefono: formData.telefono ? `${formData.telefono_prefijo}${formData.telefono.replace(/\s/g, '')}` : '',
          source_page: source,
          'cf-turnstile-response': turnstileToken,
        }),
      })

      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Error al enviar')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-6 border-2 border-primary flex items-center justify-center">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-medium uppercase tracking-wide mb-3">{t('successTitle')}</h3>
        <p className="text-neutral-500 text-sm leading-relaxed">
          {t('successText')}
        </p>
      </div>
    )
  }

  const inputClass = 'w-full bg-white border border-neutral-300 focus:border-primary focus:ring-1 focus:ring-primary p-4 text-sm text-neutral-900 placeholder:text-neutral-400'
  const labelClass = 'text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2'

  return (
    <div>
      {/* Progress bars (estilo calculadora: lineas a ancho completo, no cuadrados) */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: totalSteps }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setStep(i + 1)}
            className={`h-1 flex-1 transition-all duration-500 ${
              i < step ? 'bg-primary' : 'bg-white'
            }`}
          />
        ))}
      </div>

      {/* Step labels */}
      <div className="flex justify-between gap-2 mb-10">
        {[t('step1'), t('step2'), t('step3'), t('step4'), t('step5')].map((label, i) => (
          <span
            key={i}
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${
              i + 1 === step ? 'text-primary' : 'text-neutral-400'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Honeypot */}
        <input
          type="text"
          name="empresa_web"
          value={formData.empresa_web}
          onChange={handleChange}
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
        />

        {/* Step 1: Project Type — selección: auto-avanza al pulsar, sin botones de navegación */}
        <div className={step === 1 ? 'block' : 'hidden'}>
          <h4 className="text-lg font-medium mb-6">{t('projectType')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {PROJECT_TYPES.map(({ value, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, tipo_proyecto: value }))
                  nextStep()
                }}
                className={`p-4 text-base text-left border transition-all duration-500 hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] ${
                  formData.tipo_proyecto === value
                    ? 'border-primary bg-white font-medium'
                    : 'border-neutral-300 bg-white'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Zone — selección a ancho completo (3 col), cada zona auto-avanza; nav solo Anterior */}
        <div className={step === 2 ? 'block' : 'hidden'}>
          <h4 className="text-lg font-medium mb-6">{t('zone')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ZONES.map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, zona: zone }))
                  nextStep()
                }}
                className={`p-4 text-sm text-left border transition-all duration-500 hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] ${
                  formData.zona === zone ? 'border-primary bg-white font-medium' : 'border-neutral-300 bg-white'
                }`}
              >
                {zone}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setFormData((prev) => ({ ...prev, zona: 'Otra zona' }))
                nextStep()
              }}
              className={`p-4 text-sm text-left border transition-all duration-500 hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] ${
                formData.zona === 'Otra zona' ? 'border-primary bg-white font-medium' : 'border-neutral-300 bg-white'
              }`}
            >
              {t('zoneOther')}
            </button>
          </div>

          <div className="mt-8">
            <button type="button" onClick={prevStep} className="px-6 py-3 text-sm font-medium uppercase tracking-widest border border-neutral-400 text-neutral-700 hover:border-primary hover:text-primary transition-colors">
              {t('prev')}
            </button>
          </div>
        </div>

        {/* Step 3: m² — slider tipo calculadora (ruleta/linea), sin entrada manual */}
        <div className={step === 3 ? 'block max-w-2xl mx-auto' : 'hidden'}>
          <h4 className="text-lg font-medium mb-6">{t('sqm')}</h4>
          <div className="bg-white border border-neutral-200 p-8">
            <div className="flex items-end gap-4 mb-8">
              <span className="text-4xl font-light text-neutral-800">{formData.metros_cuadrados || 120}</span>
              <span className="text-sm text-neutral-400 pb-2">m²</span>
            </div>
            <input
              type="range"
              min={30}
              max={1000}
              step={1}
              value={Number(formData.metros_cuadrados) || 120}
              onChange={(e) => setFormData((prev) => ({ ...prev, metros_cuadrados: e.target.value }))}
              aria-label={t('sqm')}
              className="w-full h-1 bg-neutral-200 appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(180,168,152,0.2)]
                [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-primary
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />
            <div className="flex justify-between text-xs text-neutral-400 mt-2">
              <span>30 m²</span>
              <span>1.000 m²</span>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button type="button" onClick={prevStep} className="px-6 py-3 text-sm font-medium uppercase tracking-widest border border-neutral-400 text-neutral-700 hover:border-primary hover:text-primary transition-colors">
              {t('prev')}
            </button>
            <button type="button" onClick={nextStep} className="flex-1 py-3 text-sm font-medium uppercase tracking-widest bg-[#5A5550] text-white hover:bg-primary transition-colors">
              {t('next')}
            </button>
          </div>
        </div>

        {/* Step 4: Budget — selección a ancho completo (3 col), auto-avanza; nav solo Anterior */}
        <div className={step === 4 ? 'block' : 'hidden'}>
          <h4 className="text-lg font-medium mb-6">{t('budget')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {BUDGET_RANGES.map(({ value, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, presupuesto_rango: value }))
                  nextStep()
                }}
                className={`p-4 text-base text-left border transition-all duration-500 hover:bg-[#5A5550] hover:text-white hover:border-[#5A5550] ${
                  formData.presupuesto_rango === value
                    ? 'border-primary bg-white font-medium'
                    : 'border-neutral-300 bg-white'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className="mt-8">
            <button type="button" onClick={prevStep} className="px-6 py-3 text-sm font-medium uppercase tracking-widest border border-neutral-400 text-neutral-700 hover:border-primary hover:text-primary transition-colors">
              {t('prev')}
            </button>
          </div>
        </div>

        {/* Step 5: Contact Info */}
        <div className={step === 5 ? 'block max-w-3xl mx-auto' : 'hidden'}>
          <h4 className="text-lg font-medium mb-6">{t('contactDetails')}</h4>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('name')}</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                  placeholder={t('namePlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('phone')}</label>
                <div className="flex">
                  <select
                    name="telefono_prefijo"
                    value={formData.telefono_prefijo}
                    onChange={handleChange}
                    className="bg-white border border-neutral-300 border-r-0 focus:border-primary focus:ring-1 focus:ring-primary p-4 text-sm text-neutral-900 w-24 flex-shrink-0"
                  >
                    <option value="+34">+34</option>
                    <option value="+1">+1</option>
                    <option value="+44">+44</option>
                    <option value="+33">+33</option>
                    <option value="+49">+49</option>
                    <option value="+39">+39</option>
                    <option value="+351">+351</option>
                    <option value="+41">+41</option>
                    <option value="+52">+52</option>
                    <option value="+54">+54</option>
                    <option value="+55">+55</option>
                    <option value="+57">+57</option>
                    <option value="+56">+56</option>
                    <option value="+971">+971</option>
                  </select>
                  <input
                    type="tel"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    placeholder="600000000"
                    className="w-full bg-white border border-neutral-300 focus:border-primary focus:ring-1 focus:ring-primary p-4 text-sm text-neutral-900 placeholder:text-neutral-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('email')}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="javier@ejemplo.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('message')}</label>
              <textarea
                name="mensaje"
                value={formData.mensaje}
                onChange={handleChange}
                rows={3}
                placeholder={t('messagePlaceholder')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Cloudflare Turnstile */}
          {TURNSTILE_SITE_KEY && (
            <div ref={turnstileRef} className="mt-6 flex justify-center" />
          )}

          {error && <p className="text-red-600 text-sm text-center mt-4">{error}</p>}

          <div className="flex gap-4 mt-8">
            <button type="button" onClick={prevStep} className="px-6 py-3 text-sm font-medium uppercase tracking-widest border border-neutral-400 text-neutral-700 hover:border-primary hover:text-primary transition-colors">
              {t('prev')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 text-sm font-medium uppercase tracking-widest bg-[#5A5550] text-white hover:bg-primary transition-colors disabled:opacity-50"
            >
              {submitting ? t('sending') : t('submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
