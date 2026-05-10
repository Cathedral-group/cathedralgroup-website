-- B5 Modelo 115 alquileres + B14 stub Verifactu submit
--
-- B5: cuando Cathedral sea arrendatario (rental_contracts.cathedral_role='tenant')
--     debe retener IRPF al pagar la renta y declararlo en modelo 115 trimestral.
--     RPC suma rental_payments del periodo agrupado por landlord_nif.
--
-- B14: el envío real a AEAT requiere cert FNMT + endpoint Verifactu activo.
--      Hasta entonces dejamos infrastructure stub: tabla verifactu_submissions
--      registrando intentos + status. El día que David tenga cert, conectamos.
--
-- Sprint B5+B14 — sesión 10/05/2026 noche extra-tarde, post B11 SEPA.

-- ============================================================================
-- B5 — generate_115_draft
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_115_draft(
  p_company_id UUID,
  p_ejercicio INT,
  p_periodo TEXT
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
  v_payments JSONB;
  v_total_base NUMERIC;
  v_total_retencion NUMERIC;
  v_count INT;
  v_landlords INT;
BEGIN
  -- Resolver periodo
  CASE p_periodo
    WHEN '1T' THEN v_start := make_date(p_ejercicio, 1, 1);   v_end := make_date(p_ejercicio, 3, 31);
    WHEN '2T' THEN v_start := make_date(p_ejercicio, 4, 1);   v_end := make_date(p_ejercicio, 6, 30);
    WHEN '3T' THEN v_start := make_date(p_ejercicio, 7, 1);   v_end := make_date(p_ejercicio, 9, 30);
    WHEN '4T' THEN v_start := make_date(p_ejercicio, 10, 1);  v_end := make_date(p_ejercicio, 12, 31);
    WHEN 'A'  THEN v_start := make_date(p_ejercicio, 1, 1);   v_end := make_date(p_ejercicio, 12, 31);
    ELSE
      IF p_periodo ~ '^(0[1-9]|1[0-2])$' THEN
        v_start := make_date(p_ejercicio, p_periodo::INT, 1);
        v_end := (v_start + INTERVAL '1 month - 1 day')::date;
      ELSE
        RAISE EXCEPTION 'Periodo invalido: %', p_periodo;
      END IF;
  END CASE;

  SELECT jsonb_build_object('cif', cif, 'razon_social', razon_social)
  INTO v_company FROM companies WHERE id = p_company_id;

  -- Pagos del periodo agrupados por arrendador
  -- Solo cuando Cathedral es arrendatario (cathedral_role='tenant')
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'landlord_nif', landlord_nif,
      'num_pagos', num_pagos,
      'base_total', base_total,
      'retencion_total', retencion_total,
      'tipo_retencion_pct', tipo_retencion_pct
    ) ORDER BY retencion_total DESC), '[]'::jsonb),
    COALESCE(SUM(base_total), 0),
    COALESCE(SUM(retencion_total), 0),
    COALESCE(SUM(num_pagos), 0),
    COUNT(*)
  INTO v_payments, v_total_base, v_total_retencion, v_count, v_landlords
  FROM (
    SELECT
      rc.landlord_nif,
      COUNT(rp.id) AS num_pagos,
      ROUND(SUM(COALESCE(rp.base_amount, 0))::numeric, 2) AS base_total,
      ROUND(SUM(COALESCE(rp.irpf_withholding_amount, 0))::numeric, 2) AS retencion_total,
      ROUND(AVG(rp.irpf_withholding_pct)::numeric, 2) AS tipo_retencion_pct
    FROM rental_payments rp
    JOIN rental_contracts rc ON rc.id = rp.contract_id
    WHERE rp.company_id = p_company_id
      AND rc.deleted_at IS NULL
      AND rc.cathedral_role = 'tenant'  -- Cathedral arrendatario, retiene IRPF al landlord
      AND rp.due_date BETWEEN v_start AND v_end
      AND COALESCE(rp.irpf_withholding_amount, 0) > 0
      AND rc.landlord_nif IS NOT NULL
    GROUP BY rc.landlord_nif
  ) grouped;

  RETURN jsonb_build_object(
    'modelo', '115',
    'borrador', true,
    'company', v_company,
    'company_id', p_company_id,
    'ejercicio', p_ejercicio,
    'periodo', p_periodo,
    'periodo_inicio', v_start,
    'periodo_fin', v_end,
    'generado_at', NOW(),
    'arrendadores_count', v_landlords,
    'pagos_count', v_count,
    'casilla_01_perceptores', v_landlords,
    'casilla_02_base', v_total_base,
    'casilla_03_retencion', v_total_retencion,
    'detalle_arrendadores', v_payments,
    'total_a_ingresar', v_total_retencion,
    'notas', CASE
      WHEN v_landlords = 0 THEN jsonb_build_array(
        'Sin arrendamientos urbanos como arrendatario en el periodo. Modelo 115 no aplica si Cathedral no alquila inmuebles.'
      )
      ELSE jsonb_build_array(
        format('%s arrendador(es) con %s pago(s) — retencion total %s euros.', v_landlords, v_count, v_total_retencion),
        'Solo incluye rental_contracts.cathedral_role = tenant (Cathedral arrendatario).',
        'Excluye contratos donde Cathedral es arrendador (ahi cobra renta + recibe retencion del inquilino).',
        'Tipo retencion estandar 19% (RIRPF art. 76).'
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION generate_115_draft IS
  'B5 — borrador modelo 115 IRPF retenciones arrendamientos urbanos. Solo '
  'aplica cuando Cathedral es arrendatario (paga renta + retiene IRPF al '
  'landlord). Agrupa rental_payments del periodo por landlord_nif.';

-- ============================================================================
-- B14 — Tabla stub para tracking envíos Verifactu (cuando llegue cert FNMT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS verifactu_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),

  -- Estado del envío
  submission_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (submission_status IN ('pending','skipped','sent','rejected','accepted','error')),
  submission_attempt INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_attempt_error TEXT,

  -- Datos del envío real (cuando se haga)
  sent_at TIMESTAMPTZ,
  csv_aeat TEXT,                                              -- código seguro verificación AEAT
  request_payload JSONB,                                       -- request body enviado
  response_body JSONB,                                         -- respuesta AEAT

  -- Razón si skipped
  skip_reason TEXT,                                            -- 'no_fnmt_cert' | 'verifactu_disabled' | 'sii_active'

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE verifactu_submissions IS
  'B14 — tracking envíos Verifactu a AEAT. STUB: hasta cert FNMT, todas las '
  'rows son status=skipped con skip_reason=no_fnmt_cert. Cuando David obtenga '
  'cert + se active la integración real, este es el log auditable.';

ALTER TABLE verifactu_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifactu_submissions FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_verifactu_submissions_invoice
  ON verifactu_submissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_verifactu_submissions_pending
  ON verifactu_submissions(company_id, last_attempt_at)
  WHERE submission_status IN ('pending', 'error');
CREATE INDEX IF NOT EXISTS idx_verifactu_submissions_company
  ON verifactu_submissions(company_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION verifactu_submissions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verifactu_submissions_updated_at ON verifactu_submissions;
CREATE TRIGGER verifactu_submissions_updated_at
BEFORE UPDATE ON verifactu_submissions
FOR EACH ROW EXECUTE FUNCTION verifactu_submissions_set_updated_at();

-- RPC stub: registra intento. Cuando el endpoint TS tenga cert FNMT, llamará
-- esta RPC en el path real con submission_status='sent' y los datos completos.
CREATE OR REPLACE FUNCTION record_verifactu_submission(
  p_invoice_id UUID,
  p_status TEXT,
  p_skip_reason TEXT DEFAULT NULL,
  p_csv_aeat TEXT DEFAULT NULL,
  p_request_payload JSONB DEFAULT NULL,
  p_response_body JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM invoices WHERE id = p_invoice_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'invoice no encontrada: %', p_invoice_id;
  END IF;

  INSERT INTO verifactu_submissions(
    invoice_id, company_id, submission_status, submission_attempt,
    last_attempt_at, last_attempt_error,
    sent_at, csv_aeat, request_payload, response_body, skip_reason
  ) VALUES (
    p_invoice_id, v_company_id, p_status, 1,
    NOW(), p_error_message,
    CASE WHEN p_status = 'sent' OR p_status = 'accepted' THEN NOW() ELSE NULL END,
    p_csv_aeat, p_request_payload, p_response_body, p_skip_reason
  )
  RETURNING id INTO v_id;

  -- Update invoices.verifactu_csv_aeat + verifactu_sent_at si el envío fue OK
  IF p_status IN ('sent', 'accepted') AND p_csv_aeat IS NOT NULL THEN
    UPDATE invoices
      SET verifactu_csv_aeat = p_csv_aeat,
          verifactu_sent_at = NOW()
      WHERE id = p_invoice_id;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION record_verifactu_submission IS
  'B14 — registra un intento de envío Verifactu. status=skipped + reason=no_fnmt_cert '
  'mientras no haya cert. Cuando se active integración real, registra request/response/csv.';
