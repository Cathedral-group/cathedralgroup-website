/**
 * POST /api/ai-usage/log
 *
 * Recibe batch de registros de uso IA y los inserta en ai_usage_log.
 * Llamado desde el workflow general n8n al final del pipeline (1 POST por
 * factura procesada con array de N records, uno por cada provider que se
 * ejecutó: pre-clasificador, gemini, gpt-4o fallback, mistral OCR).
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       "invoice_id": "uuid (opcional)",
 *       "context": "preclassif | extraction | reconcile | forensic | other",
 *       "provider": "gemini | gpt-4o | mistral-ocr | ...",
 *       "model": "gemini-2.5-pro",
 *       "tokens_input": 12000,
 *       "tokens_output": 800,
 *       "duration_ms": 8500,
 *       "status": "success | error | timeout | fallback"
 *     }
 *   ]
 * }
 *
 * Auth: Bearer AUDIT_CRON_SECRET (cron) O admin allow-list + AAL2 (manual).
 * cost_eur se calcula post-hoc por cron `recalculate_ai_costs()`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

async function authCheckUser() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function authCheckCron(request: NextRequest): boolean {
  const expected = process.env.AUDIT_CRON_SECRET
  if (!expected) return false
  const auth = request.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  if (auth.length !== expectedHeader.length) return false
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expectedHeader))
  } catch {
    return false
  }
}

const VALID_CONTEXTS = new Set(['preclassif', 'extraction', 'reconcile', 'forensic', 'other'])
const VALID_STATUSES = new Set(['success', 'error', 'timeout', 'fallback'])

interface IncomingRecord {
  invoice_id?: string | null
  context?: string
  provider: string
  model?: string | null
  tokens_input?: number
  tokens_output?: number
  duration_ms?: number | null
  status?: string
  error_message?: string | null
}

export async function POST(request: NextRequest) {
  const isUser = await authCheckUser()
  const isCron = authCheckCron(request)
  if (!isUser && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { records?: IncomingRecord[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const records = Array.isArray(body.records) ? body.records : []
  if (records.length === 0 || records.length > 50) {
    return NextResponse.json({ error: 'records: array 1..50' }, { status: 400 })
  }

  // Sanitizar y validar cada record
  const cleaned = []
  for (const r of records) {
    if (!r || typeof r !== 'object' || !r.provider || typeof r.provider !== 'string') {
      return NextResponse.json({ error: 'provider requerido en cada record' }, { status: 400 })
    }
    const ctx = r.context && VALID_CONTEXTS.has(r.context) ? r.context : 'extraction'
    const status = r.status && VALID_STATUSES.has(r.status) ? r.status : 'success'
    cleaned.push({
      invoice_id: r.invoice_id && /^[0-9a-f-]{36}$/i.test(r.invoice_id) ? r.invoice_id : null,
      context: ctx,
      provider: r.provider.slice(0, 100),
      model: r.model?.slice(0, 100) ?? null,
      tokens_input: Number.isFinite(r.tokens_input) && r.tokens_input! >= 0 ? Math.floor(r.tokens_input!) : 0,
      tokens_output: Number.isFinite(r.tokens_output) && r.tokens_output! >= 0 ? Math.floor(r.tokens_output!) : 0,
      duration_ms: Number.isFinite(r.duration_ms) && r.duration_ms! >= 0 ? Math.floor(r.duration_ms!) : null,
      status,
      error_message: r.error_message?.slice(0, 500) ?? null,
    })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('ai_usage_log')
    .insert(cleaned)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: data?.length ?? 0 })
}

export const dynamic = 'force-dynamic'
