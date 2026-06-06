import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

/**
 * Detalle de un documento concreto, identificado por (source_table, source_id).
 *
 * Ruta: /admin/documentos/[tipo]/[id]
 *   - tipo: source_table de documents_registry (invoices, payrolls, contratos,
 *           escrituras, licencias, seguros, modelos_fiscales, justificantes_pago,
 *           albaranes, presupuestos, certificados, informes, certificaciones_obra,
 *           notas_simples, documentos_otros)
 *   - id:   UUID de la fila en la tabla canónica
 *
 * Stub navegable mínimo: muestra los datos crudos + PDF embed si hay file_url
 * o storage_path o drive_url. Funcionalidad evolutiva (editar campos, audit log,
 * reclasificación, borrar) se añade conforme se itere.
 */

// Tablas canónicas válidas (espejo de documents_registry source_table)
const ALLOWED_TABLES = new Set([
  'invoices',
  'payrolls',
  'contratos',
  'notas_simples',
  'escrituras',
  'licencias',
  'certificaciones_obra',
  'certificados',
  'informes',
  'seguros',
  'modelos_fiscales',
  'justificantes_pago',
  'albaranes',
  'presupuestos',
  'documentos_otros',
])

// Tablas que NO tienen company_id (defensive whitelist: el matview sí lo expone,
// la tabla canónica puede no tenerlo si es legacy). Hoy todas tienen company_id
// pero dejamos hook por si aparece alguna catálogo compartido.
const TABLES_WITHOUT_COMPANY: Set<string> = new Set()

type Props = {
  params: Promise<{ tipo: string; id: string }>
}

function fmtEur(val: number | null | undefined): string {
  if (val == null || isNaN(val as number)) return '—'
  return Number(val).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return String(v)
  }
}

function fmtValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** Detecta primer atributo no null que sea URL/path a fichero. */
function pickDocumentUrl(row: Record<string, unknown>): string | null {
  const candidates = [
    'pdf_url',
    'file_url',
    'storage_url',
    'drive_url',
    'storage_path',
    'archivo_url',
    'documento_url',
  ]
  for (const k of candidates) {
    const v = row[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

export default async function DocumentoDetailPage({ params }: Props) {
  const { tipo, id } = await params

  // ─── Auth ────────────────────────────────────────────────────────────────
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user?.email) redirect('/admin/login')
  if (!isAdminEmail(userData.user.email)) redirect('/admin/login')

  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') redirect('/admin/login')

  // ─── Validar tabla canónica (whitelist anti-SQL-injection) ──────────────
  if (!ALLOWED_TABLES.has(tipo)) {
    notFound()
  }

  // ─── Validar id formato UUID ────────────────────────────────────────────
  if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) {
    notFound()
  }

  // Consolidación Fase 4: tipos con hogar dedicado más rico → redirigir (evita el stub).
  const RICH_HOME: Record<string, (rid: string) => string> = {
    invoices:             (rid) => `/admin/facturas?id=${rid}`,
    justificantes_pago:   (rid) => `/admin/facturas?id=${rid}`,
    payrolls:             ()    => `/admin/personal`,
    presupuestos:         ()    => `/admin/presupuestos`,
    albaranes:            ()    => `/admin/documentos/tipados/albaranes`,
    contratos:            ()    => `/admin/documentos/tipados/contratos`,
    notas_simples:        ()    => `/admin/documentos/tipados/notas-simples`,
    seguros:              ()    => `/admin/documentos/tipados/seguros`,
    certificaciones_obra: ()    => `/admin/documentos/tipados/certificaciones-obra`,
    informes:             ()    => `/admin/documentos/tipados/informes`,
    modelos_fiscales:     ()    => `/admin/documentos/tipados/modelos-fiscales`,
  }
  if (RICH_HOME[tipo]) redirect(RICH_HOME[tipo](id))

  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // ─── Fetch fila canónica ────────────────────────────────────────────────
  let query = supabase.from(tipo).select('*').eq('id', id)
  if (!TABLES_WITHOUT_COMPANY.has(tipo)) {
    query = query.eq('company_id', activeCompanyId)
  }
  const { data: row, error } = await query.maybeSingle()

  if (error) {
    console.error(`[documento-detail ${tipo}/${id}] error:`, error.message)
  }
  if (!row) {
    notFound()
  }

  const rec = row as Record<string, unknown>
  // Servir el archivo por el endpoint firmado (/api/admin/documentos/file) cuando
  // vive en Storage (storage_path) o Google Drive (drive_url): genera una signed URL
  // de Storage o redirige a Drive (hosts Google permitidos). Antes se usaba la ruta
  // cruda de pickDocumentUrl → un storage_path NO es una URL fetchable directa →
  // "No se puede previsualizar el PDF". Si solo hay una URL http(s) directa
  // (pdf_url/file_url/…), se usa tal cual.
  const directUrl = pickDocumentUrl(rec)
  const docUrl = (rec.storage_path || rec.drive_url)
    ? `/api/admin/documentos/file?table=${encodeURIComponent(tipo)}&id=${encodeURIComponent(id)}`
    : directUrl
  const isDeleted = rec.deleted_at != null

  // Campos destacados (si existen en la fila)
  const featured: Array<[string, string]> = []
  const PICK: Array<[string, string]> = [
    ['original_filename', 'Archivo'],
    ['issue_date', 'Fecha emisión'],
    ['fecha_emision', 'Fecha emisión'],
    ['fecha_relevante', 'Fecha relevante'],
    ['fecha_firma', 'Fecha firma'],
    ['fecha_otorgamiento', 'Fecha otorgamiento'],
    ['number', 'Número'],
    ['amount_total', 'Total'],
    ['importe_total', 'Total'],
    ['importe_principal', 'Importe'],
    ['total', 'Total'],
    ['liquido_a_percibir', 'Líquido a percibir'],
    ['empresa', 'Contraparte'],
    ['supplier_nif', 'NIF proveedor'],
    ['nif_receptor', 'NIF receptor'],
    ['trabajador_nombre', 'Trabajador'],
    ['notario_nombre', 'Notario'],
    ['aseguradora', 'Aseguradora'],
    ['proveedor_nombre', 'Proveedor'],
    ['organismo_emisor', 'Organismo'],
    ['concept', 'Concepto'],
    ['concepto', 'Concepto'],
    ['descripcion', 'Descripción'],
    ['review_status', 'Estado revisión'],
    ['ai_confidence', 'Confianza IA'],
    ['file_hash', 'SHA-256'],
  ]
  for (const [key, label] of PICK) {
    if (rec[key] != null && rec[key] !== '') {
      const v = rec[key]
      if (key.includes('amount') || key.includes('importe') || key === 'total' || key === 'liquido_a_percibir') {
        featured.push([label, fmtEur(v as number)])
      } else if (key.startsWith('fecha') || key === 'issue_date') {
        featured.push([label, fmtDate(v as string)])
      } else {
        featured.push([label, fmtValue(v)])
      }
    }
  }

  // Resto de campos (excluyendo featured + audit + soft-delete)
  const featuredKeys = new Set(PICK.map(([k]) => k))
  const HIDDEN = new Set([
    'id',
    'company_id',
    'created_at',
    'updated_at',
    'deleted_at',
    ...Array.from(featuredKeys),
  ])
  const rest = Object.entries(rec).filter(([k]) => !HIDDEN.has(k))

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      {/* Header + breadcrumbs */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            <Link href="/admin/documentos" className="hover:text-neutral-800">
              Documentos
            </Link>
            <span className="mx-2">/</span>
            <span>{tipo}</span>
          </div>
          <h1 className="mt-1 text-xl font-medium uppercase tracking-wide">
            {(rec.original_filename as string) ||
              (rec.number as string) ||
              `Documento ${id.slice(0, 8)}`}
          </h1>
          {isDeleted && (
            <span className="mt-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              En papelera ({fmtDate(rec.deleted_at as string)})
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/documentos"
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-neutral-700 hover:bg-neutral-50"
          >
            ← Volver al hub
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* PDF embed */}
        <div className="rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Vista previa
          </div>
          {docUrl ? (
            <object
              data={docUrl}
              type="application/pdf"
              className="h-[70vh] w-full"
            >
              <p className="p-4 text-sm text-neutral-600">
                No se puede previsualizar el PDF.{' '}
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Abrir documento
                </a>
              </p>
            </object>
          ) : (
            <div className="p-6 text-sm text-neutral-500">Sin documento adjunto.</div>
          )}
        </div>

        {/* Campos destacados + JSON raw */}
        <div className="space-y-4">
          <div className="rounded border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Datos principales
            </div>
            <dl className="divide-y divide-neutral-100">
              {featured.length === 0 ? (
                <div className="px-4 py-3 text-sm text-neutral-400">Sin datos destacados.</div>
              ) : (
                featured.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-3 gap-3 px-4 py-2">
                    <dt className="text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
                    <dd className="col-span-2 text-sm text-neutral-900">{value}</dd>
                  </div>
                ))
              )}
            </dl>
          </div>

          {rest.length > 0 && (
            <details className="rounded border border-neutral-200 bg-white">
              <summary className="cursor-pointer border-b border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Resto de campos ({rest.length})
              </summary>
              <dl className="divide-y divide-neutral-100">
                {rest.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-3 px-4 py-2">
                    <dt className="text-xs font-mono text-neutral-500">{k}</dt>
                    <dd className="col-span-2 whitespace-pre-wrap break-words text-xs text-neutral-700">
                      {fmtValue(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {/* Audit log placeholder (evolutivo) */}
          <div className="rounded border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Historial
            </div>
            <div className="px-4 py-3 text-xs text-neutral-500">
              <div>
                Creado: <span className="font-mono">{fmtDate(rec.created_at as string)}</span>
              </div>
              {Boolean(rec.updated_at) && (
                <div>
                  Actualizado:{' '}
                  <span className="font-mono">{fmtDate(rec.updated_at as string)}</span>
                </div>
              )}
              <div className="mt-2 text-neutral-400">
                Audit log detallado disponible en `admin_audit_log` (filtrar por
                table_name=&quot;{tipo}&quot; AND record_id=&quot;{id}&quot;).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
