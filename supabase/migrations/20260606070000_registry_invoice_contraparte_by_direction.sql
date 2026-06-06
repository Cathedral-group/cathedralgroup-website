-- Fix etiquetado de contraparte en documents_registry para facturas (David 06/06):
-- los avisos de facturas vencidas mostraban "Cathedral House Investment S.L." (la propia
-- empresa receptora) en facturas RECIBIDAS cuyo `empresa` (nombre del proveedor) no se
-- extrajo (NULL) — porque la vista hacía COALESCE(empresa, nombre_receptor) y el receptor
-- de una factura recibida es Cathedral. Resultado: varios proveedores (p.ej. Hetzner)
-- aparecían como la propia empresa → confusión.
--
-- Fix: la contraparte depende de la dirección.
--   recibida  → proveedor:  COALESCE(empresa, supplier_nif)   (nunca el receptor = uno mismo)
--   emitida   → cliente:     COALESCE(nombre_receptor, empresa)
-- (Si falta el nombre del proveedor se muestra su NIF, que es correcto, en vez del nombre
--  de la propia empresa. El nombre se rellenará al mejorar la extracción/backfill.)
--
-- CREATE OR REPLACE (no DROP): preserva grants y dependencias. Se re-declara
-- security_invoker=true (regla anti-regresión). Solo cambia la expresión
-- contraparte_principal de la rama `invoices`; el resto es idéntico a 20260606060000.

CREATE OR REPLACE VIEW public.documents_registry
WITH (security_invoker = true) AS
 SELECT 'invoices'::text AS source_table,
    i.id AS source_id,
    i.company_id,
    i.project_id,
    NULL::uuid AS property_id,
    i.due_date AS fecha_vencimiento,
        CASE
            WHEN i.doc_type = 'rectificativa'::text THEN 'rectificativa'::text
            WHEN i.doc_type = 'abono'::text THEN 'abono'::text
            WHEN i.doc_type = 'proforma'::text THEN 'proforma'::text
            WHEN i.doc_type = 'ticket'::text THEN 'ticket'::text
            ELSE 'factura'::text
        END AS doc_type,
    i.issue_date AS fecha_relevante,
    i.amount_total AS importe_principal,
    CASE WHEN i.direction = 'recibida' THEN COALESCE(i.empresa, i.supplier_nif)
         ELSE COALESCE(i.nombre_receptor, i.empresa) END AS contraparte_principal,
    COALESCE(i.supplier_nif, i.nif_receptor) AS contraparte_nif,
    i.file_hash,
    i.ai_confidence,
    i.review_status,
    i.created_at,
    i.deleted_at,
    i.original_filename,
    i.drive_url,
    i.storage_path
   FROM invoices i
UNION ALL
 SELECT 'payrolls'::text AS source_table,
    p.id AS source_id,
    p.company_id,
    NULL::uuid AS project_id,
    NULL::uuid AS property_id,
    NULL::date AS fecha_vencimiento,
    'nomina'::text AS doc_type,
    p.periodo_hasta AS fecha_relevante,
    p.liquido_a_percibir AS importe_principal,
    p.trabajador_nombre AS contraparte_principal,
    p.trabajador_nif AS contraparte_nif,
    p.file_hash,
    p.ai_confidence,
    p.review_status,
    p.created_at,
    p.deleted_at,
    p.original_filename,
    p.drive_url,
    p.storage_path
   FROM payrolls p
UNION ALL
 SELECT 'contratos'::text AS source_table,
    c.id AS source_id,
    c.company_id,
    c.project_id,
    c.property_id,
    c.fecha_fin AS fecha_vencimiento,
    'contrato'::text AS doc_type,
    COALESCE(c.fecha_firma, c.fecha_inicio) AS fecha_relevante,
    COALESCE(c.importe_total, c.importe_periodico) AS importe_principal,
    NULL::text AS contraparte_principal,
    NULL::text AS contraparte_nif,
    c.file_hash,
    c.ai_confidence,
    c.review_status,
    c.created_at,
    c.deleted_at,
    c.original_filename,
    c.drive_url,
    c.storage_path
   FROM contratos c
