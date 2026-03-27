import { NextResponse } from 'next/server'

const BLOCKED_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', '10minutemail.com',
  'temp-mail.org', 'tempmail.com', 'yopmail.com',
  'dispostable.com', 'sharklasers.com',
]

const SPAM_KEYWORDS = [
  'viagra', 'casino', 'crypto', 'bitcoin', 'forex',
  'seo expert', 'buy now', 'backlinks', 'loan',
  'porn', 'adult', 'betting',
]

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      nombre,
      email,
      tipo_proyecto,
      mensaje,
      empresa_web,
      'cf-turnstile-response': turnstileToken,
    } = body

    // Honeypot
    if (empresa_web && String(empresa_web).trim() !== '') {
      return NextResponse.json({ error: 'Formulario bloqueado' }, { status: 400 })
    }

    // Required fields
    if (!nombre || !email || !mensaje) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Email validation
    const emailNormalizado = String(email).trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(emailNormalizado)) {
      return NextResponse.json({ error: 'Email no válido' }, { status: 400 })
    }

    // Blocked domains
    const emailDomain = emailNormalizado.split('@')[1]
    if (BLOCKED_DOMAINS.includes(emailDomain)) {
      return NextResponse.json({ error: 'Email no permitido' }, { status: 400 })
    }

    // Spam filter
    const textoAnalisis = `${nombre} ${emailNormalizado} ${tipo_proyecto || ''} ${mensaje}`.toLowerCase()
    if (SPAM_KEYWORDS.some((word) => textoAnalisis.includes(word))) {
      return NextResponse.json({ error: 'Mensaje bloqueado por filtro anti-spam' }, { status: 400 })
    }

    // Turnstile verification
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
    if (!turnstileSecret) {
      return NextResponse.json({ error: 'Falta TURNSTILE_SECRET_KEY' }, { status: 500 })
    }

    if (!turnstileToken) {
      return NextResponse.json({ error: 'Falta validación Turnstile' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''

    const turnstileFormData = new URLSearchParams()
    turnstileFormData.append('secret', turnstileSecret)
    turnstileFormData.append('response', turnstileToken)
    if (ip) turnstileFormData.append('remoteip', ip)

    const turnstileResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: turnstileFormData.toString(),
      }
    )

    const turnstileResult = await turnstileResponse.json()
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: 'Validación anti-bot no superada', details: turnstileResult['error-codes'] || [] },
        { status: 400 }
      )
    }

    // Supabase insert
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Faltan variables Supabase' }, { status: 500 })
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify([
        {
          nombre: String(nombre).trim(),
          email: emailNormalizado,
          tipo_proyecto: tipo_proyecto ? String(tipo_proyecto).trim() : null,
          mensaje: String(mensaje).trim(),
          origen: 'cathedralgroup.es',
        },
      ]),
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: 'Supabase devolvió error', details: text }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Lead guardado correctamente' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    )
  }
}
