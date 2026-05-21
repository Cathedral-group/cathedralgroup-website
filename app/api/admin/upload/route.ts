/**
 * POST /api/admin/upload
 *
 * Los socios admin suben facturas/docs desde el panel admin con cámara móvil
 * o drag-drop. Diseñado MVP simple sin scanner avanzado (Fase 2 jscanify futuro).
 *
 * Body: multipart/form-data
 *   - file: imagen JPEG/PNG/WebP/HEIC/PDF, max 10MB
 *   - doc_type: factura | ticket | albaran | presupuesto | proforma | contrato |
 *               escritura | nota_simple | licencia | seguro | certificado |
 *               informe | modelo_fiscal | otro
 *   - project_id?: UUID opcional (asociar a proyecto)
 *   - notas?: string corto
 *
 * Flujo:
 *   1. Auth admin AAL2
 *   2. Validar file size + mime
 *   3. SHA-256 hash client-side cross check
 *   4. Upload Supabase Storage bucket admin-uploads
 *   5. INSERT admin_uploads status='uploaded'
 *   6. OCR cascade post-response (Gemini + GPT-4o + Mistral) si imagen
 *   7. Devuelve { id, storage_path, signed_url }
 *
 * Próxima integración: tras workflow Definitivo updates → POST webhook con
 * payload compatible para pasar por mismo pipeline (clasificación + Drive routing).
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import { sha256Hex } from '@/lib/cathedral-utility-client'

export const maxDuration = 60

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

/**
 * ALLOWED_DOC_TYPES ahora se valida contra el SSOT registry en BD.
 * Fallback minimal por si BD inaccesible (cold start, outage Supabase).
 * Mantener sincronizado con seed migration 20260521180000.
 */
const FALLBACK_DOC_TYPES = [
  'factura', 'ticket', 'rectificativa', 'proforma', 'albaran',
  'presupuesto', 'contrato', 'escritura', 'nota_simple', 'licencia',
  'seguro', 'certificado', 'certificacion', 'informe', 'modelo_fiscal',
  'nomina', 'justificante_pago', 'otro', 'no_legible',
]

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/heic':
    case 'image/heif': return 'heic'
    case 'application/pdf': return 'pdf'
    default: return 'bin'
  }
}

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function POST(request: NextRequest) {
  const user = await authCheck()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()

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
    return NextResponse.json({ error: 'Archivo demasiado grande (máx 10 MB)' }, { status: 413 })
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: `Tipo de archivo no permitido (${file.type})` }, { status: 415 })
  }

  const docType = (formData.get('doc_type') as string) || 'factura'
  // Validar contra SSOT registry. Fallback a lista hardcoded si BD inaccesible.
  let allowedDocTypes: string[] = FALLBACK_DOC_TYPES
  try {
    const { data: registryRows } = await supabase
      .from('doc_types_registry')
      .select('code')
      .eq('enabled', true)
    if (registryRows && registryRows.length > 0) {
      allowedDocTypes = registryRows.map((r: { code: string }) => r.code)
    }
  } catch {
    // continuar con FALLBACK_DOC_TYPES
  }
  if (!allowedDocTypes.includes(docType)) {
    return NextResponse.json({ error: `doc_type inválido (${docType})` }, { status: 400 })
  }

  const projectIdRaw = formData.get('project_id') as string | null
  const projectId = projectIdRaw && projectIdRaw.trim() !== '' ? projectIdRaw : null

  // Active company del usuario (multi-empresa pattern Cathedral)
  const { data: activeCompany } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_email', user.email)
    .is('removed_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  const companyId = activeCompany?.company_id || '00000000-0000-0000-0000-cca7ed1a1000'

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

  // Path: {company_id}/admin/{user_email_safe}/{yyyy-mm}/{uuid}.{ext}
  const yearMonth = new Date().toISOString().slice(0, 7)
  const id = crypto.randomUUID()
  const ext = extFromMime(file.type)
  const userSafe = user.email.replace(/[^a-z0-9]/gi, '_')
  const storagePath = `${companyId}/admin/${userSafe}/${yearMonth}/${id}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const [{ error: uploadError }, fileHash] = await Promise.all([
    supabase.storage.from('admin-uploads').upload(storagePath, arrayBuffer, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    }),
    sha256Hex(arrayBuffer),
  ])

  if (uploadError) {
    return NextResponse.json({ error: `Error al subir: ${uploadError.message}` }, { status: 500 })
  }

  const { data: attachment, error: insertError } = await supabase
    .from('admin_uploads')
    .insert({
      id,
      company_id: companyId,
      uploaded_by_email: user.email,
      project_id: projectId,
      storage_bucket: 'admin-uploads',
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      file_hash: fileHash,
      original_filename: (file as File).name || null,
      doc_type: docType,
      notas,
      status: 'uploaded',
    })
    .select('id, storage_path, doc_type, status, created_at')
    .single()

  if (insertError) {
    await supabase.storage.from('admin-uploads').remove([storagePath])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { data: signed } = await supabase.storage
    .from('admin-uploads')
    .createSignedUrl(storagePath, 3600)

  // Dispatch Workflow Definitivo via Op 2 queue (Plan C 18/05/2026)
  // Endpoint = thin write only. Workflow procesa OCR + classify + Drive + INSERT invoices.
  // BD trigger dispatch_agent_webhook detecta agent_name='workflow_invoice_ocr' → llama
  // webhook /cathedral-reprocess con Bearer Vault secret. Workflow Adaptador Admin Upload
  // descarga binary desde Supabase Storage signed URL → pipeline downstream.
  after(async () => {
    try {
      const { error: dispatchErr } = await supabase.from('agent_dispatch_queue').insert({
        agent_name: 'workflow_invoice_ocr',
        event_type: 'admin_upload',
        severity: 'low',
        trigger_payload: {
          message_id: `admin-${id}`,
          gmail_account: 'admin_upload',
          from_address: user.email,
          subject: `[Admin Upload] ${docType} · ${(file as File).name || 'archivo'}`,
          received_at: new Date().toISOString(),
          body: notas || '',
          filename: (file as File).name || `admin_${id}.${ext}`,
          mime_type: file.type,
          admin_upload_id: id,
          storage_path: storagePath,
        },
        dedup_key: `admin-upload-${id}`,
        status: 'pending',
      })
      if (dispatchErr) {
        console.error('[admin/upload] dispatch INSERT failed:', dispatchErr)
        await supabase.from('admin_uploads').update({
          status: 'error',
          extracted_data: { error: 'dispatch_failed', detail: dispatchErr.message },
        }).eq('id', id)
      } else {
        await supabase.from('admin_uploads').update({ status: 'processing' }).eq('id', id)
      }
    } catch (err) {
      console.error('[admin/upload] dispatch unexpected error:', err)
    }
  })

  return NextResponse.json({
    ok: true,
    id: attachment?.id,
    storage_path: attachment?.storage_path,
    signed_url: signed?.signedUrl || null,
    doc_type: attachment?.doc_type,
    status: attachment?.status,
  })
}
