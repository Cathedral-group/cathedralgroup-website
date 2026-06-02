/**
 * Visor de documentos guardados en Supabase Storage o Google Drive.
 *
 * GET /api/admin/documentos/file?table=<tabla>&id=<uuid>
 *   1) Si la fila tiene storage_path → genera signed URL de Storage y redirige.
 *   2) Si no, pero tiene drive_url (documentos del pipeline de email que viven en
 *      Google Drive) → redirige al Drive (solo hosts Google permitidos).
 *   3) Si no tiene ninguno → 404.
 *
 * Necesario porque los documentos llegan por dos vías: subida admin/adjuntos →
 * Storage (storage_path); pipeline de email → Google Drive (drive_url). El hub
 * enlazaba solo storage_path, así que los de Drive daban enlace roto (404).
 *
 * Auth: admin allow-list + AAL2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tablas de documentos con storage_path (sin snapshots).
const ALLOWED_TABLES = new Set([
  'documentos_otros', 'albaranes', 'certificaciones_obra', 'certificados', 'contratos',
  'documents', 'escrituras', 'informes', 'invoices', 'justificantes_pago', 'licencias',
  'modelos_fiscales', 'notas_simples', 'payrolls', 'presupuestos', 'seguros',
  'admin_uploads', 'worker_attachments',
])
// Tablas que además tienen columna storage_bucket.
const TABLES_WITH_BUCKET = new Set(['admin_uploads', 'worker_attachments'])
// Tablas que tienen columna drive_url (Google Drive — pipeline email).
// admin_uploads / worker_attachments NO la tienen → no pedirla (evita 42703).
const TABLES_WITH_DRIVE_URL = new Set([
  'documentos_otros',
  'albaranes', 'certificaciones_obra', 'certificados', 'contratos', 'documents',
  'escrituras', 'informes', 'invoices', 'justificantes_pago', 'licencias',
  'modelos_fiscales', 'notas_simples', 'payrolls', 'presupuestos', 'seguros',
])

// Hosts Google permitidos para el fallback de redirect. Igualdad EXACTA de hostname
// (no sufijo): evita el bypass clásico "google.com.evil.com". Ver OWASP Unvalidated
// Redirects and Forwards Cheat Sheet.
const ALLOWED_GOOGLE_HOSTS = new Set([
  'drive.google.com', 'docs.google.com',
  'lh3.googleusercontent.com', 'drive.usercontent.google.com',
])
function isSafeGoogleUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && ALLOWED_GOOGLE_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

async function authCheck() {
  const c = await createServerSupabaseClient()
  const { data, error } = await c.auth.getUser()
  if (error || !data?.user?.email) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

export async function GET(request: NextRequest) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const table = request.nextUrl.searchParams.get('table') ?? ''
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: 'Tabla no permitida' }, { status: 400 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const parts = ['storage_path']
  if (TABLES_WITH_BUCKET.has(table)) parts.push('storage_bucket')
  if (TABLES_WITH_DRIVE_URL.has(table)) parts.push('drive_url')
  const cols = parts.join(', ')

  const { data, error } = await supabase.from(table).select(cols).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data as { storage_path?: string | null; storage_bucket?: string | null; drive_url?: string | null } | null

  // 1) Preferir archivo en Supabase Storage (subida admin / adjuntos).
  if (row?.storage_path) {
    const bucket = row.storage_bucket || 'admin-uploads'
    const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(row.storage_path, 3600)
    if (signErr || !signed?.signedUrl) return new NextResponse('No se pudo abrir el archivo', { status: 404 })
    return NextResponse.redirect(signed.signedUrl)
  }

  // 2) Fallback: documentos del pipeline de email viven en Google Drive (drive_url, sin
  //    storage_path). Redirigir al Drive solo si la URL es de un host Google permitido.
  if (row?.drive_url && isSafeGoogleUrl(row.drive_url)) {
    return NextResponse.redirect(row.drive_url)
  }

  return new NextResponse('Este documento no tiene archivo asociado', { status: 404 })
}
