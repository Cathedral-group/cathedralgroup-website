/**
 * Documentos del proyecto — feed del tab "Documentos" en ficha proyecto.
 *
 * GET /api/admin/proyectos/[code]/documentos
 *   Devuelve { items: RegistryItem[] } normalizando 3 fuentes:
 *     - invoices  → origin='project'
 *     - quotes    → origin='project'
 *     - documents → origin='project' si project_id, origin='property' si property_id del proyecto
 *
 *   Forward-compat: cuando exista la matview `documents_registry`
 *   (schema multi-doc_type 19-20/05/2026), usarla preferentemente.
 *
 * Auth: admin allow-list + AAL2 + company-scoped al proyecto.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabaseClient, createAdminSupabaseClient, fetchAllRows } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/auth-allowlist'
import {
  resolveCompanyIdForRequest,
  getCompanyContextFromUser,
  CATHEDRAL_INVESTMENT_SL_ID,
} from '@/lib/company-context'

interface RegistryItem {
  id: string
  source_table: 'invoices' | 'quotes' | 'documents'
  doc_type: string | null
  doc_category: string | null
  number: string | null
  titulo: string | null
  empresa: string | null
  supplier_nif: string | null
  concept: string | null
  importe: number | null
  fecha: string | null
  fecha_vencimiento: string | null
  direction: string | null
  payment_status: string | null
  review_status: string | null
  needs_review: boolean | null
  ai_confidence: number | null
  drive_url: string | null
  original_filename: string | null
  origin: 'project' | 'property'
  edit_path: string
}

async function authCheck() {
  const authClient = await createServerSupabaseClient()
  const { data, error } = await authClient.auth.getUser()
  if (error || !data?.user) return null
  if (!isAdminEmail(data.user.email)) return null
  const { data: aal, error: aalError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aal || aal.currentLevel !== 'aal2') return null
  return data.user
}

async function resolveCompanyAndProject(user: User, request: NextRequest, code: string) {
  let activeCompanyId: string | null = null
  try {
    activeCompanyId = resolveCompanyIdForRequest(user, request.headers)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden', status: 403 as const }
  }
  if (!activeCompanyId) {
    const ctx = getCompanyContextFromUser(user)
    activeCompanyId = ctx?.active_company_id ?? CATHEDRAL_INVESTMENT_SL_ID
  }

  const supabase = createAdminSupabaseClient()
  // `property_id` puede no existir aún en el row (schema multi-doc_type 19-20/05/2026).
  // Pedimos `*` y leemos defensivamente.
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('code', code)
    .eq('company_id', activeCompanyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (projectError || !project) {
    return { error: 'Proyecto no encontrado', status: 404 as const }
  }
  return { activeCompanyId, project, supabase }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const user = await authCheck()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const resolved = await resolveCompanyAndProject(user, request, code)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  const { project, supabase } = resolved
  const projectId = project.id as string
  const propertyId = (project as { property_id?: string | null }).property_id ?? null

  /* ─────────── Fuente preferida: matview `documents_registry` ───────────
   * Esquema esperado (per schema multi-doc_type 19-20/05/2026):
   *   id, source_table, doc_type, doc_category, project_id, property_id,
   *   number, titulo, empresa, supplier_nif, concept, importe, fecha,
   *   fecha_vencimiento, direction, payment_status, review_status,
   *   needs_review, ai_confidence, drive_url, original_filename, deleted_at
   *
   * Si la matview no existe (instalaciones pre-migración) el error se ignora
   * silenciosamente y caemos al fallback.
   */
  try {
    let registryQuery = supabase
      .from('documents_registry')
      .select('*')
      .is('deleted_at', null)
    if (propertyId) {
      registryQuery = registryQuery.or(`project_id.eq.${projectId},property_id.eq.${propertyId}`)
    } else {
      registryQuery = registryQuery.eq('project_id', projectId)
    }
    const { data: registryRows, error: registryError } = await registryQuery.order('fecha_relevante', {
      ascending: false,
      nullsFirst: false,
    })

    if (!registryError && registryRows) {
      const items: RegistryItem[] = registryRows.map((r: Record<string, unknown>) => {
        const sourceTable = (r.source_table as RegistryItem['source_table']) ?? 'documents'
        const fromProperty = propertyId && r.property_id === propertyId && r.project_id !== projectId
        // El matview documents_registry usa nombres propios (source_id,
        // importe_principal, contraparte_*, fecha_relevante) y NO expone
        // number/direction/payment_status/doc_category/needs_review/titulo/concept → null.
        const sid = String(r.source_id)
        return {
          id: sid,
          source_table: sourceTable,
          doc_type: (r.doc_type as string) ?? null,
          doc_category: null,
          number: null,
          titulo: null,
          empresa: (r.contraparte_principal as string) ?? null,
          supplier_nif: (r.contraparte_nif as string) ?? null,
          concept: null,
          importe: r.importe_principal == null ? null : Number(r.importe_principal),
          fecha: (r.fecha_relevante as string) ?? null,
          fecha_vencimiento: (r.fecha_vencimiento as string) ?? null,
          direction: null,
          payment_status: null,
          review_status: (r.review_status as string) ?? null,
          needs_review: null,
          ai_confidence: r.ai_confidence == null ? null : Number(r.ai_confidence),
          // El matview expone el puntero de archivo en `drive_url`, pero para los
          // doc-types no factura/nómina ahí va el storage_path (ruta relativa) → SIEMPRE
          // servir por el endpoint (Storage firmado o redirect Drive). null si no hay archivo.
          drive_url: r.drive_url
            ? `/api/admin/documentos/file?table=${encodeURIComponent(sourceTable)}&id=${encodeURIComponent(sid)}`
            : null,
          original_filename: (r.original_filename as string) ?? null,
          origin: fromProperty ? 'property' : 'project',
          edit_path: editPathFor(sourceTable, sid),
        }
      })
      return NextResponse.json({ items, source: 'documents_registry' })
    }
  } catch {
    // matview no disponible — usar fallback
  }

  /* ─────────── Fallback: union manual invoices + quotes + documents ─────────── */

  const [invoicesRes, quotesRes, documentsByProjectRes, documentsByPropertyRes] = await Promise.all([
    fetchAllRows((sb) =>
      sb
        .from('invoices')
        .select(
          'id, number, concept, direction, doc_type, amount_total, payment_status, issue_date, due_date, supplier_nif, empresa, ai_confidence, needs_review, review_status, drive_url, original_filename',
        )
        .eq('project_id', projectId)
        .is('deleted_at', null),
    ),
    fetchAllRows((sb) =>
      sb
        .from('quotes')
        .select(
          'id, number, concept, direction, total, valid_until, supplier_nif, empresa, ai_confidence, needs_review, review_status, drive_url, original_filename, status, issue_date',
        )
        .eq('project_id', projectId)
        .is('deleted_at', null),
    ),
    fetchAllRows((sb) =>
      sb
        .from('documents')
        .select(
          'id, titulo, doc_type, doc_category, fecha_documento, fecha_vencimiento, importe, ai_confidence, needs_review, drive_url, original_filename, resumen_ia',
        )
        .eq('project_id', projectId)
        .is('deleted_at', null),
    ),
    propertyId
      ? fetchAllRows((sb) =>
          sb
            .from('documents')
            .select(
              'id, titulo, doc_type, doc_category, fecha_documento, fecha_vencimiento, importe, ai_confidence, needs_review, drive_url, original_filename, resumen_ia',
            )
            .eq('property_id', propertyId)
            .is('deleted_at', null),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ])

  const items: RegistryItem[] = []

  for (const i of invoicesRes as Record<string, unknown>[]) {
    items.push({
      id: String(i.id),
      source_table: 'invoices',
      doc_type: (i.doc_type as string) ?? 'factura',
      doc_category: 'facturas',
      number: (i.number as string) ?? null,
      titulo: null,
      empresa: (i.empresa as string) ?? null,
      supplier_nif: (i.supplier_nif as string) ?? null,
      concept: (i.concept as string) ?? null,
      importe: i.amount_total == null ? null : Number(i.amount_total),
      fecha: (i.issue_date as string) ?? null,
      fecha_vencimiento: (i.due_date as string) ?? null,
      direction: (i.direction as string) ?? null,
      payment_status: (i.payment_status as string) ?? null,
      review_status: (i.review_status as string) ?? null,
      needs_review: (i.needs_review as boolean) ?? null,
      ai_confidence: i.ai_confidence == null ? null : Number(i.ai_confidence),
      drive_url: (i.drive_url as string) ?? null,
      original_filename: (i.original_filename as string) ?? null,
      origin: 'project',
      edit_path: `/admin/facturas?id=${i.id}`,
    })
  }

  for (const q of quotesRes as Record<string, unknown>[]) {
    items.push({
      id: String(q.id),
      source_table: 'quotes',
      doc_type: 'presupuesto',
      doc_category: 'presupuestos',
      number: (q.number as string) ?? null,
      titulo: null,
      empresa: (q.empresa as string) ?? null,
      supplier_nif: (q.supplier_nif as string) ?? null,
      concept: (q.concept as string) ?? null,
      importe: q.total == null ? null : Number(q.total),
      fecha: (q.issue_date as string) ?? null,
      fecha_vencimiento: (q.valid_until as string) ?? null,
      direction: (q.direction as string) ?? null,
      payment_status: null,
      review_status: (q.review_status as string) ?? null,
      needs_review: (q.needs_review as boolean) ?? null,
      ai_confidence: q.ai_confidence == null ? null : Number(q.ai_confidence),
      drive_url: (q.drive_url as string) ?? null,
      original_filename: (q.original_filename as string) ?? null,
      origin: 'project',
      edit_path: `/admin/presupuestos?id=${q.id}`,
    })
  }

  for (const d of documentsByProjectRes as Record<string, unknown>[]) {
    items.push({
      id: String(d.id),
      source_table: 'documents',
      doc_type: (d.doc_type as string) ?? null,
      doc_category: (d.doc_category as string) ?? null,
      number: null,
      titulo: (d.titulo as string) ?? null,
      empresa: null,
      supplier_nif: null,
      concept: (d.resumen_ia as string) ?? null,
      importe: d.importe == null ? null : Number(d.importe),
      fecha: (d.fecha_documento as string) ?? null,
      fecha_vencimiento: (d.fecha_vencimiento as string) ?? null,
      direction: null,
      payment_status: null,
      review_status: null,
      needs_review: (d.needs_review as boolean) ?? null,
      ai_confidence: d.ai_confidence == null ? null : Number(d.ai_confidence),
      drive_url: (d.drive_url as string) ?? null,
      original_filename: (d.original_filename as string) ?? null,
      origin: 'project',
      edit_path: `/admin/revision?cat=documentos_pendientes&id=${d.id}`,
    })
  }

  for (const d of documentsByPropertyRes as Record<string, unknown>[]) {
    items.push({
      id: String(d.id),
      source_table: 'documents',
      doc_type: (d.doc_type as string) ?? null,
      doc_category: (d.doc_category as string) ?? null,
      number: null,
      titulo: (d.titulo as string) ?? null,
      empresa: null,
      supplier_nif: null,
      concept: (d.resumen_ia as string) ?? null,
      importe: d.importe == null ? null : Number(d.importe),
      fecha: (d.fecha_documento as string) ?? null,
      fecha_vencimiento: (d.fecha_vencimiento as string) ?? null,
      direction: null,
      payment_status: null,
      review_status: null,
      needs_review: (d.needs_review as boolean) ?? null,
      ai_confidence: d.ai_confidence == null ? null : Number(d.ai_confidence),
      drive_url: (d.drive_url as string) ?? null,
      original_filename: (d.original_filename as string) ?? null,
      origin: 'property',
      edit_path: `/admin/revision?cat=documentos_pendientes&id=${d.id}`,
    })
  }

  // Orden estable: fecha DESC, fallback original_filename
  items.sort((a, b) => {
    const da = a.fecha ?? ''
    const db = b.fecha ?? ''
    if (da !== db) return db.localeCompare(da)
    return (a.original_filename ?? '').localeCompare(b.original_filename ?? '')
  })

  return NextResponse.json({ items, source: 'union' })
}

function editPathFor(source: RegistryItem['source_table'], id: string): string {
  if (source === 'invoices') return `/admin/facturas?id=${id}`
  if (source === 'quotes') return `/admin/presupuestos?id=${id}`
  return `/admin/revision?cat=documentos_pendientes&id=${id}`
}

export const dynamic = 'force-dynamic'
