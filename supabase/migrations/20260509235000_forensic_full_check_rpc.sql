-- Migración: forensic_full_check RPC
--
-- Orquesta los 6 checks individuales (creados en 20260509220000_forensic_rea_validations.sql)
-- + alerts del PDF forensic (calculados en pdf2img:5001), calcula score consolidado 0-100,
-- y persiste el resultado en factura_forensic.
--
-- Uso desde n8n (1 sola HTTP call POST a /rpc/forensic_full_check):
--   {
--     "p_invoice_id": "<uuid>",
--     "p_supplier_nif": "B12345678",
--     "p_amount": 1234.56,
--     "p_issue_date": "2026-05-09",
--     "p_number": "F2025-001",
--     "p_from_address": "noreply@proveedor.com",
--     "p_project_id": "<uuid>",       -- opcional
--     "p_pdf_eof_count": 1,            -- opcional
--     "p_pdf_metadata": {...},         -- opcional
--     "p_pdf_alerts": ["§PDF_..."]     -- opcional, salida del endpoint /forensic
--   }
-- Devuelve: TABLE(score smallint, all_alerts text[], forensic_id uuid)

-- Asegurar índice único para ON CONFLICT (idempotente)
CREATE UNIQUE INDEX IF NOT EXISTS factura_forensic_invoice_id_uniq
  ON public.factura_forensic(invoice_id);

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
BEGIN
  -- Penalización por alertas PDF (max 30 pts)
  v_score := v_score - LEAST(30, COALESCE(array_length(p_pdf_alerts, 1), 0) * 10);

  -- 1) Email whitelist (proveedor usa nuevo email no histórico)
  IF p_supplier_nif IS NOT NULL AND p_from_address IS NOT NULL AND p_from_address <> '' THEN
    SELECT * INTO v_email_check FROM check_supplier_email_whitelist(p_supplier_nif, p_from_address);
    IF v_email_check.alert IS NOT NULL THEN
      v_email_alerts := array_append(v_email_alerts, v_email_check.alert);
      v_score := v_score - 10;
    END IF;
  END IF;

  -- 2) Fuzzy duplicate (mismo proveedor, mismo importe, fecha cercana)
  IF p_supplier_nif IS NOT NULL AND p_amount IS NOT NULL AND p_issue_date IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM find_fuzzy_duplicate_invoices(p_supplier_nif, p_amount, p_issue_date, p_invoice_id, 7);
    IF v_dup_count > 0 THEN
      v_dup_alerts := array_append(v_dup_alerts,
        format('§DUPLICATE_FUZZY:%s factura(s) muy similar(es) en últimos 7 días', v_dup_count));
      v_score := v_score - 25;
    END IF;
  END IF;

  -- 3) Similar invoice number (Levenshtein <=2)
  IF p_supplier_nif IS NOT NULL AND p_number IS NOT NULL AND p_number <> '' THEN
    SELECT COUNT(*) INTO v_similar_count
    FROM find_similar_invoice_number(p_supplier_nif, p_number, p_invoice_id, 2);
    IF v_similar_count > 0 THEN
      v_dup_alerts := array_append(v_dup_alerts,
        format('§NUMBER_SIMILAR:%s número(s) muy parecido(s) (typo posible)', v_similar_count));
      v_score := v_score - 15;
    END IF;
  END IF;

  -- 4) Numbering coherence (saltos/retrocesos en secuencia)
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

  -- 5) Project overrun (presupuesto agotado)
  IF p_project_id IS NOT NULL AND p_amount IS NOT NULL THEN
    SELECT * INTO v_overrun FROM check_project_overrun(p_project_id, p_amount);
    IF v_overrun.alert IS NOT NULL THEN
      v_alerts := array_append(v_alerts, v_overrun.alert);
      v_score := v_score - 20;
    END IF;
  END IF;

  -- Combinar todas las alertas
  v_alerts := v_alerts || v_email_alerts || v_dup_alerts || v_num_alerts;

  -- Clampar score
  v_score := GREATEST(0, LEAST(100, v_score));

  -- Persistir resultado (UPSERT por invoice_id)
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

GRANT EXECUTE ON FUNCTION public.forensic_full_check(
  uuid, text, numeric, date, text, text, uuid, smallint, jsonb, text[]
) TO service_role;

COMMENT ON FUNCTION public.forensic_full_check IS
'Orquesta 6 checks forensic + persiste resultado en factura_forensic. Devuelve score consolidado 0-100 y array unificado de alertas. Llamar tras INSERT en invoices con el invoice_id real.';
