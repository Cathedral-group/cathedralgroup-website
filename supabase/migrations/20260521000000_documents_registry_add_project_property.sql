-- ============================================================================
-- Migration: 20260521000000_documents_registry_add_project_property.sql
-- ----------------------------------------------------------------------------
-- Refactor matview documents_registry: add project_id + property_id columns.
--
-- Necesario para que ficha proyecto (/admin/proyectos/[code]) y ficha
-- propiedad puedan filtrar documentos cross-doc-type vía documents_registry.
--
-- DROP + CREATE: no es posible ALTER MATERIALIZED VIEW para añadir columnas.
-- pg_cron job 'refresh_documents_registry' (jobid=11) sigue activo apuntando
-- a la función refresh_documents_registry() que se recrea con OR REPLACE.
--
-- Validado por doc-validator agent contra docs PG17 + Supabase. Fixes:
--  - GRANT SELECT a authenticated/service_role + REVOKE anon (datos sensibles)
--  - Función refresh con fallback no-CONCURRENT si matview vacía
--  - REFRESH inicial NO-CONCURRENT post-DROP (CONCURRENTLY requiere populated)
-- ============================================================================

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.documents_registry CASCADE;

CREATE MATERIALIZED VIEW public.documents_registry AS
-- INVOICES
SELECT
  'invoices'::TEXT AS source_table,
  i.id AS source_id,
  i.company_id,
  i.project_id,
  NULL::UUID AS property_id,
  CASE
    WHEN i.doc_type = 'rectificativa' THEN 'rectificativa'
    WHEN i.doc_type = 'abono' THEN 'abono'
    WHEN i.doc_type = 'proforma' THEN 'proforma'
    WHEN i.doc_type = 'ticket' THEN 'ticket'
    ELSE 'factura'
  END AS doc_type,
  i.issue_date AS fecha_relevante,
  i.amount_total AS importe_principal,
  COALESCE(i.empresa, i.nombre_receptor) AS contraparte_principal,
  COALESCE(i.supplier_nif, i.nif_receptor) AS contraparte_nif,
  i.file_hash,
  i.ai_confidence,
  i.review_status,
  i.created_at,
  i.deleted_at,
  i.original_filename,
  i.drive_url
FROM public.invoices i
UNION ALL
-- PAYROLLS (sin project_id ni property_id por diseño: nómina pertenece a empleado)
SELECT
  'payrolls', p.id, p.company_id, NULL::UUID, NULL::UUID, 'nomina',
  p.periodo_hasta::date,
  p.liquido_a_percibir,
  p.trabajador_nombre, p.trabajador_nif,
  p.file_hash, p.ai_confidence, p.review_status, p.created_at, p.deleted_at,
  p.original_filename, p.drive_url
FROM public.payrolls p
UNION ALL
-- CONTRATOS
SELECT
  'contratos', c.id, c.company_id, c.project_id, c.property_id, 'contrato',
  COALESCE(c.fecha_firma, c.fecha_inicio),
  COALESCE(c.importe_total, c.importe_periodico),
  NULL::TEXT, NULL::TEXT,
  c.file_hash, c.ai_confidence, c.review_status, c.created_at, c.deleted_at,
  c.original_filename, c.storage_path
FROM public.contratos c
UNION ALL
-- NOTAS SIMPLES (solo property_id por diseño: nota pertenece a finca)
SELECT
  'notas_simples', n.id, n.company_id, NULL::UUID, n.property_id, 'nota_simple',
  n.fecha_expedicion,
  NULL::NUMERIC,
  n.descripcion_finca, NULL::TEXT,
  n.file_hash, n.ai_confidence, n.review_status, n.created_at, n.deleted_at,
  n.original_filename, n.storage_path
FROM public.notas_simples n
UNION ALL
-- ESCRITURAS (solo property_id por diseño: escritura pertenece a inmueble)
SELECT
  'escrituras', e.id, e.company_id, NULL::UUID, e.property_id, 'escritura',
  e.fecha_otorgamiento,
  e.importe_principal,
  e.notario_nombre, e.notario_nif,
  e.file_hash, e.ai_confidence, e.review_status, e.created_at, e.deleted_at,
  e.original_filename, e.storage_path
