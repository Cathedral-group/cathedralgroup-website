-- B11 — RPCs preparación datos SEPA Pain.001
--
-- Devuelven JSON con todos los datos necesarios para que el endpoint TS
-- construya el XML Pain.001.001.03 estándar bancos europeos.
--
-- Se usa para:
--   - Pago masivo nóminas mensuales (un envío por mes a empleados)
--   - Pago masivo facturas seleccionadas a proveedores
--
-- El XML resultante David lo sube al portal del banco para ejecutar la
-- transferencia masiva en una sola operación.
--
-- Sprint B11 — sesión 10/05/2026 noche extra-tarde, post B6+B7+B8+B9.

-- ============================================================================
-- prepare_sepa_payroll_data: datos para pago nóminas del mes
-- ============================================================================
CREATE OR REPLACE FUNCTION prepare_sepa_payroll_data(
  p_company_id UUID,
  p_year INT,
  p_month INT,
  p_debtor_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company JSONB;
  v_debtor JSONB;
  v_payments JSONB;
  v_total NUMERIC;
  v_count INT;
BEGIN
  -- Datos empresa (ordenante)
  SELECT jsonb_build_object('cif', cif, 'razon_social', razon_social)
  INTO v_company
  FROM companies
  WHERE id = p_company_id AND deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company no encontrada: %', p_company_id;
  END IF;

  -- Cuenta bancaria deudora (de la empresa)
  SELECT jsonb_build_object(
    'iban', replace(iban, ' ', ''),
    'bic', bic_swift,
    'bank_name', bank_name,
    'alias', account_alias,
    'titular', account_holder_nombre
  )
  INTO v_debtor
  FROM bank_accounts
  WHERE id = p_debtor_account_id
    AND company_id = p_company_id
    AND deleted_at IS NULL;
  IF v_debtor IS NULL THEN
    RAISE EXCEPTION 'bank_account no encontrada o no pertenece a company: %', p_debtor_account_id;
  END IF;
  IF (v_debtor->>'iban') IS NULL OR length(v_debtor->>'iban') < 15 THEN
    RAISE EXCEPTION 'bank_account sin IBAN válido';
  END IF;

  -- Pagos: nominas del periodo NO pagadas
  -- Join payrolls + employees para obtener IBAN del trabajador
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'payment_id', p_id::text,
      'employee_nif', emp_nif,
      'employee_name', emp_name,
      'iban', emp_iban,
      'amount', amount,
      'concept', concept,
      'end_to_end_id', e2e_id
    ) ORDER BY emp_name), '[]'::jsonb),
    COALESCE(SUM(amount), 0),
    COUNT(*)
  INTO v_payments, v_total, v_count
  FROM (
    SELECT
      p.id AS p_id,
      e.nif AS emp_nif,
      e.nombre AS emp_name,
      replace(COALESCE(e.iban, ''), ' ', '') AS emp_iban,
      ROUND(p.liquido_a_percibir::numeric, 2) AS amount,
      format('Nómina %s/%s · %s', p_month, p_year, e.nombre) AS concept,
      format('NOM-%s-%s-%s', p_year, lpad(p_month::text, 2, '0'), substr(p.id::text, 1, 8)) AS e2e_id
    FROM payrolls p
    JOIN employees e ON e.id = p.employee_id OR e.nif = p.trabajador_nif
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND p.periodo_anio = p_year
      AND p.periodo_mes = p_month
      AND COALESCE(p.liquido_a_percibir, 0) > 0
      AND e.deleted_at IS NULL
      AND e.iban IS NOT NULL
      AND length(replace(e.iban, ' ', '')) >= 15
  ) inner_q;

  RETURN jsonb_build_object(
    'type', 'sepa_payroll',
    'company', v_company,
    'debtor', v_debtor,
    'period_year', p_year,
    'period_month', p_month,
    'payments', v_payments,
    'count', v_count,
    'total_amount', v_total,
    'currency', 'EUR',
    'generated_at', NOW(),
    'notas', CASE
      WHEN v_count = 0 THEN jsonb_build_array(
        'Sin nóminas pendientes de pago para el periodo. Verificar que las nóminas tienen liquido_a_percibir y los empleados tienen IBAN.'
      )
      ELSE jsonb_build_array(
        format('%s nómina(s) por %s €. Subir el XML al banco para ejecutar transferencia masiva.', v_count, v_total),
        'Solo se incluyen empleados con IBAN guardado en su ficha.',
        'Concepto auto: "Nómina MM/YYYY · Nombre empleado".'
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION prepare_sepa_payroll_data IS
  'B11 — devuelve JSON con datos para construir XML SEPA Pain.001 de pago '
  'masivo nóminas. Filtra empleados con IBAN válido + liquido_a_percibir > 0. '
  'El endpoint /api/sepa/payroll lo llama y genera el XML.';

-- ============================================================================
-- prepare_sepa_invoices_data: datos para pago batch facturas seleccionadas
-- ============================================================================
CREATE OR REPLACE FUNCTION prepare_sepa_invoices_data(
  p_company_id UUID,
  p_invoice_ids UUID[],
  p_debtor_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company JSONB;
  v_debtor JSONB;
  v_payments JSONB;
  v_total NUMERIC;
  v_count INT;
BEGIN
  SELECT jsonb_build_object('cif', cif, 'razon_social', razon_social)
  INTO v_company
  FROM companies WHERE id = p_company_id AND deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company no encontrada: %', p_company_id;
  END IF;

  SELECT jsonb_build_object(
    'iban', replace(iban, ' ', ''),
    'bic', bic_swift,
    'bank_name', bank_name,
    'alias', account_alias,
    'titular', account_holder_nombre
  )
  INTO v_debtor
  FROM bank_accounts
  WHERE id = p_debtor_account_id
    AND company_id = p_company_id
    AND deleted_at IS NULL;
  IF v_debtor IS NULL THEN
    RAISE EXCEPTION 'bank_account no encontrada: %', p_debtor_account_id;
  END IF;
  IF (v_debtor->>'iban') IS NULL OR length(v_debtor->>'iban') < 15 THEN
    RAISE EXCEPTION 'bank_account sin IBAN válido';
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'payment_id', i_id::text,
      'creditor_nif', cred_nif,
      'creditor_name', cred_name,
      'iban', cred_iban,
      'amount', amount,
      'concept', concept,
      'end_to_end_id', e2e_id,
      'invoice_number', inv_num
    ) ORDER BY cred_name), '[]'::jsonb),
    COALESCE(SUM(amount), 0),
    COUNT(*)
  INTO v_payments, v_total, v_count
  FROM (
    SELECT
      i.id AS i_id,
      i.supplier_nif AS cred_nif,
      COALESCE(i.empresa, s.name, i.supplier_nif) AS cred_name,
      replace(COALESCE(i.iban_proveedor, s.iban, ''), ' ', '') AS cred_iban,
      ROUND(i.amount_total::numeric, 2) AS amount,
      format('Pago factura %s · %s', COALESCE(i.number, '(sin número)'), COALESCE(i.empresa, '')) AS concept,
      format('FAC-%s-%s', to_char(i.issue_date, 'YYYYMMDD'), substr(i.id::text, 1, 8)) AS e2e_id,
      i.number AS inv_num
    FROM invoices i
    LEFT JOIN suppliers s ON s.nif = i.supplier_nif AND s.company_id = p_company_id
    WHERE i.id = ANY(p_invoice_ids)
      AND i.company_id = p_company_id
      AND i.direction = 'recibida'
      AND i.deleted_at IS NULL
      AND COALESCE(i.amount_total, 0) > 0
      AND COALESCE(i.payment_status, 'pendiente') = 'pendiente'
  ) inner_q
  WHERE length(cred_iban) >= 15;

  RETURN jsonb_build_object(
    'type', 'sepa_invoices_batch',
    'company', v_company,
    'debtor', v_debtor,
    'payments', v_payments,
    'count', v_count,
    'total_amount', v_total,
    'currency', 'EUR',
    'generated_at', NOW(),
    'notas', CASE
      WHEN v_count = 0 THEN jsonb_build_array(
        'Ninguna factura del lote es elegible. Verificar: payment_status=pendiente, dirección=recibida, IBAN proveedor presente.'
      )
      ELSE jsonb_build_array(
        format('%s factura(s) por %s €. Subir el XML al banco para ejecutar transferencia masiva.', v_count, v_total),
        'Solo se incluyen facturas con IBAN proveedor presente.',
        'Concepto auto: "Pago factura NUMERO · empresa proveedor".'
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION prepare_sepa_invoices_data IS
  'B11 — devuelve JSON con datos para construir XML SEPA Pain.001 de pago '
  'masivo facturas a proveedores. Filtra solo direction=recibida, '
  'payment_status=pendiente con IBAN proveedor. El endpoint /api/sepa/invoices '
  'lo llama y genera el XML.';
