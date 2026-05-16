import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  let token: string | undefined
  try {
    const body = await request.json()
    token = body.token
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
  }
  if (!token) return NextResponse.json({ success: false, error: 'Token requerido' }, { status: 400 })

  let res: Response
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
      // Audit 16/05: timeout defensive — Cloudflare API normalmente <500ms,
      // 10s margen amplio. Sin timeout, hang indefinido bloquearía form submit.
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error'
    console.error('[verify-turnstile] Cloudflare API fetch failed:', msg)
    return NextResponse.json({ success: false, error: 'Servicio CAPTCHA no disponible' }, { status: 502 })
  }

  // Audit 16/05: validar HTTP status + JSON parse antes de leer .success.
  // Sin esto, Cloudflare 5xx + body HTML crashea res.json() → 500 al cliente.
  if (!res.ok) {
    console.error('[verify-turnstile] Cloudflare HTTP', res.status)
    return NextResponse.json({ success: false, error: 'Servicio CAPTCHA degradado' }, { status: 502 })
  }

  let data: { success?: boolean } = {}
  try {
    data = await res.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Respuesta CAPTCHA malformada' }, { status: 502 })
  }

  if (data.success === true) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ success: false, error: 'Verificación fallida' }, { status: 403 })
}