UNION ALL
 SELECT 'notas_simples'::text AS source_table,
    n.id AS source_id,
    n.company_id,
    NULL::uuid AS project_id,
    n.property_id,
    n.fecha_vigencia AS fecha_vencimiento,
    'nota_simple'::text AS doc_type,
    n.fecha_expedicion AS fecha_relevante,
    NULL::numeric AS importe_principal,
    n.descripcion_finca AS contraparte_principal,
    NULL::text AS contraparte_nif,
    n.file_hash,
    n.ai_confidence,
    n.review_status,
    n.created_at,
    n.deleted_at,
    n.original_filename,
    n.drive_url,
    n.storage_path
   FROM notas_simples n
UNION ALL
 SELECT 'escrituras'::text AS source_table,
    e.id AS source_id,
    e.company_id,
    NULL::uuid AS project_id,
    e.property_id,
    NULL::date AS fecha_vencimiento,
    'escritura'::text AS doc_type,
    e.fecha_otorgamiento AS fecha_relevante,
    e.importe_principal,
    e.notario_nombre AS contraparte_principal,
    e.notario_nif AS contraparte_nif,
    e.file_hash,
    e.ai_confidence,
    e.review_status,
    e.created_at,
    e.deleted_at,
    e.original_filename,
    e.drive_url,
    e.storage_path
   FROM escrituras e
UNION ALL
 SELECT 'licencias'::text AS source_table,
    l.id AS source_id,
    l.company_id,
    l.project_id,
    l.property_id,
    l.fecha_caducidad AS fecha_vencimiento,
    'licencia'::text AS doc_type,
    COALESCE(l.fecha_concesion, l.fecha_solicitud) AS fecha_relevante,
    l.total_pagado AS importe_principal,
    l.organismo_emisor AS contraparte_principal,
    NULL::text AS contraparte_nif,
    l.file_hash,
    l.ai_confidence,
    l.review_status,
    l.created_at,
    l.deleted_at,
    l.original_filename,
    l.drive_url,
    l.storage_path
   FROM licencias l
UNION ALL
 SELECT 'certificaciones_obra'::text AS source_table,
    co.id AS source_id,
    co.company_id,
    co.project_id,
    NULL::uuid AS property_id,
    NULL::date AS fecha_vencimiento,
    'certificacion_obra'::text AS doc_type,
    co.fecha_certificacion AS fecha_relevante,
    co.total_a_pagar AS importe_principal,
    NULL::text AS contraparte_principal,
    NULL::text AS contraparte_nif,
    co.file_hash,
    co.ai_confidence,
    co.review_status,
    co.created_at,
    co.deleted_at,
    co.original_filename,
    co.drive_url,
    co.storage_path
   FROM certificaciones_obra co
UNION ALL
 SELECT 'certificados'::text AS source_table,
    ce.id AS source_id,
    ce.company_id,
    ce.project_id,
    ce.property_id,
    ce.fecha_caducidad AS fecha_vencimiento,
    'certificado'::text AS doc_type,
    ce.fecha_emision AS fecha_relevante,
    ce.importe AS importe_principal,
    ce.organismo_o_tecnico AS contraparte_principal,
    ce.tecnico_nif AS contraparte_nif,
    ce.file_hash,
    ce.ai_confidence,
    ce.review_status,
    ce.created_at,
    ce.deleted_at,
    ce.original_filename,
    ce.drive_url,
    ce.storage_path
   FROM certificados ce
UNION ALL
 SELECT 'informes'::text AS source_table,
    inf.id AS source_id,
    inf.company_id,
    inf.project_id,
    inf.property_id,
    inf.fecha_vigencia AS fecha_vencimiento,
    'informe'::text AS doc_type,
    inf.fecha_emision AS fecha_relevante,
    COALESCE(inf.total_informe, inf.valor_mercado) AS importe_principal,
    inf.emisor AS contraparte_principal,
    inf.emisor_nif AS contraparte_nif,
    inf.file_hash,
    inf.ai_confidence,
    inf.review_status,
    inf.created_at,
    inf.deleted_at,
    inf.original_filename,
    inf.drive_url,
    inf.storage_path
   FROM informes inf
