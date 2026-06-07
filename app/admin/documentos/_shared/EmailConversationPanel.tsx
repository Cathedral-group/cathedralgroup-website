'use client'

/**
 * Panel "Email / conversación de origen" de un documento.
 * Lee /api/admin/email-message?table=&id= (service_role tras auth admin) y muestra
 * remitente / asunto / cuerpo del email con el que llegó el documento.
 * Se auto-oculta si el documento no vino por email (email: null).
 *
 * Sesión 07/06/2026 — Fase 3 de "retener la conversación del email".
 */
import { useEffect, useState } from 'react'

type EmailMsg = {
  from_address: string | null
  from_original: string | null
  subject: string | null
  body: string | null
  received_at: string | null
  gmail_account: string | null
}

export default function EmailConversationPanel({
  table,
  id,
}: {
  table: string
  id: string
}) {
  const [email, setEmail] = useState<EmailMsg | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(
      `/api/admin/email-message?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`
    )
      .then((r) => (r.ok ? r.json() : { email: null }))
      .then((j) => {
        if (alive) setEmail((j?.email as EmailMsg | null) ?? null)
      })
      .catch(() => {
        if (alive) setEmail(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [table, id])

  // Nada que mostrar (cargando, sin email, o documento no llegó por correo).
  if (loading || !email) return null
  const hasContent =
    email.from_address || email.subject || email.body || email.received_at
  if (!hasContent) return null

  const fecha = email.received_at
    ? new Date(email.received_at).toLocaleString('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null
  const remitente =
    email.from_original && email.from_original !== email.from_address
      ? `${email.from_original} (reenviado vía ${email.from_address})`
      : email.from_address

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
        Email / conversación de origen
      </div>
      <div className="space-y-1.5 px-3 py-2.5 text-sm">
        {remitente && (
          <p>
            <span className="text-neutral-500">De:</span> {remitente}
          </p>
        )}
        {email.subject && (
          <p>
            <span className="text-neutral-500">Asunto:</span> {email.subject}
          </p>
        )}
        {fecha && <p className="text-xs text-neutral-500">{fecha}</p>}
        {email.body && (
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-sans text-xs text-neutral-700">
            {email.body}
          </pre>
        )}
      </div>
    </div>
  )
}
