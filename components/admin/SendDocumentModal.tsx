'use client'

import { useState } from 'react'

interface SendDocumentModalProps {
  docType: 'quote' | 'invoice' | 'certification'
  docId: string
  docNumber: string
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
  portalUrl?: string | null   // for quotes/certifications
  sentAt?: string | null      // if already sent before
  sentChannel?: string | null
  onClose: () => void
  onSent: (sentAt: string, channel: string) => void
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const DOC_LABELS: Record<string, string> = {
  quote: 'Presupuesto',
  invoice: 'Factura',
  certification: 'Certificación',
}

export default function SendDocumentModal({
  docType, docId, docNumber, clientName, clientEmail, clientPhone,
  portalUrl, sentAt, sentChannel, onClose, onSent,
}: SendDocumentModalProps) {
  const [email, setEmail] = useState(clientEmail ?? '')
  const [phone, setPhone] = useState(clientPhone ?? '')
  const [sending, setSending] = useState(false)
  const [localSentAt, setLocalSentAt] = useState(sentAt ?? null)
  const [localSentChannel, setLocalSentChannel] = useState(sentChannel ?? null)

  const docLabel = DOC_LABELS[docType] ?? 'Documento'
  const greeting = clientName ? `Estimado/a ${clientName},` : 'Estimado/a cliente,'

  const emailSubject = `${docLabel} ${docNumber} — Cathedral Group`
  const emailBody = portalUrl
    ? `${greeting}\n\nLe enviamos el ${docLabel.toLowerCase()} ${docNumber}.\n\nPuede consultarlo y descargarlo en cualquier momento desde su área de cliente:\n${portalUrl}\n\nQuedamos a su disposición para cualquier consulta.\n\nUn saludo,\nCathedral Group\nTel: +34 91 000 0000\nadministracion@cathedralgroup.es`
    : `${greeting}\n\nLe enviamos adjunto el ${docLabel.toLowerCase()} ${docNumber}.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn saludo,\nCathedral Group\nTel: +34 91 000 0000\nadministracion@cathedralgroup.es`

  const waMessage = portalUrl
    ? `${greeting} Le enviamos el ${docLabel.toLowerCase()} ${docNumber}. Puede consultarlo aquí: ${portalUrl}\n\nCualquier consulta, estamos a su disposición.\nCathedral Group`
    : `${greeting} Le enviamos el ${docLabel.toLowerCase()} ${docNumber}.\n\nCualquier consulta, estamos a su disposición.\nCathedral Group`

  const mailtoHref = `mailto:${encodeURIComponent(email)}?cc=${encodeURIComponent('administracion@cathedralgroup.es')}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
  const rawPhone = phone.replace(/\s+/g, '').replace(/^00/, '+').replace(/^\+34/, '34').replace(/^\+/, '')
  const waHref = `https://wa.me/${rawPhone}?text=${encodeURIComponent(waMessage)}`

  async function markSent(channel: 'email' | 'whatsapp') {
    setSending(true)
    try {
      const now = new Date().toISOString()
      const res = await fetch('/api/db/' + (docType === 'invoice' ? 'invoices' : 'quotes'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docId,
          sent_at: now,
          sent_channel: channel,
          ...(docType === 'quote' ? { status: 'enviado' } : {}),
        }),
      })
      if (res.ok) {
        setLocalSentAt(now)
        setLocalSentChannel(channel)
        onSent(now, channel)
      }
    } catch (e) {
      console.error('mark-sent error:', e)
    } finally {
      setSending(false)
    }
  }

  function openEmail() {
    window.open(mailtoHref, '_blank')
    markSent('email')
  }

  function openWhatsApp() {
    if (!rawPhone) { alert('Introduce el teléfono del cliente'); return }
    window.open(waHref, '_blank')
    markSent('whatsapp')
  }

  const channelLabel = localSentChannel === 'email' ? 'email' : localSentChannel === 'whatsapp' ? 'WhatsApp' : ''

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md shadow-xl max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Enviar documento</p>
            <p className="text-sm font-semibold text-neutral-800">{docLabel} {docNumber}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Already sent banner */}
          {localSentAt && (
            <div className="bg-green-50 border border-green-200 px-4 py-3 flex items-start gap-3">
              <span className="text-green-600 text-sm mt-0.5">✓</span>
              <div>
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Enviado por {channelLabel}</p>
                <p className="text-xs text-green-600 mt-0.5">{fmtDateTime(localSentAt)}</p>
              </div>
            </div>
          )}

          {/* Email field */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5">
              Email del cliente
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@ejemplo.com"
              className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
            />
          </div>

          {/* Phone field */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5">
              Teléfono (WhatsApp)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
              className="w-full bg-neutral-50 border-0 focus:ring-1 focus:ring-primary p-3 text-sm"
            />
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            <button
              onClick={openEmail}
              disabled={!email || sending}
              className="w-full bg-neutral-900 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span>✉</span> Abrir en email
            </button>
            <button
              onClick={openWhatsApp}
              disabled={!phone || sending}
              className="w-full bg-[#25D366] text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#1ebe5d] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span>💬</span> Abrir en WhatsApp
            </button>
          </div>

          {/* Manual mark sent */}
          {!localSentAt && (
            <div className="pt-1 border-t border-neutral-100">
              <p className="text-[10px] text-neutral-400 mb-2">¿Ya lo enviaste manualmente?</p>
              <div className="flex gap-2">
                <button onClick={() => markSent('email')} disabled={sending} className="flex-1 border border-neutral-200 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors">
                  Marcar enviado (email)
                </button>
                <button onClick={() => markSent('whatsapp')} disabled={sending} className="flex-1 border border-neutral-200 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors">
                  Marcar enviado (WA)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
