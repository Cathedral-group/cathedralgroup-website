/**
 * POST /api/portal/trabajador/[token]/upload-receipt
 *
 * El trabajador sube una foto de ticket/albarán/factura/foto de obra desde el portal.
 *
 * Body: multipart/form-data
 *   - file: la imagen (JPEG/PNG/WebP/HEIC/PDF, max 10MB)
 *   - doc_type: 'ticket' | 'albaran' | 'factura' | 'foto_obra' | 'otro'
 *   - project_id?: UUID (opcional, si el trabajador lo asocia)
 *   - notas?: string corto
 *   - geo_lat?, geo_lng?, geo_accuracy?: coordenadas del móvil al hacer la foto (opcional)
 *
 * Flujo:
 *   1. Valida token
 *   2. Sube a Supabase Storage bucket 'worker-receipts' con path
 *      {company_id}/{employee_id}/{yyyy-mm}/{uuid}.{ext}
 *   3. INSERT en worker_attachments con status='uploaded'
 *   4. Devuelve { id, storage_path, signed_url } para preview inmediato
 *
 * El procesamiento OCR (extracción NIF/importe/fecha/proveedor) se hace en
 * Fase 2.5 — admin o cron manual por ahora.
 *
 * Aislamiento: NO usa Supabase Auth. Solo token UUID.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_DOC_TYPES = ['ticket', 'albaran', 'factura', 'foto_obra', 'otro']

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
      return 'heic'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

export async function POST(
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
  const companyId: string = validation.company_id

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || typeof (file as File).size !== 'number') {
    return NextResponse.json({ error: 'Archivo "file" requerido' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Archivo demasiado grande (máx 10 MB)' },
      { status: 413 },
    )
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido (${file.type})` },
      { status: 415 },
    )
  }

  const docType = (formData.get('doc_type') as string) || 'ticket'
  if (!ALLOWED_DOC_TYPES.includes(docType)) {
    return NextResponse.json({ error: 'doc_type inválido' }, { status: 400 })
  }

  const projectIdRaw = formData.get('project_id') as string | null
  const projectId = projectIdRaw && projectIdRaw.trim() !== '' ? projectIdRaw : null

  if (projectId) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!proj) {
      return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 })
    }
  }

  const notas = ((formData.get('notas') as string) || '').trim() || null
  const geoLat = parseFloat(formData.get('geo_lat') as string) || null
  const geoLng = parseFloat(formData.get('geo_lng') as string) || null
  const geoAcc = parseInt(formData.get('geo_accuracy') as string, 10) || null

  // Path: {company_id}/{employee_id}/{yyyy-mm}/{uuid}.{ext}
  const yearMonth = new Date().toISOString().slice(0, 7) // 2026-05
  const id = crypto.randomUUID()
  const ext = extFromMime(file.type)
  const storagePath = `${companyId}/${employeeId}/${yearMonth}/${id}.${ext}`

  // Subir a Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('worker-receipts')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: `Error al subir: ${uploadError.message}` },
      { status: 500 },
    )
  }

  // INSERT en worker_attachments
  const { data: attachment, error: insertError } = await supabase
    .from('worker_attachments')
    .insert({
      id,
      company_id: companyId,
      employee_id: employeeId,
      project_id: projectId,
      storage_path: storagePath,
      storage_bucket: 'worker-receipts',
      mime_type: file.type,
      size_bytes: file.size,
      original_filename: (file as File).name || null,
      doc_type: docType,
      status: 'uploaded',
      worker_notas: notas,
      device_geo_lat: geoLat && Number.isFinite(geoLat) ? geoLat : null,
      device_geo_lng: geoLng && Number.isFinite(geoLng) ? geoLng : null,
      device_geo_accuracy_m: geoAcc && Number.isFinite(geoAcc) ? geoAcc : null,
    })
    .select('id, storage_path, doc_type, status, created_at')
    .single()

  if (insertError) {
    // Cleanup: borrar archivo subido si falla el INSERT
    await supabase.storage.from('worker-receipts').remove([storagePath])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Generar signed URL para preview inmediato (válida 1h)
  const { data: signed } = await supabase.storage
    .from('worker-receipts')
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({
    ok: true,
    attachment,
    preview_url: signed?.signedUrl ?? null,
    message:
      'Subido correctamente. La administración lo procesará para anotarlo en la contabilidad.',
  })
}

export const dynamic = 'force-dynamic'
// Aumentar límite de body para multipart (Next.js 15 default es 1MB en route handlers)
export const maxDuration = 30
