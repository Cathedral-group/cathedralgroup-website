/**
 * POST /api/portal/trabajador/[token]/change-pin
 *
 * Body: { pin_actual: string, pin_nuevo: string (4-6 dígitos, ≠ 0000) }
 *
 * Cambia el PIN del trabajador. Verifica el PIN actual + valida nuevo.
 * Tras éxito, marca pin_set_at = NOW() (deja de ser "default").
 *
 * Requiere PIN actual también si el actual es 0000 (consistencia).
 *
 * Aislamiento: NO usa Supabase Auth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { enforce, getClientIp } from '@/lib/rate-limit-portal'

const TOKEN_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  // Audit 16/05: regex UUID v4 estricto (era token.length < 30 que aceptaba
  // strings malformadas 30+ chars sin ser UUIDs reales).
  if (!token || !TOKEN_REGEX.test(token)) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // Audit 16/05: rate limit anti-brute force. Sin esto, attacker con PIN 0000
  // default conocido podía cambiarlo unlimited times. 5 cambios/min/IP+token
  // (uso normal cambio PIN es 1x/año por trabajador).
  const rl = enforce({
    category: 'change-pin',
    max: 5,
    windowMs: 60_000,
    key: `${getClientIp(request)}|${token.slice(0, 8)}`,
  })
  if (rl) return rl

  let body: { pin_actual?: string; pin_nuevo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!body.pin_actual || !body.pin_nuevo) {
    return NextResponse.json({ error: 'pin_actual y pin_nuevo requeridos' }, { status: 400 })
  }
  if (!/^[0-9]{4,6}$/.test(body.pin_nuevo)) {
    return NextResponse.json(
      { error: 'PIN nuevo debe ser 4-6 dígitos numéricos' },
      { status: 400 },
    )
  }
  if (body.pin_nuevo === '0000') {
    return NextResponse.json(
      { error: 'No puedes usar 0000 como PIN nuevo (es el default)' },
      { status: 400 },
    )
  }
  if (body.pin_nuevo === body.pin_actual) {
    return NextResponse.json(
      { error: 'El PIN nuevo debe ser distinto al actual' },
      { status: 400 },
    )
  }

  const supabase = createAdminSupabaseClient()
  const { data: result, error } = await supabase.rpc('change_worker_pin', {
    p_token: token,
    p_pin_actual: body.pin_actual,
    p_pin_nuevo: body.pin_nuevo,
  })

  if (error) {
    return NextResponse.json({ error: 'Error cambiando PIN' }, { status: 500 })
  }

  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.message ?? 'No se pudo cambiar el PIN' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
