-- Sprint adicional 10/05 — Auditoría agente 1: "healthcheck de los 6 sub-RPCs forensic
-- — hoy solo hay healthcheck del workflow general; añadir SELECT diario que detecte drift
-- de funciones SQL".
--
-- RPC `forensic_rpcs_healthcheck()` ejecuta cada una de las 6 RPCs con argumentos seguros
-- y devuelve {rpc_name, ok, error_message, duration_ms} para cada una. Llamada desde
-- workflow Healthcheck o cron diario.

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
  v_dummy_nif text := 'B19761915';  -- Cathedral, NIF que existe
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
    rpc_name := 'check_supplier_email_whitelist';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'check_supplier_email_whitelist';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- 2. find_fuzzy_duplicate_invoices
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM find_fuzzy_duplicate_invoices(v_dummy_nif, v_dummy_amount, v_dummy_date, NULL, 7);
    rpc_name := 'find_fuzzy_duplicate_invoices';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'find_fuzzy_duplicate_invoices';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- 3. find_similar_invoice_number
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM find_similar_invoice_number(v_dummy_nif, v_dummy_number, NULL, 2);
    rpc_name := 'find_similar_invoice_number';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'find_similar_invoice_number';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- 4. check_invoice_numbering_coherence
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM check_invoice_numbering_coherence(v_dummy_nif, v_dummy_number, v_dummy_date);
    rpc_name := 'check_invoice_numbering_coherence';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'check_invoice_numbering_coherence';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- 5. get_vendor_project_loyalty
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM get_vendor_project_loyalty(v_dummy_nif, 3);
    rpc_name := 'get_vendor_project_loyalty';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'get_vendor_project_loyalty';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- 6. check_project_overrun
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM check_project_overrun(v_dummy_uuid, v_dummy_amount, 1.05);
    rpc_name := 'check_project_overrun';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'check_project_overrun';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- 7. forensic_full_check (la orquestadora)
  v_start := clock_timestamp();
  BEGIN
    PERFORM * FROM forensic_full_check(
      v_dummy_uuid, v_dummy_nif, v_dummy_amount, v_dummy_date,
      v_dummy_number, v_dummy_email, NULL, NULL, '{}'::jsonb, ARRAY[]::text[]
    );
    rpc_name := 'forensic_full_check';
    ok := TRUE;
    error_message := NULL;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rpc_name := 'forensic_full_check';
    ok := FALSE;
    error_message := SQLERRM;
    duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
    RETURN NEXT;
  END;

  -- Limpiar la fila dummy de factura_forensic que pueda haber quedado
  DELETE FROM factura_forensic WHERE invoice_id = v_dummy_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.forensic_rpcs_healthcheck() TO service_role;

COMMENT ON FUNCTION public.forensic_rpcs_healthcheck IS
  'Healthcheck de las 7 RPCs forensic (las 6 originales + forensic_full_check orquestadora).
   Devuelve por cada una: ok/fail + error_message + duration_ms. Llamar diariamente desde
   workflow Healthcheck para detectar drift de funciones.';
