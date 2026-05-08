/**
 * POST /api/audit/email-coverage/register
 *
 * Llamado por el workflow auxiliar n8n (cron 03:00) para registrar/actualizar
 * un huérfano detectado tras cruzar Gmail vs BD.
 *
 * Refactor sesión 30 (30/04/2026): comportamiento dividido por modo:
 *
 *   - mode='register' (DEFAULT, llamado por el cron auditor):
 *     • IDEMPOTENTE — solo upsert metadata, NO incrementa attempt_count
 *     • Si row existe: refresca subject/from/received_at (info Gmail puede actualizarse)
 *     • Si row no existe: crea nuevo con attempt_count=0, status='pending'
 *     • Devuelve should_retry = (attempt_count < MAX_ATTEMPTS && !ignored && !ok)
 *
 *   - mode='attempt' (llamado tras inyectar al webhook reprocesador):
 *     • INCREMENTA attempt_count
 *     • Persiste last_error si el caller lo pasa (desde subworkflow Captura errores)
 *     • Marca persistent_orphan si attempt_count >= MAX_ATTEMPTS
 *
 *   - mode='success' (llamado tras INSERT en invoices/quotes/documents OK):
 *     • Marca status='reprocessed_ok'
 *     • should_retry=false
 *
 * Auth: header `Authorization: Bearer <AUDIT_CRON_SECRET>`.
 *
 * Body:
 *   {
 *     mode?: 'register' | 'attempt' | 'success'   // default: 'register'
 *     message_id: string         // Gmail messageId (UNIQUE)
 *     gmail_account: string      // ej "info@cathedralgroup.es"
 *     subject?: string
 *     from_address?: string
 *     received_at?: string       // ISO datetime
 *     last_error?: string        // motivo del último fallo (solo mode='attempt')
 *   }
 *
 * Devuelve:
 *   {
 *     id: number,
 *     attempt_count: number,
 *     status: 'pending'|'reprocessed_ok'|'persistent_orphan'|'ignored',
 *     should_retry: boolean      // true si el cron debe inyectar el adjunto al webhook general
 *   }
 *
 * Compatibilidad: si `mode` no se pasa, se asume 'register' (idempotente).
 * El cron auditor antiguo NO incrementaba attempts a propósito ni a propósito —
 * lo hacía siempre. Ahora separamos los conceptos: registrar existencia vs
 * intentar procesamiento.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 2

function authCronCheck(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const authHeader = request.headers.get('authorization') ?? ''
  // Comparación timing-safe: evita inferir el secret midiendo tiempos de respuesta.
  const expectedHeader = `Bearer ${expected}`
  if (authHeader.length !== expectedHeader.length) return false
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedHeader))
}

interface Body {
  mode?: 'register' | 'attempt' | 'success'
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

  const mode = body.mode ?? 'register'
  if (!['register', 'attempt', 'success'].includes(mode)) {
    return NextResponse.json({ error: `mode inválido: ${mode}` }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: existing } = await supabase
    .from('email_audit_attempts')
    .select('id, attempt_count, status')
    .eq('message_id', body.message_id)
    .maybeSingle()

  const now = new Date().toISOString()

  // === Casos terminales: sin tocar nada ===
  if (existing?.status === 'ignored') {
    return NextResponse.json({
      id: existing.id,
      attempt_count: existing.attempt_count,
      status: 'ignored',
      should_retry: false,
    })
  }
  if (existing?.status === 'reprocessed_ok' && mode !== 'success') {
    return NextResponse.json({
      id: existing.id,
      attempt_count: existing.attempt_count,
      status: 'reprocessed_ok',
      should_retry: false,
    })
  }

  // === mode='success': el procesamiento aguas abajo terminó OK ===
  if (mode === 'success') {
    if (!existing) {
      return NextResponse.json({ error: 'message_id no existe — no se puede marcar success' }, { status: 404 })
    }
    const { data, error } = await supabase
      .from('email_audit_attempts')
      .update({ status: 'reprocessed_ok', last_attempt_at: now, last_error: null })
      .eq('id', existing.id)
      .select('id, attempt_count, status')
      .single()
    if (error) {
      console.error('[audit/register/success] error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    return NextResponse.json({ ...data, should_retry: false })
  }

  // === mode='register' (default, idempotente — el cron lista emails y registra) ===
  if (mode === 'register') {
    if (existing) {
      // Refrescar metadata por si Gmail cambia algo (improbable pero defensivo).
      // NO tocar attempt_count ni status.
      const { data, error } = await supabase
        .from('email_audit_attempts')
        .update({
          subject: body.subject ?? null,
          from_address: body.from_address ?? null,
          received_at: body.received_at ?? null,
        })
        .eq('id', existing.id)
        .select('id, attempt_count, status')
        .single()
      if (error) {
        console.error('[audit/register] update metadata error:', error)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }
      const shouldRetry =
        data.status === 'pending' && data.attempt_count < MAX_ATTEMPTS
      return NextResponse.json({ ...data, should_retry: shouldRetry })
    }

    // Insert nuevo con attempt_count=0
    const { data, error } = await supabase
      .from('email_audit_attempts')
      .insert({
        message_id: body.message_id,
        gmail_account: body.gmail_account,
        subject: body.subject ?? null,
        from_address: body.from_address ?? null,
        received_at: body.received_at ?? null,
        attempt_count: 0,
        status: 'pending',
      })
      .select('id, attempt_count, status')
      .single()
    if (error) {
      console.error('[audit/register] insert error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    return NextResponse.json({ ...data, should_retry: true })
  }

  // === mode='attempt': INCREMENTA attempt_count tras intento real de procesamiento ===
  // (el subworkflow Captura errores también lo invoca con last_error tras un fallo)
  const baseAttempt = existing?.attempt_count ?? 0
  const nextAttemptCount = baseAttempt + 1
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
      console.error('[audit/register/attempt] update error:', error)
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
      console.error('[audit/register/attempt] insert error:', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    resultId = data.id
  }

  // El cron solo reintenta si el status sigue 'pending' (no superó MAX_ATTEMPTS)
  const shouldRetry = nextStatus === 'pending' && nextAttemptCount < MAX_ATTEMPTS

  return NextResponse.json({
    id: resultId,
    attempt_count: nextAttemptCount,
    status: nextStatus,
    should_retry: shouldRetry,
  })
}
