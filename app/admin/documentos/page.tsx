import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getActiveCompanyForPage } from '@/lib/company-aware-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import DocumentsHubView from './DocumentsHubView'

export const dynamic = 'force-dynamic'

/**
 * Hub de documentos cross-doc-type.
 *
 * Lee de `documents_registry` (matview) para listar TODOS los doc_types
 * (facturas, nóminas, contratos, escrituras, licencias, seguros, modelos
 * fiscales, justificantes de pago, albaranes, presupuestos, certificados,
 * informes, certificaciones de obra, notas simples, documentos_otros).
 *
 * Patrón Cathedral:
 *   1. Auth: sesión + email allow-list + AAL2 (MFA)
 *   2. Multi-empresa: getActiveCompanyForPage() filtra todo lo que renderiza
 *   3. Carga server-side de facets + filtros + primera página + KPIs
 *   4. El cliente DocumentsHubView pide siguientes páginas vía
 *      /api/documentos/registry-list (cursor pagination)
 */
export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Sesión 21/05 fix Bug 1: aceptar query param `tipo` para filtrar SSR
  // (sidebar nuevo envía `?tipo=factura` para drill-down por doc_type)
  const params = await searchParams
  const tipoFilter = typeof params.tipo === 'string' ? params.tipo : null
  // ─── Auth check (sesión + allow-list + AAL2) ─────────────────────────────
  const authClient = await createServerSupabaseClient()
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user?.email) redirect('/admin/login')
  if (!isAdminEmail(userData.user.email)) redirect('/admin/login')

  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!aal || aal.currentLevel !== 'aal2') redirect('/admin/login')

  // ─── Empresa activa (F3 multi-empresa) ───────────────────────────────────
  const activeCompanyId = await getActiveCompanyForPage()
  const supabase = createAdminSupabaseClient()

  // Hoy ISO + primer día del mes corriente (para KPI "importe mes")
  const today = new Date()
  const monthStartIso = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const todayIso = today.toISOString().slice(0, 10)

  // ─── Carga en paralelo: facets + filtros + primera página + KPIs ────────
  const PAGE_SIZE = 50

  const [
    docTypeFacetRes,
    reviewFacetRes,
    firstPageRes,
    totalCountRes,
    pendientesCountRes,
    importeMesRes,
    projectsRes,
    propertiesRes,
    topContrapartesRes,
  ] = await Promise.all([
    // Facet group by doc_type
    supabase
      .from('documents_registry')
      .select('doc_type', { count: 'exact', head: false })
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null),
    // Facet group by review_status
    supabase
      .from('documents_registry')
      .select('review_status', { count: 'exact', head: false })
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null),
    // Primera página: 50 rows ordenados por fecha_relevante desc.
    // Si query param ?tipo=X presente, filtra a ese doc_type SSR (evita flash de
    // lista completa antes de que client-side aplique filtro).
    (() => {
      let q = supabase
        .from('documents_registry')
        .select('*')
        .eq('company_id', activeCompanyId)
        .is('deleted_at', null)
      if (tipoFilter) q = q.eq('doc_type', tipoFilter)
      return q
        .order('fecha_relevante', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
    })(),
    // Total count global (sin filtros)
    supabase
      .from('documents_registry')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null),
    // KPI: pendientes de revisión
    supabase
      .from('documents_registry')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .in('review_status', ['pending', 'pendiente', 'review_needed']),
    // KPI: importes del mes corriente
    supabase
      .from('documents_registry')
      .select('importe_principal')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .gte('fecha_relevante', monthStartIso)
      .lte('fecha_relevante', todayIso),
    // Lista proyectos activos del filtro
    supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('code', { ascending: true }),
    // Lista propiedades (puede no existir tabla en algunas instalaciones)
    supabase
      .from('properties')
      .select('id, codigo, direccion, descripcion')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('codigo', { ascending: true }),
    // Top 20 contrapartes (por número de documentos)
    supabase
      .from('documents_registry')
      .select('contraparte_principal, contraparte_nif')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .not('contraparte_principal', 'is', null)
      .limit(2000), // sample para agregar client-side
  ])

  // ─── Construir facet counts ─────────────────────────────────────────────
  const docTypeFacet: Record<string, number> = {}
  for (const row of (docTypeFacetRes.data ?? []) as Array<{ doc_type: string }>) {
    const k = row.doc_type ?? 'otro'
    docTypeFacet[k] = (docTypeFacet[k] ?? 0) + 1
  }

  const reviewFacet: Record<string, number> = {}
  for (const row of (reviewFacetRes.data ?? []) as Array<{ review_status: string | null }>) {
    const k = row.review_status ?? 'sin_estado'
    reviewFacet[k] = (reviewFacet[k] ?? 0) + 1
  }

  // ─── Top 20 contrapartes (agregado en memoria) ──────────────────────────
  const contraMap = new Map<string, { name: string; nif: string | null; count: number }>()
  for (const row of (topContrapartesRes.data ?? []) as Array<{
    contraparte_principal: string | null
    contraparte_nif: string | null
  }>) {
    const key = row.contraparte_nif || row.contraparte_principal
    if (!key) continue
    const ex = contraMap.get(key)
    if (ex) {
      ex.count += 1
    } else {
      contraMap.set(key, {
        name: row.contraparte_principal ?? key,
        nif: row.contraparte_nif ?? null,
        count: 1,
      })
    }
  }
  const topContrapartes = Array.from(contraMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // ─── KPI importe mes ────────────────────────────────────────────────────
  let importeMes = 0
  for (const row of (importeMesRes.data ?? []) as Array<{ importe_principal: number | null }>) {
    if (typeof row.importe_principal === 'number') importeMes += row.importe_principal
  }

  // ─── Payload a hidratar en el cliente ────────────────────────────────────
  const initialData = {
    activeCompanyId,
    firstPage: (firstPageRes.data ?? []) as Array<Record<string, unknown>>,
    pageSize: PAGE_SIZE,
    facets: {
      doc_type: docTypeFacet,
      review_status: reviewFacet,
    },
    filters: {
      projects: (projectsRes.data ?? []) as Array<{ id: string; code: string; name: string }>,
      properties: (propertiesRes.data ?? []) as Array<{
        id: string
        codigo: string | null
        direccion: string | null
        descripcion: string | null
      }>,
      topContrapartes,
    },
    kpis: {
      total: totalCountRes.count ?? 0,
      pendientes: pendientesCountRes.count ?? 0,
      importeMes,
      monthStartIso,
      todayIso,
    },
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-medium uppercase tracking-wide">Documentos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Hub global de todos los documentos del grupo: facturas, nóminas, contratos, escrituras,
          licencias, seguros, modelos fiscales, justificantes y más.
        </p>
      </div>

      <DocumentsHubView initialData={initialData} />
    </div>
  )
}

// Type export para que DocumentsHubView lo importe sin duplicar la forma
export type DocumentsHubInitialData = {
  activeCompanyId: string
  firstPage: Array<Record<string, unknown>>
  pageSize: number
  facets: {
    doc_type: Record<string, number>
    review_status: Record<string, number>
  }
  filters: {
    projects: Array<{ id: string; code: string; name: string }>
    properties: Array<{
      id: string
      codigo: string | null
      direccion: string | null
      descripcion: string | null
    }>
    topContrapartes: Array<{ name: string; nif: string | null; count: number }>
  }
  kpis: {
    total: number
    pendientes: number
    importeMes: number
    monthStartIso: string
    todayIso: string
  }
}
