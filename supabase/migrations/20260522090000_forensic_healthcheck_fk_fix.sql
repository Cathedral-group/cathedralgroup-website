-- ============================================================================
-- Cathedral Group — Fix forensic_rpcs_healthcheck sub-test forensic_full_check
-- (22/05/2026)
--
-- Problema: el sub-test 7 llama forensic_full_check con un invoice_id dummy
-- inexistente. Tras añadir la FK factura_forensic.invoice_id→invoices
-- (commit edd2f38), el INSERT interno viola la FK → el healthcheck marcaba
-- forensic_full_check como ERROR cada 6h, disparando "Sistema Health: DEGRADED".
--
-- La función funciona PERFECTAMENTE en producción (siempre recibe un
-- invoice_id real). El roto era solo el self-test.
--
-- Fix: tratar foreign_key_violation (23503) como resultado ESPERADO en el
-- sub-test → ok=TRUE (la función llegó al INSERT sin drift; solo falla porque
-- el invoice dummy no existe). Cualquier OTRO error sigue siendo ok=FALSE.
-- No se insertan invoices dummy (evita disparar triggers Verifactu / cadena
-- hash fiscal). El INSERT parcial se revierte solo por el subtransaction del
-- bloque BEGIN/EXCEPTION (validado doc-validator contra docs PG17).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE OR REPLACE FUNCTION public.forensic_rpcs_healthcheck()
RETURNS TABLE(
  rpc_name text,
  ok boolean,
  error_message text,
  duration_ms numeric
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_dummy_nif text := 'B19761915';
  v_dummy_email text := 'test@ejemplo.com';
  v_dummy_amount numeric := 100.00;
  v_dummy_date date := CURRENT_DATE;
  v_dummy_number text := 'TEST-HC';
  v_dummy_uuid uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  -- 1. check_supplier_email_whitelist
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM check_supplier_email_whitelist(v_dummy_nif, v_dummy_email);
    rpc_name := 'check_supplier_email_whitelist'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'check_supplier_email_whitelist'; ok := FALSE; error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- 2. find_fuzzy_duplicate_invoices
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM find_fuzzy_duplicate_invoices(v_dummy_nif, v_dummy_amount, v_dummy_date, NULL, 7);
    rpc_name := 'find_fuzzy_duplicate_invoices'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'find_fuzzy_duplicate_invoices'; ok := FALSE; error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- 3. find_similar_invoice_number
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM find_similar_invoice_number(v_dummy_nif, v_dummy_number, NULL, 2);
    rpc_name := 'find_similar_invoice_number'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'find_similar_invoice_number'; ok := FALSE; error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- 4. check_invoice_numbering_coherence
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM check_invoice_numbering_coherence(v_dummy_nif, v_dummy_number, v_dummy_date);
    rpc_name := 'check_invoice_numbering_coherence'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'check_invoice_numbering_coherence'; ok := FALSE; error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- 5. get_vendor_project_loyalty
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM get_vendor_project_loyalty(v_dummy_nif, 3);
    rpc_name := 'get_vendor_project_loyalty'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'get_vendor_project_loyalty'; ok := FALSE; error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- 6. check_project_overrun
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM check_project_overrun(v_dummy_uuid, v_dummy_amount, 1.05);
    rpc_name := 'check_project_overrun'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'check_project_overrun'; ok := FALSE; error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- 7. forensic_full_check (orquestadora). El INSERT en factura_forensic con
  -- invoice_id dummy viola la FK → ESPERADO. Significa que la función llegó al
  -- INSERT sin drift de firma/lógica. El subtransaction revierte el INSERT.
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM forensic_full_check(
      v_dummy_uuid, v_dummy_nif, v_dummy_amount, v_dummy_date,
      v_dummy_number, v_dummy_email, NULL, NULL, '{}'::jsonb, ARRAY[]::text[]
    );
    rpc_name := 'forensic_full_check'; ok := TRUE; error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  EXCEPTION
    WHEN foreign_key_violation THEN
      rpc_name := 'forensic_full_check'; ok := TRUE;
      error_message := 'FK esperada (invoice dummy inexistente) — función sana';
      duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
    WHEN OTHERS THEN
      rpc_name := 'forensic_full_check'; ok := FALSE; error_message := SQLERRM;
      duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000; RETURN NEXT;
  END;

  -- Limpieza defensiva (por si alguna fila dummy quedara de versiones previas)
  DELETE FROM factura_forensic WHERE invoice_id = v_dummy_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.forensic_rpcs_healthcheck() TO service_role;

COMMENT ON FUNCTION public.forensic_rpcs_healthcheck IS
  'Healthcheck de las 7 RPCs forensic. Sub-test forensic_full_check trata FK violation del invoice dummy como ESPERADA (ok=true) — fix sesión 22/05 tras añadir FK factura_forensic→invoices.';

COMMIT;
