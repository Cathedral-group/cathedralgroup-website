-- Reconciliación admin_uploads.status — cierra el hueco del trigger B2
--
-- Bug: el trigger trg_mark_admin_upload (migración 20260526010000) solo dispara
-- en INSERT. Si el pipeline n8n detecta duplicado por file_hash y aborta el
-- INSERT, admin_uploads.status queda en 'processing' para siempre aunque el
-- documento YA exista en su tabla destino (subida previa o email).
--
-- Fix infallible BD-only: función que recorre admin_uploads stale 'processing'
-- y casa file_hash (exact O composite `<base>_doc%`) contra cualquier tabla
-- doc; si encuentra → marca extracted + doc_type real. pg_cron cada 1 minuto.

CREATE OR REPLACE FUNCTION reconcile_admin_uploads_status()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_count int := 0;
  v_doctype text;
BEGIN
  FOR r IN
    SELECT id, file_hash FROM admin_uploads
    WHERE status = 'processing'
      AND deleted_at IS NULL
      AND file_hash IS NOT NULL
      AND created_at < now() - interval '90 seconds'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_doctype := NULL;
    IF EXISTS (SELECT 1 FROM invoices WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'factura';
    ELSIF EXISTS (SELECT 1 FROM documentos_otros WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'otro';
    ELSIF EXISTS (SELECT 1 FROM contratos WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'contrato';
    ELSIF EXISTS (SELECT 1 FROM escrituras WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'escritura';
    ELSIF EXISTS (SELECT 1 FROM certificaciones_obra WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'certificacion';
    ELSIF EXISTS (SELECT 1 FROM certificados WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'certificado';
    ELSIF EXISTS (SELECT 1 FROM albaranes WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'albaran';
    ELSIF EXISTS (SELECT 1 FROM presupuestos WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'presupuesto';
    ELSIF EXISTS (SELECT 1 FROM licencias WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'licencia';
    ELSIF EXISTS (SELECT 1 FROM seguros WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'seguro';
    ELSIF EXISTS (SELECT 1 FROM informes WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'informe';
    ELSIF EXISTS (SELECT 1 FROM modelos_fiscales WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'modelo_fiscal';
    ELSIF EXISTS (SELECT 1 FROM justificantes_pago WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'justificante_pago';
    ELSIF EXISTS (SELECT 1 FROM notas_simples WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'nota_simple';
    ELSIF EXISTS (SELECT 1 FROM payrolls WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'nomina';
    ELSIF EXISTS (SELECT 1 FROM documents WHERE file_hash = r.file_hash OR file_hash LIKE r.file_hash || E'\\_doc%' ESCAPE E'\\') THEN v_doctype := 'otro';
    END IF;

    IF v_doctype IS NOT NULL THEN
      UPDATE admin_uploads
        SET status = 'extracted',
            doc_type = v_doctype,
            extracted_at = COALESCE(extracted_at, now()),
            updated_at = now()
      WHERE id = r.id AND status = 'processing';
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_admin_uploads_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_admin_uploads_status() TO service_role;

COMMENT ON FUNCTION reconcile_admin_uploads_status IS
  'Reconcilia admin_uploads stale processing: si su file_hash existe en cualquier tabla doc (exact O composite), marca extracted + doc_type. Cierra el hueco del trigger trg_mark_admin_upload cuando el pipeline detecta dup y aborta sin INSERT.';

-- Schedule pg_cron: cada 1 minuto. Si ya existe el job, sobrescribir.
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname='reconcile-admin-uploads';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule('reconcile-admin-uploads', '* * * * *', 'SELECT reconcile_admin_uploads_status();');
END$$;
