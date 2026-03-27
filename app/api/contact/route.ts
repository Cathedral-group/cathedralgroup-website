import { NextResponse } from 'next/server'

// Rate limiting — in-memory store (resets on deploy, good enough for Vercel serverless)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 5 // max requests
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) return true
  return false
}

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
    // Rate limiting by IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Inténtelo de nuevo más tarde.' },
        { status: 429 }
      )
    }

    const body = await request.json()

    const {
      nombre,
      email,
      telefono,
      tipo_proyecto,
      zona,
      metros_cuadrados,
      presupuesto_rango,
      mensaje,
      empresa_web,
      source_page,
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

    // Turnstile verification (non-blocking: validates if token present, allows if not)
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
    let turnstileValid = false

    if (turnstileSecret && turnstileToken) {
      try {
        const turnstileFormData = new URLSearchParams()
        turnstileFormData.append('secret', turnstileSecret)
        turnstileFormData.append('response', turnstileToken)
        if (clientIp !== 'unknown') turnstileFormData.append('remoteip', clientIp)

        const turnstileResponse = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: turnstileFormData.toString(),
          }
        )

        const turnstileResult = await turnstileResponse.json()
        if (turnstileResult.success) {
          turnstileValid = true
        } else {
          // Token present but invalid — likely a bot
          return NextResponse.json(
            { error: 'Validación anti-bot no superada' },
            { status: 400 }
          )
        }
      } catch {
        // Turnstile API error — allow submission (don't block real users)
        turnstileValid = false
      }
    }
    // If no token at all (widget didn't load), allow — other filters still protect

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
          phone: telefono ? String(telefono).trim() : null,
          tipo_proyecto: tipo_proyecto ? String(tipo_proyecto).trim() : null,
          mensaje: String(mensaje).trim(),
          origen: source_page || 'cathedralgroup.es',
          notes: [
            zona ? `Zona: ${zona}` : null,
            metros_cuadrados ? `m²: ${metros_cuadrados}` : null,
            presupuesto_rango ? `Presupuesto: ${presupuesto_rango}` : null,
          ].filter(Boolean).join(' | ') || null,
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
