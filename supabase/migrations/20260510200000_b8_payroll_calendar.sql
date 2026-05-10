-- B8 — Calendario nóminas + alertas mensuales
--
-- Cada mes hay 3 hitos críticos:
--   día 22: empezar a generar nóminas del mes corriente
--   día 27: pagar nóminas (transferencia bancaria a trabajadores)
--   día 30/último: pagar SS (TC1/TC2 al banco autorizado)
--
-- Esta RPC verifica si Cathedral está al día en cada hito y devuelve
-- estado para que un cron mensual cree system_notifications.
--
-- Sprint B8 — sesión 10/05/2026 noche súper tarde, post B6+B7.

CREATE OR REPLACE FUNCTION payroll_calendar_check(p_company_id UUID DEFAULT NULL)
RETURNS TABLE(
  company_id UUID,
  company_name TEXT,
  current_month INT,
  current_year INT,
  active_employees INT,
  payrolls_generated INT,
  payrolls_pending INT,
  ss_filing_done BOOLEAN,
  hint_22 TEXT,
  hint_27 TEXT,
  hint_30 TEXT,
  alerta_global TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_month INT := EXTRACT(month FROM v_today);
  v_year INT := EXTRACT(year FROM v_today);
  v_day INT := EXTRACT(day FROM v_today);
BEGIN
  RETURN QUERY
  WITH co AS (
    SELECT id, razon_social
    FROM companies
    WHERE deleted_at IS NULL AND status = 'ACTIVE'
      AND (p_company_id IS NULL OR id = p_company_id)
  ),
  emp AS (
    SELECT e.company_id, COUNT(*)::int AS active_count
    FROM employees e
    WHERE e.deleted_at IS NULL
      AND (e.fecha_baja IS NULL OR e.fecha_baja >= v_today)
    GROUP BY e.company_id
  ),
  pay AS (
    SELECT p.company_id, COUNT(*)::int AS gen_count
    FROM payrolls p
    WHERE p.deleted_at IS NULL
      AND p.periodo_anio = v_year
      AND p.periodo_mes = v_month
    GROUP BY p.company_id
  ),
  ss AS (
    SELECT s.company_id, COUNT(*)::int AS filed_count
    FROM ss_filings s
    WHERE s.deleted_at IS NULL
      AND s.ejercicio = v_year
      AND s.mes = v_month
      AND s.fecha_presentacion IS NOT NULL
    GROUP BY s.company_id
  )
  SELECT
    co.id,
    co.razon_social,
    v_month,
    v_year,
    COALESCE(emp.active_count, 0),
    COALESCE(pay.gen_count, 0),
    GREATEST(COALESCE(emp.active_count, 0) - COALESCE(pay.gen_count, 0), 0),
    COALESCE(ss.filed_count, 0) > 0,
    CASE
      WHEN v_day < 22 THEN format('Día %s/%s. Generar nóminas a partir del 22.', v_day, v_month)
      WHEN COALESCE(pay.gen_count, 0) >= COALESCE(emp.active_count, 0) THEN '✓ Nóminas generadas'
      WHEN v_day >= 22 AND COALESCE(pay.gen_count, 0) < COALESCE(emp.active_count, 0)
        THEN format('⚠ Faltan %s nóminas por generar', GREATEST(COALESCE(emp.active_count, 0) - COALESCE(pay.gen_count, 0), 0))
      ELSE 'OK'
    END,
    CASE
      WHEN v_day < 27 THEN format('Pago nóminas el día 27.')
      WHEN COALESCE(pay.gen_count, 0) = 0 AND COALESCE(emp.active_count, 0) > 0
        THEN '🔴 Sin nóminas generadas todavía. Bloquea pago.'
      WHEN v_day = 27 THEN '⏰ HOY pago nóminas — generar SEPA'
      WHEN v_day > 27 THEN format('Pasado día 27. %s nóminas pendientes pago.', COALESCE(pay.gen_count, 0))
      ELSE '—'
    END,
    CASE
      WHEN v_day < 28 THEN format('Pago SS día último del mes.')
      WHEN COALESCE(ss.filed_count, 0) > 0 THEN '✓ SS presentada'
      WHEN v_day >= 28 AND COALESCE(ss.filed_count, 0) = 0
        THEN '🔴 SS pendiente — vence fin de mes'
      ELSE '—'
    END,
    CASE
      WHEN COALESCE(emp.active_count, 0) = 0 THEN 'info'
      WHEN v_day >= 28 AND COALESCE(ss.filed_count, 0) = 0 THEN 'critical'
      WHEN v_day >= 27 AND COALESCE(pay.gen_count, 0) < COALESCE(emp.active_count, 0) THEN 'critical'
      WHEN v_day >= 22 AND COALESCE(pay.gen_count, 0) < COALESCE(emp.active_count, 0) THEN 'warning'
      ELSE 'info'
    END
  FROM co
  LEFT JOIN emp ON emp.company_id = co.id
  LEFT JOIN pay ON pay.company_id = co.id
  LEFT JOIN ss ON ss.company_id = co.id;
END;
$$;

COMMENT ON FUNCTION payroll_calendar_check IS
  'B8 — verifica estado mensual nóminas y SS por empresa. Devuelve hints '
  'por hito (día 22 generar / día 27 pagar / día 30 SS) + severity global '
  '(info/warning/critical) para cron alarma mensual.';