UNION ALL
 SELECT 'seguros'::text AS source_table,
    s.id AS source_id,
    s.company_id,
    s.project_id,
    s.property_id,
    s.fecha_vencimiento,
    'seguro'::text AS doc_type,
    s.fecha_efecto AS fecha_relevante,
    s.prima_total AS importe_principal,
    s.aseguradora AS contraparte_principal,
    s.aseguradora_nif AS contraparte_nif,
    s.file_hash,
    s.ai_confidence,
    s.review_status,
    s.created_at,
    s.deleted_at,
    s.original_filename,
    s.drive_url,
    s.storage_path
   FROM seguros s
UNION ALL
 SELECT 'modelos_fiscales'::text AS source_table,
    mf.id AS source_id,
    mf.company_id,
    NULL::uuid AS project_id,
    NULL::uuid AS property_id,
    NULL::date AS fecha_vencimiento,
    'modelo_fiscal'::text AS doc_type,
    mf.fecha_presentacion AS fecha_relevante,
    mf.importe_resultado AS importe_principal,
    'AEAT'::text AS contraparte_principal,
    NULL::text AS contraparte_nif,
    mf.file_hash,
    mf.ai_confidence,
    mf.review_status,
    mf.created_at,
    mf.deleted_at,
    mf.original_filename,
    mf.drive_url,
    mf.storage_path
   FROM modelos_fiscales mf
UNION ALL
 SELECT 'justificantes_pago'::text AS source_table,
    jp.id AS source_id,
    jp.company_id,
    NULL::uuid AS project_id,
    NULL::uuid AS property_id,
    NULL::date AS fecha_vencimiento,
    'justificante_pago'::text AS doc_type,
    jp.fecha_operacion AS fecha_relevante,
    jp.importe AS importe_principal,
    jp.beneficiario_nombre AS contraparte_principal,
    jp.beneficiario_nif AS contraparte_nif,
    jp.file_hash,
    jp.ai_confidence,
    jp.review_status,
    jp.created_at,
    jp.deleted_at,
    jp.original_filename,
    jp.drive_url,
    jp.storage_path
   FROM justificantes_pago jp
UNION ALL
 SELECT 'albaranes'::text AS source_table,
    a.id AS source_id,
    a.company_id,
    a.project_id,
    a.property_id,
    NULL::date AS fecha_vencimiento,
    'albaran'::text AS doc_type,
    a.fecha_albaran AS fecha_relevante,
    a.subtotal_sin_iva AS importe_principal,
    a.proveedor_nombre AS contraparte_principal,
    a.proveedor_nif AS contraparte_nif,
    a.file_hash,
    a.ai_confidence,
    a.review_status,
    a.created_at,
    a.deleted_at,
    a.original_filename,
    a.drive_url,
    a.storage_path
   FROM albaranes a
UNION ALL
 SELECT 'presupuestos'::text AS source_table,
    pr.id AS source_id,
    pr.company_id,
    pr.project_id,
    pr.property_id,
    pr.fecha_validez AS fecha_vencimiento,
    'presupuesto'::text AS doc_type,
    pr.fecha_emision AS fecha_relevante,
    pr.total AS importe_principal,
    pr.destinatario_nombre AS contraparte_principal,
    pr.destinatario_nif AS contraparte_nif,
    pr.file_hash,
    pr.ai_confidence,
    pr.review_status,
    pr.created_at,
    pr.deleted_at,
    pr.original_filename,
    pr.drive_url,
    pr.storage_path
   FROM presupuestos pr
UNION ALL
 SELECT 'documentos_otros'::text AS source_table,
    do_.id AS source_id,
    do_.company_id,
    do_.project_id,
    do_.property_id,
    NULL::date AS fecha_vencimiento,
    'otro'::text AS doc_type,
    COALESCE(do_.fecha_relevante, do_.fecha_emision) AS fecha_relevante,
    ( SELECT max(v.v) AS max
           FROM unnest(do_.importes_mencionados) v(v)) AS importe_principal,
    array_to_string(do_.partes_mencionadas, ' / '::text) AS contraparte_principal,
    NULL::text AS contraparte_nif,
    do_.file_hash,
    do_.ai_confidence,
    do_.review_status,
    do_.created_at,
    do_.deleted_at,
    do_.original_filename,
    do_.drive_url,
    do_.storage_path
   FROM documentos_otros do_;

GRANT SELECT ON public.documents_registry TO service_role;

NOTIFY pgrst, 'reload schema';
