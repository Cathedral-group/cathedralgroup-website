/**
 * GET /api/portal/trabajador/[token]/receipts
 *
 * Devuelve los tickets/albaranes/facturas/fotos que el trabajador ha subido.
 * Cada elemento con signed URL para preview (válida 1h).
 *
 * Filtros opcionales:
 *   - status: 'uploaded' | 'extracted' | 'confirmed' | 'ignored'
 *   - desde, hasta: YYYY-MM-DD
 *
 * Aislamiento: NO usa Supabase Auth. Solo token UUID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

interface AttachmentRow {
  id: string
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  size_bytes: number | null
  original_filename: string | null
  doc_type: string
  status: string
  worker_notas: string | null
  created_at: string
  reviewed_at: string | null
  reviewer_action: string | null
  invoice_id: string | null
  document_id: string | null
  project: { code: string; name: string | null } | { code: string; name: string | null }[] | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 30) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = request.headers.get('user-agent') ?? null

  const { data: validation, error: vErr } = await supabase.rpc(
    'validate_and_track_worker_token',
    { p_token: token, p_ip: ip, p_user_agent: ua },
  )
  if (vErr || !validation?.valid) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
  }

  const employeeId: string = validation.employee_id

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')

  let query = supabase
    .from('worker_attachments')
    .select(
      `id, storage_path, storage_bucket, mime_type, size_bytes, original_filename,
       doc_type, status, worker_notas, created_at, reviewed_at, reviewer_action,
       invoice_id, document_id,
       project:project_id (code, name)`,
    )
    .eq('employee_id', employeeId)
    .is('deleted_at', null)

  if (status) query = query.eq('status', status)
  if (desde) query = query.gte('created_at', desde)
  if (hasta) query = query.lte('created_at', hasta + 'T23:59:59Z')

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generar signed URLs en paralelo (1h cada)
  const rowsWithUrl = await Promise.all(
    ((data ?? []) as AttachmentRow[]).map(async (r) => {
      const { data: signed } = await supabase.storage
        .from(r.storage_bucket)
        .createSignedUrl(r.storage_path, 3600)
      return { ...r, preview_url: signed?.signedUrl ?? null }
    }),
  )

  return NextResponse.json({ rows: rowsWithUrl })
}

export const dynamic = 'force-dynamic'
