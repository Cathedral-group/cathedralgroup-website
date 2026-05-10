-- B6 + B7 — Modelo 347 anual + Cuadre 303 anual contra 390
--
-- Por qué esta migración existe
--   B6: el modelo 347 es declaración informativa anual de operaciones con
--       terceros (clientes/proveedores) con importe acumulado >3.005,06€
--       en el ejercicio. Plazo: 1-28 febrero del año siguiente.
--   B7: el modelo 390 es resumen anual del IVA. La suma de los 4 trimestres
--       del 303 DEBE coincidir con el 390. Si no, hay error que hay que
--       arreglar antes de presentar 390.
--
-- Sprint B6+B7 — sesión 10/05/2026 noche súper tarde, post B3+B4 desplegados.

-- ============================================================================
-- B6 — generate_347_draft: declaración anual operaciones >3.005,06€
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_347_draft(
  p_company_id UUID,
  p_ejercicio INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      'NO incluye operaciones intracomunitarias (modelo 349) ni intragrupo (Modelo 232 separado).',
      'Si Cathedral esta en SII, NO presenta 347.'
    )
  );
END;
$$;

COMMENT ON FUNCTION generate_347_draft IS
  'B6 — genera borrador modelo 347 anual: clientes y proveedores con '
  'operaciones acumuladas >3.005,06€ en el ejercicio. Desglose por trimestre '
  'para cada NIF.';

-- ============================================================================
-- B7 — verify_303_390_alignment: cuadre 303 trimestral vs 390 anual
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_303_390_alignment(
  p_company_id UUID,
  p_ejercicio INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company JSONB;
  v_q1 JSONB;
  v_q2 JSONB;
  v_q3 JSONB;
  v_q4 JSONB;
  v_anual JSONB;
  v_sum_iva NUMERIC;
  v_anual_iva NUMERIC;
  v_diff NUMERIC;
BEGIN
  SELECT jsonb_build_object('cif', cif, 'razon_social', razon_social)
  INTO v_company FROM companies WHERE id = p_company_id;

  -- Generar los 4 borradores trimestrales y el anual
  v_q1 := generate_303_draft(p_company_id, p_ejercicio, '1T');
  v_q2 := generate_303_draft(p_company_id, p_ejercicio, '2T');
  v_q3 := generate_303_draft(p_company_id, p_ejercicio, '3T');
  v_q4 := generate_303_draft(p_company_id, p_ejercicio, '4T');
  v_anual := generate_303_draft(p_company_id, p_ejercicio, 'A');

  -- Suma cuotas devengadas trimestral
  v_sum_iva := COALESCE((v_q1->>'casilla_27_total_devengado')::numeric, 0)
             + COALESCE((v_q2->>'casilla_27_total_devengado')::numeric, 0)
             + COALESCE((v_q3->>'casilla_27_total_devengado')::numeric, 0)
             + COALESCE((v_q4->>'casilla_27_total_devengado')::numeric, 0);

  v_anual_iva := COALESCE((v_anual->>'casilla_27_total_devengado')::numeric, 0);

  v_diff := ROUND(v_anual_iva - v_sum_iva, 2);

  RETURN jsonb_build_object(
    'company', v_company,
    'company_id', p_company_id,
    'ejercicio', p_ejercicio,
    'generado_at', NOW(),
    'q1_devengado', COALESCE((v_q1->>'casilla_27_total_devengado')::numeric, 0),
    'q2_devengado', COALESCE((v_q2->>'casilla_27_total_devengado')::numeric, 0),
    'q3_devengado', COALESCE((v_q3->>'casilla_27_total_devengado')::numeric, 0),
    'q4_devengado', COALESCE((v_q4->>'casilla_27_total_devengado')::numeric, 0),
    'suma_trimestres', ROUND(v_sum_iva, 2),
    'anual_devengado', ROUND(v_anual_iva, 2),
    'diferencia', v_diff,
    'cuadre_ok', ABS(v_diff) < 0.05,
    'q1_deducir', COALESCE((v_q1->>'casilla_45_total_deducir')::numeric, 0),
    'q2_deducir', COALESCE((v_q2->>'casilla_45_total_deducir')::numeric, 0),
    'q3_deducir', COALESCE((v_q3->>'casilla_45_total_deducir')::numeric, 0),
    'q4_deducir', COALESCE((v_q4->>'casilla_45_total_deducir')::numeric, 0),
    'suma_trimestres_deducir', ROUND(
      COALESCE((v_q1->>'casilla_45_total_deducir')::numeric, 0)
      + COALESCE((v_q2->>'casilla_45_total_deducir')::numeric, 0)
      + COALESCE((v_q3->>'casilla_45_total_deducir')::numeric, 0)
      + COALESCE((v_q4->>'casilla_45_total_deducir')::numeric, 0), 2
    ),
    'anual_deducir', ROUND(COALESCE((v_anual->>'casilla_45_total_deducir')::numeric, 0), 2),
    'notas', CASE
      WHEN ABS(v_diff) < 0.05 THEN jsonb_build_array(
        'Cuadre 303 trimestral vs anual OK (diferencia <5 centimos).'
      )
      ELSE jsonb_build_array(
        format('ATENCION: diferencia entre suma trimestres y anual = %s euros.', v_diff),
        'Posibles causas: facturas con issue_date posterior al cierre trimestre, rectificativas no aplicadas en mismo trimestre, valores nulos.',
        'Validar invoices del ejercicio antes de presentar 390.'
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION verify_303_390_alignment IS
  'B7 — verifica que la suma de los 4 trimestres del 303 coincide con el '
  'borrador 390 anual. Devuelve diferencia + cuadre_ok boolean. Tolerancia '
  '5 centimos para errores de redondeo.';
