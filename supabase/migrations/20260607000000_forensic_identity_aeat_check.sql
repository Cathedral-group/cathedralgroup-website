-- ============================================================================
-- 20260607000000_forensic_identity_aeat_check.sql
-- Añade comprobación de IDENTIDAD FISCAL AEAT a forensic_full_check.
--
-- Clave única de una factura para la AEAT = NIF emisor + número + fecha de
-- emisión (el IMPORTE no forma parte de la identidad). Este bloque detecta dos
-- casos que hoy NO se cubren:
--   • mismo NIF+número+fecha entre facturas ACTIVAS con importe distinto: el
--     índice único invoices_unique_active_dedup incluye amount_total → NO lo
--     bloquea; los checks fuzzy van por importe (±0,05€) → tampoco lo detectan.
--   • mismo NIF+número+fecha contra facturas en PAPELERA (deleted_at): reenvío
--     de una factura que ya se canceló. Los checks fuzzy/numbering filtran
--     deleted_at IS NULL → antes pasaba sin aviso.
--
-- NO bloquea en duro (no se pierde el documento ni se rompe el pipeline):
-- fuerza score <= 40 → el flujo n8n existente ("¿Forensic Score Bajo?" score<50
-- → "Marcar Review Forensic") lo enruta a revisión humana (human-in-the-loop).
-- Contrato de salida SIN CAMBIOS: RETURNS TABLE(score, all_alerts, forensic_id)
-- → n8n intacto. CREATE OR REPLACE conserva owner + GRANTs (PostgreSQL docs).
--
-- Ref: AEAT clave única factura recibida (libro registro / SII: NIF+serie+nº+
--      fecha → 2ª factura = duplicada aunque cambie el importe);
--      RD 1619/2012 art. 6/15 (rectificativa = numeración/serie propia → number
--      distinto → no colisiona con este check).
-- Validado por agente doc-validator (sesión 07/06/2026).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.forensic_full_check(
  p_invoice_id uuid,
  p_supplier_nif text,
  p_amount numeric DEFAULT NULL,
  p_issue_date date DEFAULT NULL,
  p_number text DEFAULT NULL,
  p_from_address text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_pdf_eof_count smallint DEFAULT NULL,
  p_pdf_metadata jsonb DEFAULT '{}'::jsonb,
  p_pdf_alerts text[] DEFAULT ARRAY[]::text[]
) RETURNS TABLE(
  score smallint,
  all_alerts text[],
  forensic_id uuid
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_check record;
  v_dup_count int := 0;
  v_similar_count int := 0;
  v_numbering record;
  v_overrun record;
  v_score int := 100;
  v_alerts text[] := COALESCE(p_pdf_alerts, ARRAY[]::text[]);
  v_email_alerts text[] := ARRAY[]::text[];
  v_dup_alerts text[] := ARRAY[]::text[];
  v_num_alerts text[] := ARRAY[]::text[];
  v_forensic_id uuid;
  v_id_active int := 0;
  v_id_deleted int := 0;
BEGIN
  v_score := v_score - LEAST(30, COALESCE(array_length(p_pdf_alerts, 1), 0) * 10);

  IF p_supplier_nif IS NOT NULL AND p_from_address IS NOT NULL AND p_from_address <> '' THEN
    SELECT * INTO v_email_check FROM check_supplier_email_whitelist(p_supplier_nif, p_from_address);
    IF v_email_check.alert IS NOT NULL THEN
      v_email_alerts := array_append(v_email_alerts, v_email_check.alert);
      v_score := v_score - 10;
    END IF;
  END IF;

  -- FIX BUG 5: ventana 20 días (alineada con n8n) en lugar de 7 default
  IF p_supplier_nif IS NOT NULL AND p_amount IS NOT NULL AND p_issue_date IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM find_fuzzy_duplicate_invoices(p_supplier_nif, p_amount, p_issue_date, p_invoice_id, 20);
    IF v_dup_count > 0 THEN
      v_dup_alerts := array_append(v_dup_alerts,
        format('§DUPLICATE_FUZZY:%s factura(s) similar(es) en ventana 20 días', v_dup_count));
      v_score := v_score - 25;
    END IF;
  END IF;

  IF p_supplier_nif IS NOT NULL AND p_number IS NOT NULL AND p_number <> '' THEN
    SELECT COUNT(*) INTO v_similar_count
    FROM find_similar_invoice_number(p_supplier_nif, p_number, p_invoice_id, 2);
    IF v_similar_count > 0 THEN
      v_dup_alerts := array_append(v_dup_alerts,
        format('§NUMBER_SIMILAR:%s número(s) muy parecido(s) (typo posible)', v_similar_count));
      v_score := v_score - 15;
    END IF;
  END IF;

  -- ===== IDENTIDAD AEAT: NIF normalizado + número + fecha (importe NO es identidad).
  --       Mira facturas ACTIVAS y en PAPELERA. No bloquea: fuerza score <= 40
  --       (LEAST garantiza cruzar el umbral n8n score<50) → revisión humana. =====
  IF p_supplier_nif IS NOT NULL AND p_number IS NOT NULL AND p_number <> '' AND p_issue_date IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE i.deleted_at IS NULL),
      COUNT(*) FILTER (WHERE i.deleted_at IS NOT NULL)
    INTO v_id_active, v_id_deleted
    FROM invoices i
    WHERE REGEXP_REPLACE(UPPER(i.supplier_nif), '[^A-Z0-9]', '', 'g')
        = REGEXP_REPLACE(UPPER(p_supplier_nif), '[^A-Z0-9]', '', 'g')
      AND i.number = p_number
      AND i.issue_date = p_issue_date
      AND i.id <> p_invoice_id;

    IF v_id_active > 0 THEN
      v_dup_alerts := array_append(v_dup_alerts,
        format('§IDENTITY_AEAT:mismo nº+fecha+proveedor que %s factura(s) activa(s) con importe distinto — posible duplicado o corrección, revisar', v_id_active));
      v_score := LEAST(v_score - 60, 40);
    END IF;

    IF v_id_deleted > 0 THEN
      v_dup_alerts := array_append(v_dup_alerts,
        format('§IDENTITY_CANCELLED:mismo nº+fecha+proveedor que %s factura(s) en papelera — ya rechazada antes, revisar', v_id_deleted));
      v_score := LEAST(v_score - 60, 40);
    END IF;
  END IF;
  -- ===== FIN IDENTIDAD AEAT =====

  IF p_supplier_nif IS NOT NULL AND p_number IS NOT NULL AND p_issue_date IS NOT NULL THEN
    FOR v_numbering IN
      SELECT * FROM check_invoice_numbering_coherence(p_supplier_nif, p_number, p_issue_date)
    LOOP
      v_num_alerts := array_append(v_num_alerts, format('§NUMBERING:%s', v_numbering.message));
      IF v_numbering.severity = 'high' THEN
        v_score := v_score - 15;
      ELSIF v_numbering.severity = 'medium' THEN
        v_score := v_score - 7;
      END IF;
    END LOOP;
  END IF;

  IF p_project_id IS NOT NULL AND p_amount IS NOT NULL THEN
    SELECT * INTO v_overrun FROM check_project_overrun(p_project_id, p_amount);
    IF v_overrun.alert IS NOT NULL THEN
      v_alerts := array_append(v_alerts, v_overrun.alert);
      v_score := v_score - 20;
    END IF;
  END IF;

  v_alerts := v_alerts || v_email_alerts || v_dup_alerts || v_num_alerts;
  v_score := GREATEST(0, LEAST(100, v_score));

  INSERT INTO factura_forensic (
    invoice_id, pdf_eof_count, pdf_metadata, pdf_alerts,
    email_alerts, numeracion_alerts, duplicados_alerts, score
  ) VALUES (
    p_invoice_id, p_pdf_eof_count, p_pdf_metadata, p_pdf_alerts,
    v_email_alerts, v_num_alerts, v_dup_alerts, v_score::smallint
  )
  ON CONFLICT (invoice_id) DO UPDATE SET
    pdf_eof_count = EXCLUDED.pdf_eof_count,
    pdf_metadata = EXCLUDED.pdf_metadata,
    pdf_alerts = EXCLUDED.pdf_alerts,
    email_alerts = EXCLUDED.email_alerts,
    numeracion_alerts = EXCLUDED.numeracion_alerts,
    duplicados_alerts = EXCLUDED.duplicados_alerts,
    score = EXCLUDED.score
  RETURNING id INTO v_forensic_id;

  RETURN QUERY SELECT v_score::smallint, v_alerts, v_forensic_id;
END;
$$;
