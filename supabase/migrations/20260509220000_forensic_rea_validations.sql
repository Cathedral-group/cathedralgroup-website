-- Sesión 9/05/2026 noche muy tarde — Validaciones forense + REA + email whitelist + 5 functions SQL
-- Aplicada en producción vía Supabase Management API.
--
-- Añade el aparato técnico de validación profesional anti-fraude / anti-error
-- inspirado en lo que hacen Procore, Sage, Stampli, Rillion + AEAT/Verifactu.
--
-- Tablas nuevas:
--   - rea_status: cache consultas Registro Empresas Acreditadas (Ley 32/2006 construcción)
--   - factura_forensic: análisis técnico anti-fraude por factura (score 0-100)
--   - supplier_email_whitelist: emails conocidos por proveedor (anti-BEC)
--
-- Columnas nuevas:
--   - projects.codigo_corto: buyer reference que el proveedor pone en su factura
--
-- Functions PostgreSQL (5):
--   - find_fuzzy_duplicate_invoices: detecta duplicados ±0.05€ + ±N días
--   - find_similar_invoice_number: Levenshtein para detectar errores OCR (0/O, I/1)
--   - check_invoice_numbering_coherence: detecta saltos/retrocesos sospechosos
--   - get_vendor_project_loyalty: frecuencia bayesiana proveedor↔proyecto
--   - check_project_overrun: alerta si gasto+nueva supera presupuesto
--   - check_supplier_email_whitelist: chequea/registra email-supplier (anti-BEC)

-- ============================================================================
-- 1. TABLAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS rea_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nif TEXT NOT NULL,
  numero_rea TEXT,
  razon_social TEXT,
  fecha_alta DATE,
  fecha_caducidad DATE,
  estado TEXT,
  comunidad_autonoma TEXT,
  ultima_consulta TIMESTAMPTZ DEFAULT NOW(),
  raw_response JSONB,
  consulta_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rea_status_nif_unique UNIQUE (nif)
);
CREATE INDEX IF NOT EXISTS rea_status_nif_idx ON rea_status (nif);
CREATE INDEX IF NOT EXISTS rea_status_estado_idx ON rea_status (estado) WHERE estado IS NOT NULL;
COMMENT ON TABLE rea_status IS 'Cache consultas Registro Empresas Acreditadas (Ley 32/2006). Revalidar cada 90 días.';
COMMENT ON COLUMN rea_status.estado IS 'vigente | cancelada | suspendida | no_inscrita | error';

CREATE TABLE IF NOT EXISTS factura_forensic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  pdf_eof_count SMALLINT,
  pdf_metadata JSONB,
  pdf_alerts TEXT[],
  email_alerts TEXT[],
  numeracion_alerts TEXT[],
  duplicados_alerts TEXT[],
  rea_status TEXT,
  signature_status TEXT,
  score SMALLINT,
  reviewed_at TIMESTAMPTZ,
  decision TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS factura_forensic_invoice_id_idx ON factura_forensic (invoice_id);
CREATE INDEX IF NOT EXISTS factura_forensic_score_idx ON factura_forensic (score) WHERE score < 80;
CREATE INDEX IF NOT EXISTS factura_forensic_decision_idx ON factura_forensic (decision) WHERE decision IS NOT NULL;
COMMENT ON TABLE factura_forensic IS 'Análisis anti-fraude por factura. Score 0-100. <50 bloquear, 50-79 revisar, >=80 OK.';

CREATE TABLE IF NOT EXISTS supplier_email_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID,
  supplier_nif TEXT NOT NULL,
  email_address TEXT NOT NULL,
  domain TEXT GENERATED ALWAYS AS (split_part(email_address, '@', 2)) STORED,
  primer_uso TIMESTAMPTZ DEFAULT NOW(),
  ultimo_uso TIMESTAMPTZ DEFAULT NOW(),
  count_uso INT DEFAULT 1,
  confirmado BOOLEAN DEFAULT false,
  notes TEXT,
  CONSTRAINT supplier_email_unique UNIQUE (supplier_nif, email_address)
);
CREATE INDEX IF NOT EXISTS supplier_email_nif_idx ON supplier_email_whitelist (supplier_nif);
COMMENT ON TABLE supplier_email_whitelist IS 'Emails conocidos por proveedor — detecta phishing/BEC cuando llega de email no habitual.';

-- ============================================================================
-- 2. COLUMNAS NUEVAS
-- ============================================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS codigo_corto TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS projects_codigo_corto_idx ON projects (codigo_corto) WHERE codigo_corto IS NOT NULL;
COMMENT ON COLUMN projects.codigo_corto IS 'Código corto buyer reference que el proveedor pone en factura (ej. CG-MAR5).';

-- ============================================================================
-- 3. EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- ============================================================================
-- 4. FUNCTIONS (lookup ya conocido el supplier_nif al ejecutar workflow)
-- ============================================================================

