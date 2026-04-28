/**
 * POST /api/audit/email-coverage/register
 *
 * Llamado por el workflow auxiliar n8n para registrar/actualizar un huérfano
 * detectado tras cruzar Gmail vs BD. Implementa la lógica de escalado:
 *
 *   - Primer intento: row nuevo con attempt_count=1, status='pending'
 *   - 2º intento sin éxito: attempt_count=2, status='persistent_orphan'
 *     (visible en /admin/revision como huérfano persistente)
 *   - 3º+ intento bloqueado: 409 (no más reintentos automáticos)
 *
 * Auth: header `Authorization: Bearer <AUDIT_CRON_SECRET>`.
 *
 * Body:
 *   {
 *     message_id: string         // Gmail messageId (UNIQUE)
 *     gmail_account: string      // ej "info@cathedralgroup.es"
 *     subject?: string
 *     from_address?: string
 *     received_at?: string       // ISO datetime
 *     last_error?: string        // motivo del último fallo (opcional)
 *   }
 *
 * Devuelve:
 *   {
 *     id: number,
 *     attempt_count: number,
 *     status: 'pending'|'reprocessed_ok'|'persistent_orphan'|'ignored',
 *     should_retry: boolean      // true si el cron debe inyectar el adjunto al webhook general
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 2

function authCronCheck(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const authHeader = request.headers.get('authorization') ?? ''
  return authHeader === `Bearer ${expected}`
}

interface Body {
  message_id?: string
  gmail_account?: string
  subject?: string
  from_address?: string
  received_at?: string
  last_error?: string
}

export async function POST(request: NextRequest) {
  if (!authCronCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.message_id || !body.gmail_account) {
    return NextResponse.json({ error: 'Falta message_id o gmail_account' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Buscar registro existente
  const { data: existing } = await supabase
    .from('email_audit_attempts')
    .select('id, attempt_count, status')
    .eq('message_id', body.message_id)
    .maybeSingle()

  const now = new Date().toISOString()

  // Caso 1: ignorado por humano → no reintentar
  if (existing?.status === 'ignored') {
    return NextResponse.json({
      id: existing.id,
      attempt_count: existing.attempt_count,
      status: 'ignored',
      should_retry: false,
    })
  }

  // Caso 2: ya procesado → marcar y no reintentar
  if (existing?.status === 'reprocessed_ok') {
    return NextResponse.json({
      id: existing.id,
      attempt_count: existing.attempt_count,
      status: 'reprocessed_ok',
      should_retry: false,
    })
  }

  // Caso 3: nuevo o pending/persistent → calcular siguiente intento
  const nextAttemptCount = (existing?.attempt_count ?? 0) + 1
  const nextStatus: 'pending' | 'persistent_orphan' =
    nextAttemptCount >= MAX_ATTEMPTS ? 'persistent_orphan' : 'pending'

  const payload = {
    message_id: body.message_id,
    gmail_account: body.gmail_account,
    subject: body.subject ?? null,
    from_address: body.from_address ?? null,
    received_at: body.received_at ?? null,
    attempt_count: nextAttemptCount,
    last_attempt_at: now,
    status: nextStatus,
    last_error: body.last_error ?? null,
  }

  let resultId: number
  if (existing) {
    const { data, error } = await supabase
      .from('email_audit_attempts')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) {
      console.error('[audit/register] update error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    resultId = data.id
  } else {
    const { data, error } = await supabase
      .from('email_audit_attempts')
      .insert(payload)
      .select('id')
      .single()
    if (error) {
      console.error('[audit/register] insert error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    resultId = data.id
  }

  // El cron debe reintentar inyección si aún no llegó al límite
  // (en el 2º intento marca persistent_orphan PERO el cron reintenta una vez más
  //  por si fue un fallo transitorio. Tras eso, queda persistente y el humano decide.)
  const shouldRetry = nextAttemptCount <= MAX_ATTEMPTS

  return NextResponse.json({
    id: resultId,
    attempt_count: nextAttemptCount,
    status: nextStatus,
    should_retry: shouldRetry,
  })
}
