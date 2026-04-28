-- Backfill arquitectural (sesión 27, 28/04/2026)
--
-- Mueve registros que viven en `invoices` a las tablas correctas según su
-- tipo de documento. El workflow histórico metía TODO en invoices; con la
-- Etapa B de hoy, quotes/documents/tax_filings tienen las columnas IA
-- necesarias para recibir estos registros con trazabilidad completa.
--
-- A mover:
--   doc_type='presupuesto'          (113) → quotes      (108 emitidos + 5 recibidos)
--   doc_type='contrato'             (33)  → documents   (doc_category='legal')
--   doc_type='nota_simple'          (5)   → documents   (doc_category='legal')
--   doc_type='escritura'            (3)   → documents   (doc_category='legal')
--   doc_type='albaran'              (3)   → documents   (doc_category='corporativo')
--   doc_type='seguro'               (1)   → documents   (doc_category='seguros')
--
-- A NO mover (decisión consciente):
--   doc_type='factura'              (338) → quedan en invoices
--   doc_type='proforma'             (4)   → quedan en invoices
--   doc_type='rectificativa'        (4)   → quedan en invoices
--   doc_type='certificacion'        (12)  → quedan en invoices (cobros parciales)
--   doc_type='otro'                 (173) → quedan para reclasificación humana
--   doc_type='modelo_fiscal'        (1)   → queda (datos insuficientes para tax_filings)
--
-- Estrategia:
--   1. INSERT en tabla destino con UUID nuevo (no reusar el de invoices para
--      evitar colisiones futuras y mantener trazabilidad clara)
--   2. UPDATE invoices.deleted_at = NOW() para soft-delete (NO HARD DELETE — si
--      necesitamos recuperar, el dump diario tiene el registro original)
--   3. Marca en notes referencia al ID destino para auditoría
--
-- Verificación:
--   pre-migración: SELECT count(*) FROM invoices WHERE doc_type IN (...) AND deleted_at IS NULL;
--   post-migración: SELECT count(*) FROM quotes; SELECT count(*) FROM documents;
--                   El total nuevo debe coincidir con lo movido.

-- Tabla de audit trail (creada antes del BEGIN para que sea persistente)
CREATE TABLE IF NOT EXISTS public._backfill_log (
  id BIGSERIAL PRIMARY KEY,
  table_to TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  moved_count INTEGER NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public._backfill_log IS 'Audit trail de migraciones de backfill arquitectural (sesión 27 y futuras)';

BEGIN;

-- ── 1. Mover presupuestos a quotes ───────────────────────────────────
WITH moved_quotes AS (
  INSERT INTO public.quotes (
    number, direction, status, source,
    client_id, project_id, supplier_id, supplier_nif, empresa, concept, direccion_obra,
    issue_date, valid_until,
    items, subtotal, vat_total, total,
    ai_confidence, ai_data, ai_razones, resumen_ia,
    needs_review, review_status, reviewed_at, reviewed_by,
    email_message_id, email_account, file_hash, drive_url, drive_file_id, original_filename,
    proyecto_code, proyecto_sugerido_code, proyecto_sugerido_razon, proyecto_confianza,
    num_pedido, iban_proveedor, plazo_pago_dias, idioma, moneda_original,
    notes, created_at, updated_at
  )
  SELECT
    COALESCE(NULLIF(TRIM(number), ''), 'AUTO-' || EXTRACT(EPOCH FROM created_at)::bigint::text),
    direction,
    CASE review_status
      WHEN 'confirmado' THEN 'aceptado'
      WHEN 'rechazado'  THEN 'rechazado'
      ELSE 'borrador'
    END,
    COALESCE(source, 'subida_manual'),
    client_id, project_id, supplier_id, supplier_nif, empresa, concept, direccion_obra,
    issue_date, validez_hasta,
    COALESCE(lineas, '[]'::jsonb),
    amount_base, vat_amount, amount_total,
    ai_confidence, ai_data, ai_razones, resumen_ia,
    COALESCE(needs_review, false),
    COALESCE(review_status, 'pendiente'),
    reviewed_at, reviewed_by,
    email_message_id, email_account, file_hash, drive_url, drive_file_id, original_filename,
    proyecto_code, proyecto_sugerido_code, proyecto_sugerido_razon, proyecto_confianza,
    num_pedido, iban_proveedor, plazo_pago_dias, idioma, moneda_original,
    notes, created_at, updated_at
  FROM public.invoices
  WHERE doc_type = 'presupuesto' AND deleted_at IS NULL
  RETURNING id, file_hash, email_message_id, original_filename
)
INSERT INTO public._backfill_log (table_to, source_table, source_count, moved_count, moved_at)
SELECT 'quotes', 'invoices', (SELECT count(*) FROM public.invoices WHERE doc_type='presupuesto' AND deleted_at IS NULL),
       (SELECT count(*) FROM moved_quotes), NOW();

-- Soft-delete los presupuestos en invoices
UPDATE public.invoices
SET deleted_at = NOW(),
    notes = COALESCE(notes || E'\n', '') || '[Backfill 28/04/2026] Movido a tabla quotes'
WHERE doc_type = 'presupuesto' AND deleted_at IS NULL;


-- ── 2. Mover contratos/escrituras/notas/albaranes/seguros a documents ──
WITH moved_docs AS (
  INSERT INTO public.documents (
    doc_type, doc_category,
    project_id, client_id, supplier_id,
    filename, original_filename, file_hash, drive_url, drive_file_id,
    email_account, email_message_id, source,
    titulo, importe, fecha_documento, fecha_vencimiento,
    resumen_ia, datos_extraidos,
    ai_confidence, needs_review, proyecto_code,
    notes, ai_summary, created_at
  )
  SELECT
    doc_type,
    CASE doc_type
      WHEN 'contrato'    THEN 'legal'
      WHEN 'nota_simple' THEN 'legal'
      WHEN 'escritura'   THEN 'legal'
      WHEN 'albaran'     THEN 'corporativo'
      WHEN 'seguro'      THEN 'seguros'
      ELSE 'corporativo'
    END,
    project_id, client_id, supplier_id,
    original_filename, original_filename, file_hash, drive_url, drive_file_id,
    email_account, email_message_id, COALESCE(source, 'subida_manual'),
    COALESCE(NULLIF(TRIM(empresa), ''), NULLIF(TRIM(concept), ''), 'Documento sin título'),
    amount_total, issue_date, due_date,
    resumen_ia,
    ai_data,
    ai_confidence, COALESCE(needs_review, false), proyecto_code,
    notes, NULL, created_at
  FROM public.invoices
  WHERE doc_type IN ('contrato','nota_simple','escritura','albaran','seguro')
    AND deleted_at IS NULL
  RETURNING id, doc_type, file_hash
)
INSERT INTO public._backfill_log (table_to, source_table, source_count, moved_count, moved_at)
SELECT 'documents', 'invoices',
       (SELECT count(*) FROM public.invoices WHERE doc_type IN ('contrato','nota_simple','escritura','albaran','seguro') AND deleted_at IS NULL),
       (SELECT count(*) FROM moved_docs), NOW();

-- Soft-delete los registros movidos
UPDATE public.invoices
SET deleted_at = NOW(),
    notes = COALESCE(notes || E'\n', '') || '[Backfill 28/04/2026] Movido a tabla documents'
WHERE doc_type IN ('contrato','nota_simple','escritura','albaran','seguro')
  AND deleted_at IS NULL;

COMMIT;
