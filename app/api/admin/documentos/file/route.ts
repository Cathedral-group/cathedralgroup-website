/**
 * Visor de documentos guardados en Supabase Storage (no Drive).
 *
 * GET /api/admin/documentos/file?table=<tabla>&id=<uuid>
 *   Busca el storage_path de la fila, genera una signed URL y redirige.
 *
 * Necesario porque muchos documentos (subida admin, adjuntos) viven en Storage
 * y NO tienen drive_url: el hub no podía enlazarlos (enlace roto).
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
  const cols = TABLES_WITH_BUCKET.has(table) ? 'storage_path, storage_bucket' : 'storage_path'
  const { data, error } = await supabase.from(table).select(cols).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data as { storage_path?: string | null; storage_bucket?: string | null } | null
  if (!row?.storage_path) return new NextResponse('Este documento no tiene archivo asociado', { status: 404 })

  const bucket = row.storage_bucket || 'admin-uploads'
  const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(row.storage_path, 3600)
  if (signErr || !signed?.signedUrl) return new NextResponse('No se pudo abrir el archivo', { status: 404 })

  return NextResponse.redirect(signed.signedUrl)
}
