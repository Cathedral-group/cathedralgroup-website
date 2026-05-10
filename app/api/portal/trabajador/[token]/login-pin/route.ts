/**
 * POST /api/portal/trabajador/[token]/login-pin
 *
 * Body: { pin: string (4-6 dígitos) }
 *
 * Verifica el PIN del trabajador y, si es correcto, set cookie httpOnly
 * 'cathedral_worker_session' con el token (validez 90 días).
 *
 * Tras login, las próximas veces el portal lee la cookie y omite la pantalla PIN.
 *
 * Aislamiento: NO usa Supabase Auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const SESSION_COOKIE_NAME = 'cathedral_worker_session'
const SESSION_DAYS = 90

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  let body: { pin?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.pin || !/^[0-9]{4,6}$/.test(body.pin)) {
    return NextResponse.json({ error: 'PIN debe ser 4-6 dígitos' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const { data: result, error } = await supabase.rpc('validate_worker_pin', {
    p_token: token,
    p_pin: body.pin,
    p_ip: ip,
  })

  if (error) {
    return NextResponse.json({ error: 'Error verificando PIN' }, { status: 500 })
  }

  if (!result?.ok) {
    if (result?.reason === 'locked') {
      return NextResponse.json(
        {
          error: 'Demasiados intentos fallidos. Bloqueado 15 minutos.',
          locked_until: result.locked_until,
        },
        { status: 429 },
      )
    }
    return NextResponse.json(
      {
        error: 'PIN incorrecto',
        attempts_left: result?.attempts_left ?? null,
      },
      { status: 401 },
    )
  }

  // PIN correcto: set cookie de sesión
  const response = NextResponse.json({
    ok: true,
    pin_is_default: result.pin_is_default ?? false,
  })

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: `/portal/trabajador/${token}`,
  })

  return response
}

export const dynamic = 'force-dynamic'
