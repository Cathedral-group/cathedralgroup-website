/**
 * POST /api/admin/personal/tickets-trabajador/[id]/ocr
 *
 * Procesa el ticket subido por el trabajador con Gemini Vision.
 * Descarga el archivo del Storage, lo pasa a Gemini, guarda extracted_data.
 *
 * Idempotente: si ya tiene extracted_data, lo sobreescribe.
 *
 * Auth: admin allow-list + AAL2.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { extractReceiptData, isOcrAvailable } from '@/lib/ocr-gemini'
import {
  resolveCompanyIdForRequest,
  getCompanyContextFromUser,
  CATHEDRAL_INVESTMENT_SL_ID,
} from '@/lib/company-context'

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

function resolveCompany(user: User, request: NextRequest) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 } as const
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }
  return { activeCompanyId } as const
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isOcrAvailable()) {
    return NextResponse.json(
      {
        error: 'OCR no disponible: falta GEMINI_API_KEY en variables de entorno',
        action_required: 'Configurar GEMINI_API_KEY en Vercel env (production)',
      },
      { status: 503 },
    )
  }

  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const resolved = resolveCompany(user, request)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const { id } = await params
  const supabase = createAdminSupabaseClient()

  // Cargar attachment
  const { data: attachment } = await supabase
    .from('worker_attachments')
    .select('id, storage_path, storage_bucket, mime_type, status')
    .eq('id', id)
    .eq('company_id', resolved.activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!attachment) {
    return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  }

  if (attachment.mime_type === 'application/pdf') {
    return NextResponse.json(
      { error: 'OCR de PDF no soportado en MVP — soporta solo imágenes' },
      { status: 400 },
    )
  }

  // Marcar processing
  await supabase
    .from('worker_attachments')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Descargar imagen
  const { data: blob, error: dlError } = await supabase.storage
    .from(attachment.storage_bucket)
    .download(attachment.storage_path)

  if (dlError || !blob) {
    await supabase
      .from('worker_attachments')
      .update({ status: 'error' })
      .eq('id', id)
    return NextResponse.json(
      { error: `No se pudo descargar el archivo: ${dlError?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  const arrayBuffer = await blob.arrayBuffer()

  // Llamar Gemini
  const extracted = await extractReceiptData(arrayBuffer, attachment.mime_type ?? 'image/jpeg')

  if (!extracted) {
    await supabase
      .from('worker_attachments')
      .update({ status: 'error' })
      .eq('id', id)
    return NextResponse.json({ error: 'OCR no devolvió datos' }, { status: 500 })
  }

  // Guardar
  const { error: updError } = await supabase
    .from('worker_attachments')
    .update({
      extracted_data: extracted,
      extracted_at: new Date().toISOString(),
      extraction_provider: 'gemini-flash-2',
      status: 'extracted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updError) {
    return NextResponse.json({ error: updError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, extracted })
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60