-- Fuzzy duplicate finder
CREATE OR REPLACE FUNCTION find_fuzzy_duplicate_invoices(
  p_supplier_nif TEXT, p_amount NUMERIC, p_issue_date DATE,
  p_exclude_id UUID DEFAULT NULL, p_date_window_days INT DEFAULT 7
) RETURNS TABLE (id UUID, number TEXT, amount_total NUMERIC, issue_date DATE, similarity_amount NUMERIC, date_diff_days INT)
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.number, i.amount_total, i.issue_date,
    ROUND((1 - ABS(i.amount_total - p_amount) / NULLIF(GREATEST(i.amount_total, p_amount), 0))::NUMERIC, 4),
    ABS(i.issue_date - p_issue_date)::INT
  FROM invoices i
  WHERE i.supplier_nif = p_supplier_nif
    AND i.amount_total IS NOT NULL
    AND ABS(i.amount_total - p_amount) <= 0.05
    AND ABS(i.issue_date - p_issue_date) <= p_date_window_days
    AND (p_exclude_id IS NULL OR i.id != p_exclude_id)
    AND i.deleted_at IS NULL
  ORDER BY ABS(i.amount_total - p_amount), ABS(i.issue_date - p_issue_date)
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION find_fuzzy_duplicate_invoices(TEXT, NUMERIC, DATE, UUID, INT) TO anon, authenticated, service_role;

-- Levenshtein numero factura
CREATE OR REPLACE FUNCTION find_similar_invoice_number(
  p_supplier_nif TEXT, p_number TEXT, p_exclude_id UUID DEFAULT NULL, p_max_distance INT DEFAULT 2
) RETURNS TABLE (id UUID, number TEXT, distance INT, amount_total NUMERIC, issue_date DATE)
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.number, levenshtein(i.number, p_number)::INT, i.amount_total, i.issue_date
  FROM invoices i
  WHERE i.supplier_nif = p_supplier_nif
    AND i.number IS NOT NULL AND i.number != p_number
    AND length(i.number) BETWEEN length(p_number)-3 AND length(p_number)+3
    AND levenshtein(i.number, p_number) <= p_max_distance
    AND (p_exclude_id IS NULL OR i.id != p_exclude_id)
    AND i.deleted_at IS NULL
  ORDER BY levenshtein(i.number, p_number)
  LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION find_similar_invoice_number(TEXT, TEXT, UUID, INT) TO anon, authenticated, service_role;

-- Coherencia numeración por proveedor
CREATE OR REPLACE FUNCTION check_invoice_numbering_coherence(
  p_supplier_nif TEXT, p_number TEXT, p_issue_date DATE
) RETURNS TABLE (alert_type TEXT, message TEXT, severity TEXT)
AS $$
DECLARE
  v_num_int BIGINT; v_prev_num BIGINT; v_prev_date DATE; v_gap BIGINT;
BEGIN
  v_num_int := NULLIF(regexp_replace(p_number, '[^0-9]', '', 'g'), '')::BIGINT;
  IF v_num_int IS NULL THEN RETURN; END IF;
  SELECT regexp_replace(number, '[^0-9]', '', 'g')::BIGINT, issue_date
  INTO v_prev_num, v_prev_date
  FROM invoices
  WHERE supplier_nif = p_supplier_nif AND number IS NOT NULL
    AND issue_date < p_issue_date AND deleted_at IS NULL
  ORDER BY issue_date DESC, created_at DESC LIMIT 1;
  IF v_prev_num IS NOT NULL THEN
    v_gap := v_num_int - v_prev_num;
    IF v_num_int <= v_prev_num THEN
      RETURN QUERY SELECT 'numero_retrocede'::TEXT,
        format('Factura %s con número menor o igual al previo (%s del %s)', p_number, v_prev_num, v_prev_date), 'high'::TEXT;
    ELSIF v_gap > 100 THEN
      RETURN QUERY SELECT 'salto_grande'::TEXT,
        format('Salto de %s números desde la factura previa (%s)', v_gap, v_prev_num), 'medium'::TEXT;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION check_invoice_numbering_coherence(TEXT, TEXT, DATE) TO anon, authenticated, service_role;

-- Vendor-Project loyalty
CREATE OR REPLACE FUNCTION get_vendor_project_loyalty(
  p_supplier_nif TEXT, p_min_facturas INT DEFAULT 3
) RETURNS TABLE (proyecto_code TEXT, project_id UUID, count_facturas BIGINT, total_facturado NUMERIC, pct_loyalty NUMERIC, ultima_factura DATE)
AS $$
DECLARE v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM invoices i2
  WHERE i2.supplier_nif = p_supplier_nif AND i2.project_id IS NOT NULL AND i2.deleted_at IS NULL;
  IF v_total < p_min_facturas THEN RETURN; END IF;
  RETURN QUERY
  SELECT i.proyecto_code, i.project_id, COUNT(*)::BIGINT,
    SUM(i.amount_total), ROUND(100.0 * COUNT(*) / v_total, 1), MAX(i.issue_date)
  FROM invoices i
  WHERE i.supplier_nif = p_supplier_nif AND i.project_id IS NOT NULL AND i.deleted_at IS NULL
  GROUP BY i.proyecto_code, i.project_id
  ORDER BY COUNT(*) DESC, SUM(i.amount_total) DESC NULLS LAST LIMIT 5;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION get_vendor_project_loyalty(TEXT, INT) TO anon, authenticated, service_role;

