-- B2 — Writeback de estado a admin_uploads cuando un documento se clasifica y aterriza.
--
-- Problema: tras subir por /admin/upload, el documento se procesa y entra en su tabla
-- tipada (invoices/contratos/...), pero admin_uploads quedaba en status='processing'
-- y doc_type='factura' (default) para siempre — nadie reescribía el estado.
--
-- Solución INDEPENDIENTE del workflow n8n (no toca ningún camino: ni email ni subida):
-- trigger AFTER INSERT en las tablas de documentos que marca la fila de staging
-- admin_uploads (misma file_hash) como 'extracted' + doc_type real.
-- Los documentos de EMAIL no tienen fila en admin_uploads → el UPDATE afecta 0 filas
-- (no les afecta). Idempotente (solo si status uploaded|processing).

CREATE OR REPLACE FUNCTION mark_admin_upload_processed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_doctype text;
BEGIN
  IF NEW.file_hash IS NULL THEN RETURN NEW; END IF;
  v_doctype := CASE TG_TABLE_NAME
    WHEN 'invoices' THEN 'factura'
    WHEN 'documentos_otros' THEN 'otro'
    WHEN 'contratos' THEN 'contrato'
    WHEN 'escrituras' THEN 'escritura'
    WHEN 'certificaciones_obra' THEN 'certificacion'
    WHEN 'certificados' THEN 'certificado'
    WHEN 'albaranes' THEN 'albaran'
    WHEN 'presupuestos' THEN 'presupuesto'
    WHEN 'licencias' THEN 'licencia'
    WHEN 'seguros' THEN 'seguro'
    WHEN 'informes' THEN 'informe'
    WHEN 'modelos_fiscales' THEN 'modelo_fiscal'
    WHEN 'justificantes_pago' THEN 'justificante_pago'
    WHEN 'notas_simples' THEN 'nota_simple'
    WHEN 'payrolls' THEN 'nomina'
    ELSE 'otro'
  END;
  UPDATE admin_uploads
    SET status = 'extracted',
        doc_type = v_doctype,
        extracted_at = COALESCE(extracted_at, now()),
        updated_at = now()
  WHERE file_hash = NEW.file_hash
    AND deleted_at IS NULL
    AND status IN ('uploaded', 'processing');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mark_admin_upload_processed IS
  'B2 26/05/2026 — al insertar un documento clasificado, marca su staging admin_uploads (misma file_hash) como extracted + doc_type. No afecta a documentos de email (sin fila admin_uploads). Idempotente.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices','documentos_otros','contratos','escrituras','certificaciones_obra',
    'certificados','albaranes','presupuestos','licencias','seguros','informes',
    'modelos_fiscales','justificantes_pago','notas_simples','payrolls','documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_mark_admin_upload ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_mark_admin_upload AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION mark_admin_upload_processed()', t);
  END LOOP;
END$$;
