'use client'

import { useState, FormEvent } from 'react'
import { useTranslations } from 'next-intl'

const PROJECT_TYPES = [
  'Reforma de vivienda',
  'Reforma integral de piso',
  'Interiorismo residencial',
  'Arquitectura residencial',
  'Cambio de uso de local a vivienda',
  'Residencial de lujo',
  'Corporativo / Oficinas',
  'Comercial / Retail',
  'Restauración histórica',
]

export default function ContactForm() {
  const t = useTranslations('form')
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    tipo_proyecto: '',
    mensaje: '',
    empresa_web: '', // honeypot
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setSuccess(true)
        setFormData({ nombre: '', email: '', tipo_proyecto: '', mensaje: '', empresa_web: '' })
      } else {
        const data = await res.json()
        setError(data.error || 'Error al enviar el formulario')
      }
    } catch {
      setError('Error de conexión. Inténtelo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <section className="py-12 bg-beige-subtle" id="contacto">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h3 className="text-2xl font-medium uppercase tracking-wide mb-4">
            Solicitud Enviada
          </h3>
          <p className="text-neutral-600">
            Nuestro equipo se pondrá en contacto con usted en las próximas 24 horas.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="py-12 bg-beige-subtle" id="contacto">
      <div className="max-w-3xl mx-auto px-6" data-animate="fade-up">
        <div className="text-center mb-10">
          <h3 className="text-2xl font-medium uppercase tracking-wide mb-4">
            {t('title')}
          </h3>
          <p className="text-neutral-600">{t('subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Name + Email */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
                {t('name')}
              </label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required
                placeholder="Ej: Javier García"
                className="w-full bg-white border-0 focus:ring-1 focus:ring-primary p-4 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
                {t('email')}
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="javier@ejemplo.com"
                className="w-full bg-white border-0 focus:ring-1 focus:ring-primary p-4 text-sm"
              />
            </div>
          </div>

          {/* Project Type */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
              {t('projectType')}
            </label>
            <select
              name="tipo_proyecto"
              value={formData.tipo_proyecto}
              onChange={handleChange}
              className="w-full bg-white border-0 focus:ring-1 focus:ring-primary p-4 text-sm"
            >
              <option value="">{t('selectOption')}</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 block mb-2">
              {t('message')}
            </label>
            <textarea
              name="mensaje"
              value={formData.mensaje}
              onChange={handleChange}
              rows={4}
              placeholder="Describa brevemente su visión..."
              className="w-full bg-white border-0 focus:ring-1 focus:ring-primary p-4 text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-neutral-900 border border-neutral-200 py-5 text-sm font-medium uppercase tracking-widest hover:bg-primary hover:text-white transition-all duration-500 disabled:opacity-50"
          >
            {submitting ? '...' : t('submit')}
          </button>
        </form>
      </div>
    </section>
  )
}
