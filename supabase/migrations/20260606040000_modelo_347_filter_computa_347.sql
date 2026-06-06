-- Auditoría profunda 06/06/2026 — Fix #5 (Modelo 347)
--
-- generate_347_draft NO filtraba la marca computa_347 → incluía facturas que
-- deben excluirse del 347 (intracomunitarias/SII/alquileres con retención, etc.).
-- Se añade en AMBAS subqueries (clientes y proveedores):
--   AND COALESCE(computa_347, TRUE) = TRUE   -- excluye solo las marcadas FALSE (NULL/TRUE pasan)
--   AND computa_349_clave IS NULL            -- excluye operaciones intracomunitarias (modelo 349)
--
-- Cuerpo verificado en vivo (pg_get_functiondef) = repo verbatim, sin drift,
-- una sola firma. Función STABLE SECURITY DEFINER de solo-lectura: NO la invoca
-- el pipeline n8n, es el borrador del 347 bajo demanda → cero impacto en facturas.

CREATE OR REPLACE FUNCTION public.generate_347_draft(p_company_id uuid, p_ejercicio integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start DATE;
  v_end DATE;
  v_company JSONB;
  v_clients JSONB;
  v_suppliers JSONB;
  v_threshold NUMERIC := 3005.06;
BEGIN
  v_start := make_date(p_ejercicio, 1, 1);
  v_end := make_date(p_ejercicio, 12, 31);

  SELECT jsonb_build_object('cif', cif, 'razon_social', razon_social, 'sii_obligado', sii_obligado)
  INTO v_company FROM companies WHERE id = p_company_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company no encontrada: %', p_company_id;
  END IF;

  -- Clientes: agrupado por NIF receptor de facturas emitidas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nif', nif_receptor,
    'razon_social', empresa,
    'total_anual', total_acumulado,
    'num_facturas', num_facturas,
    'q1', q1, 'q2', q2, 'q3', q3, 'q4', q4
  ) ORDER BY total_acumulado DESC), '[]'::jsonb)
  INTO v_clients
  FROM (
    SELECT
      nif_receptor,
      MAX(empresa) AS empresa,
      ROUND(SUM(amount_total)::numeric, 2) AS total_acumulado,
      COUNT(*) AS num_facturas,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 1 AND 3 THEN amount_total ELSE 0 END)::numeric, 2) AS q1,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 4 AND 6 THEN amount_total ELSE 0 END)::numeric, 2) AS q2,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 7 AND 9 THEN amount_total ELSE 0 END)::numeric, 2) AS q3,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 10 AND 12 THEN amount_total ELSE 0 END)::numeric, 2) AS q4
    FROM invoices
    WHERE company_id = p_company_id
      AND direction = 'emitida'
      AND deleted_at IS NULL
      AND issue_date BETWEEN v_start AND v_end
      AND nif_receptor IS NOT NULL
      AND length(trim(nif_receptor)) > 0
      AND COALESCE(review_status, 'pendiente') NOT IN ('rechazado', 'error')
      AND COALESCE(computa_347, TRUE) = TRUE
      AND computa_349_clave IS NULL
    GROUP BY nif_receptor
    HAVING SUM(amount_total) > v_threshold
  ) clients_agg;

  -- Proveedores: agrupado por NIF emisor de facturas recibidas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nif', supplier_nif,
    'razon_social', empresa,
    'total_anual', total_acumulado,
    'num_facturas', num_facturas,
    'q1', q1, 'q2', q2, 'q3', q3, 'q4', q4
  ) ORDER BY total_acumulado DESC), '[]'::jsonb)
  INTO v_suppliers
  FROM (
    SELECT
      supplier_nif,
      MAX(empresa) AS empresa,
      ROUND(SUM(amount_total)::numeric, 2) AS total_acumulado,
      COUNT(*) AS num_facturas,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 1 AND 3 THEN amount_total ELSE 0 END)::numeric, 2) AS q1,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 4 AND 6 THEN amount_total ELSE 0 END)::numeric, 2) AS q2,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 7 AND 9 THEN amount_total ELSE 0 END)::numeric, 2) AS q3,
      ROUND(SUM(CASE WHEN EXTRACT(month FROM issue_date) BETWEEN 10 AND 12 THEN amount_total ELSE 0 END)::numeric, 2) AS q4
    FROM invoices
    WHERE company_id = p_company_id
      AND direction = 'recibida'
      AND deleted_at IS NULL
      AND issue_date BETWEEN v_start AND v_end
      AND supplier_nif IS NOT NULL
      AND length(trim(supplier_nif)) > 0
      AND COALESCE(review_status, 'pendiente') NOT IN ('rechazado', 'error')
      AND COALESCE(computa_347, TRUE) = TRUE
      AND computa_349_clave IS NULL
    GROUP BY supplier_nif
    HAVING SUM(amount_total) > v_threshold
  ) suppliers_agg;

  RETURN jsonb_build_object(
    'modelo', '347',
    'borrador', true,
    'company', v_company,
    'company_id', p_company_id,
    'ejercicio', p_ejercicio,
    'umbral_eur', v_threshold,
    'generado_at', NOW(),
    'clientes', jsonb_build_object(
      'count', jsonb_array_length(v_clients),
      'detalle', v_clients
    ),
    'proveedores', jsonb_build_object(
      'count', jsonb_array_length(v_suppliers),
      'detalle', v_suppliers
    ),
    'notas', jsonb_build_array(
      'Borrador automatico modelo 347. Validar antes de presentar.',
      'Solo operaciones >3.005,06€ acumuladas anuales por NIF.',
      'NO incluye facturas con review_status IN (rechazado, error).',
      'Excluye facturas marcadas computa_347=FALSE (intracom/SII/alquiler-retencion) y con clave 349.',
      'NO incluye operaciones intracomunitarias (modelo 349) ni intragrupo (Modelo 232 separado).',
      'Si Cathedral esta en SII, NO presenta 347.'
    )
  );
END;
$function$;