FROM public.escrituras e
UNION ALL
-- LICENCIAS
SELECT
  'licencias', l.id, l.company_id, l.project_id, l.property_id, 'licencia',
  COALESCE(l.fecha_concesion, l.fecha_solicitud),
  l.total_pagado,
  l.organismo_emisor, NULL::TEXT,
  l.file_hash, l.ai_confidence, l.review_status, l.created_at, l.deleted_at,
  l.original_filename, l.storage_path
FROM public.licencias l
UNION ALL
-- CERTIFICACIONES OBRA (solo project_id por diseño: LOE obra)
SELECT
  'certificaciones_obra', co.id, co.company_id, co.project_id, NULL::UUID, 'certificacion_obra',
  co.fecha_certificacion,
  co.total_a_pagar,
  NULL::TEXT, NULL::TEXT,
  co.file_hash, co.ai_confidence, co.review_status, co.created_at, co.deleted_at,
  co.original_filename, co.storage_path
FROM public.certificaciones_obra co
UNION ALL
-- CERTIFICADOS
SELECT
  'certificados', ce.id, ce.company_id, ce.project_id, ce.property_id, 'certificado',
  ce.fecha_emision,
  ce.importe,
  ce.organismo_o_tecnico, ce.tecnico_nif,
  ce.file_hash, ce.ai_confidence, ce.review_status, ce.created_at, ce.deleted_at,
  ce.original_filename, ce.storage_path
FROM public.certificados ce
UNION ALL
-- INFORMES
SELECT
  'informes', inf.id, inf.company_id, inf.project_id, inf.property_id, 'informe',
  inf.fecha_emision,
  COALESCE(inf.total_informe, inf.valor_mercado),
  inf.emisor, inf.emisor_nif,
  inf.file_hash, inf.ai_confidence, inf.review_status, inf.created_at, inf.deleted_at,
  inf.original_filename, inf.storage_path
FROM public.informes inf
UNION ALL
-- SEGUROS
SELECT
  'seguros', s.id, s.company_id, s.project_id, s.property_id, 'seguro',
  s.fecha_efecto,
  s.prima_total,
  s.aseguradora, s.aseguradora_nif,
  s.file_hash, s.ai_confidence, s.review_status, s.created_at, s.deleted_at,
  s.original_filename, s.storage_path
FROM public.seguros s
UNION ALL
-- MODELOS FISCALES (gasto global empresa: ni project_id ni property_id)
SELECT
  'modelos_fiscales', mf.id, mf.company_id, NULL::UUID, NULL::UUID, 'modelo_fiscal',
  mf.fecha_presentacion,
  mf.importe_resultado,
  'AEAT'::TEXT, NULL::TEXT,
  mf.file_hash, mf.ai_confidence, mf.review_status, mf.created_at, mf.deleted_at,
  mf.original_filename, mf.storage_path
FROM public.modelos_fiscales mf
UNION ALL
-- JUSTIFICANTES PAGO (hub conciliación: vinculan a invoice/payroll/modelo)
SELECT
  'justificantes_pago', jp.id, jp.company_id, NULL::UUID, NULL::UUID, 'justificante_pago',
  jp.fecha_operacion,
  jp.importe,
  jp.beneficiario_nombre, jp.beneficiario_nif,
  jp.file_hash, jp.ai_confidence, jp.review_status, jp.created_at, jp.deleted_at,
  jp.original_filename, jp.storage_path
FROM public.justificantes_pago jp
UNION ALL
-- ALBARANES
SELECT
  'albaranes', a.id, a.company_id, a.project_id, a.property_id, 'albaran',
  a.fecha_albaran,
  a.subtotal_sin_iva,
  a.proveedor_nombre, a.proveedor_nif,
  a.file_hash, a.ai_confidence, a.review_status, a.created_at, a.deleted_at,
  a.original_filename, a.storage_path
