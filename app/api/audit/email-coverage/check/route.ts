/**
 * GET /api/audit/email-coverage/check?message_id=<gmail_message_id>
 *
 * Llamado por el workflow auxiliar n8n "Auditor de Cobertura Email".
 * Comprueba si un message_id de Gmail ya fue procesado por el workflow
 * general (presente en invoices.email_message_id o documents.email_message_id).
 *
 * Auth: header `Authorization: Bearer <AUDIT_CRON_SECRET>`.
 *
 * Devuelve:
 *   { found: boolean, table: 'invoices'|'documents'|null, id: string|null }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function authCronCheck(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const authHeader = request.headers.get('authorization') ?? ''
  return authHeader === `Bearer ${expected}`
}

export async function GET(request: NextRequest) {
  if (!authCronCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const messageId = request.nextUrl.searchParams.get('message_id')
  if (!messageId) {
    return NextResponse.json({ error: 'Falta message_id' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  const { data: invRow } = await supabase
    .from('invoices')
    .select('id')
    .eq('email_message_id', messageId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (invRow) {
    return NextResponse.json({ found: true, table: 'invoices', id: invRow.id })
  }

  const { data: docRow } = await supabase
    .from('documents')
    .select('id')
    .eq('email_message_id', messageId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (docRow) {
    return NextResponse.json({ found: true, table: 'documents', id: docRow.id })
  }

  return NextResponse.json({ found: false, table: null, id: null })
}