-- Project overrun warning
CREATE OR REPLACE FUNCTION check_project_overrun(
  p_project_id UUID, p_new_amount NUMERIC, p_threshold_pct NUMERIC DEFAULT 1.05
) RETURNS TABLE (presupuesto_inicial NUMERIC, presupuesto_revisado NUMERIC, gasto_actual NUMERIC, gasto_con_nueva NUMERIC, pct_uso NUMERIC, alert TEXT)
AS $$
DECLARE
  v_pres_inicial NUMERIC; v_pres_revisado NUMERIC; v_gasto NUMERIC; v_pres_efectivo NUMERIC; v_alert TEXT;
BEGIN
  SELECT projects.presupuesto_inicial, projects.presupuesto_revisado
  INTO v_pres_inicial, v_pres_revisado
  FROM projects WHERE id = p_project_id;
  v_pres_efectivo := COALESCE(v_pres_revisado, v_pres_inicial);
  IF v_pres_efectivo IS NULL OR v_pres_efectivo = 0 THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount_total), 0) INTO v_gasto FROM invoices
  WHERE project_id = p_project_id AND direction = 'recibida' AND deleted_at IS NULL;
  IF (v_gasto + p_new_amount) > v_pres_efectivo * p_threshold_pct THEN
    v_alert := format('OVERRUN: gasto+nueva (%s) supera %s%% del presupuesto (%s)',
      ROUND(v_gasto + p_new_amount, 2), ROUND(p_threshold_pct * 100, 0), ROUND(v_pres_efectivo, 2));
  ELSIF (v_gasto + p_new_amount) > v_pres_efectivo * 0.85 THEN
    v_alert := format('AVISO: gasto+nueva alcanza el %s%% del presupuesto',
      ROUND(100.0 * (v_gasto + p_new_amount) / v_pres_efectivo, 1));
  END IF;
  RETURN QUERY SELECT v_pres_inicial, v_pres_revisado, v_gasto, v_gasto + p_new_amount,
    ROUND(100.0 * (v_gasto + p_new_amount) / v_pres_efectivo, 1), v_alert;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION check_project_overrun(UUID, NUMERIC, NUMERIC) TO anon, authenticated, service_role;

-- Email whitelist anti-BEC
CREATE OR REPLACE FUNCTION check_supplier_email_whitelist(
  p_supplier_nif TEXT, p_email_address TEXT
) RETURNS TABLE (is_known BOOLEAN, count_uso INT, primer_uso TIMESTAMPTZ, alert TEXT)
AS $$
DECLARE v_existing RECORD; v_email_norm TEXT;
BEGIN
  v_email_norm := LOWER(TRIM(p_email_address));
  IF v_email_norm = '' OR p_supplier_nif IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, NULL::TIMESTAMPTZ, 'sin_datos'::TEXT; RETURN;
  END IF;
  SELECT * INTO v_existing FROM supplier_email_whitelist
  WHERE supplier_nif = p_supplier_nif AND email_address = v_email_norm;
  IF v_existing.id IS NULL THEN
    INSERT INTO supplier_email_whitelist (supplier_nif, email_address, confirmado)
    VALUES (p_supplier_nif, v_email_norm, FALSE)
    ON CONFLICT (supplier_nif, email_address) DO NOTHING;
    IF EXISTS (SELECT 1 FROM supplier_email_whitelist WHERE supplier_nif = p_supplier_nif AND email_address != v_email_norm) THEN
      RETURN QUERY SELECT FALSE, 1, CURRENT_TIMESTAMP::TIMESTAMPTZ,
        format('§EMAIL_NUEVO:Email %s no es habitual para proveedor %s — verificar legitimidad (anti-BEC)', v_email_norm, p_supplier_nif)::TEXT;
    ELSE
      RETURN QUERY SELECT FALSE, 1, CURRENT_TIMESTAMP::TIMESTAMPTZ, 'primer_email_proveedor'::TEXT;
    END IF;
  ELSE
    UPDATE supplier_email_whitelist SET count_uso = count_uso + 1, ultimo_uso = NOW() WHERE id = v_existing.id;
    RETURN QUERY SELECT TRUE, (v_existing.count_uso + 1), v_existing.primer_uso, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION check_supplier_email_whitelist(TEXT, TEXT) TO anon, authenticated, service_role;

-- Pre-cargar whitelist con emails históricos
INSERT INTO supplier_email_whitelist (supplier_nif, email_address, count_uso, primer_uso, ultimo_uso, confirmado, notes)
SELECT supplier_nif, LOWER(TRIM(email_account)), COUNT(*), MIN(created_at), MAX(created_at), TRUE, 'auto-precarga histórica'
FROM invoices
WHERE supplier_nif IS NOT NULL AND email_account IS NOT NULL AND email_account != '' AND deleted_at IS NULL
GROUP BY supplier_nif, LOWER(TRIM(email_account))
ON CONFLICT (supplier_nif, email_address) DO NOTHING;