FROM public.albaranes a
UNION ALL
-- PRESUPUESTOS
SELECT
  'presupuestos', pr.id, pr.company_id, pr.project_id, pr.property_id, 'presupuesto',
  pr.fecha_emision,
  pr.total,
  pr.destinatario_nombre, pr.destinatario_nif,
  pr.file_hash, pr.ai_confidence, pr.review_status, pr.created_at, pr.deleted_at,
  pr.original_filename, pr.storage_path
FROM public.presupuestos pr
UNION ALL
-- DOCUMENTOS OTROS (fallback)
SELECT
  'documentos_otros', do_.id, do_.company_id, do_.project_id, do_.property_id, 'otro',
  COALESCE(do_.fecha_relevante, do_.fecha_emision),
  (SELECT MAX(v) FROM unnest(do_.importes_mencionados) v),
  array_to_string(do_.partes_mencionadas, ' / '), NULL::TEXT,
  do_.file_hash, do_.ai_confidence, do_.review_status, do_.created_at, do_.deleted_at,
  do_.original_filename, do_.storage_path
FROM public.documentos_otros do_;

-- ============================================================================
-- INDEXES (UNIQUE necesario para REFRESH CONCURRENTLY)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_registry_source
  ON public.documents_registry(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_documents_registry_company
  ON public.documents_registry(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_registry_doc_type
  ON public.documents_registry(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_registry_fecha
  ON public.documents_registry(fecha_relevante DESC);
CREATE INDEX IF NOT EXISTS idx_documents_registry_review
  ON public.documents_registry(review_status);
CREATE INDEX IF NOT EXISTS idx_documents_registry_contraparte_nif
  ON public.documents_registry(contraparte_nif);
CREATE INDEX IF NOT EXISTS idx_documents_registry_file_hash
  ON public.documents_registry(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_registry_created
  ON public.documents_registry(created_at DESC);
-- NUEVOS indexes para lookups project/property
CREATE INDEX IF NOT EXISTS idx_documents_registry_project
  ON public.documents_registry(project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_registry_property
  ON public.documents_registry(property_id)
  WHERE property_id IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- FUNCTION REFRESH (con fallback no-CONCURRENT si vacía)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_documents_registry()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- CONCURRENTLY requiere matview populated. Fallback no-concurrent si vacía
  -- (caso DROP manual sin REFRESH inicial)
  IF EXISTS (SELECT 1 FROM public.documents_registry LIMIT 1) THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.documents_registry;
  ELSE
    REFRESH MATERIALIZED VIEW public.documents_registry;
  END IF;
END;
$$;

-- EXECUTE solo service_role (pg_cron + edge functions). anon/authenticated NO:
-- evita DoS via /rest/v1/rpc/refresh_documents_registry (Supabase advisor WARN).
REVOKE EXECUTE ON FUNCTION public.refresh_documents_registry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_documents_registry() TO service_role;

-- ============================================================================
-- GRANTS matview (PostgREST + RLS caveat — ver docs Supabase Lint 0016)
-- Datos sensibles: solo authenticated + service_role. anon REVOKED.
-- ============================================================================
GRANT SELECT ON public.documents_registry TO authenticated, service_role;
REVOKE SELECT ON public.documents_registry FROM anon;

-- ============================================================================
-- POPULATE inicial (CONCURRENTLY no funciona en primera población post-DROP)
-- ============================================================================
REFRESH MATERIALIZED VIEW public.documents_registry;

COMMENT ON MATERIALIZED VIEW public.documents_registry IS
  'Vista materializada cross-doc-type para búsqueda global. Incluye project_id + property_id para drilldown en ficha proyecto/inmueble. Refrescar con SELECT refresh_documents_registry() — pg_cron jobid=11 lo hace */5 min. RLS no aplica (matview limitation, ver Supabase Lint 0016) — anon revocado, authenticated/service_role pueden leer.';

COMMIT;
