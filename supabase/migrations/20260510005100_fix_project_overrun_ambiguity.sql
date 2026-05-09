-- Bug detectado por forensic_rpcs_healthcheck (sesión 10/05 madrugada):
-- check_project_overrun fallaba con "column reference 'presupuesto_inicial' is ambiguous"
-- — mismo patrón que tuvimos en check_supplier_email_whitelist (count_uso vs OUT param).
--
-- Fix: qualificar las columnas con `projects.` para evitar colisión con OUT params.

CREATE OR REPLACE FUNCTION public.check_project_overrun(
  p_project_id uuid,
  p_new_amount numeric,
  p_threshold_pct numeric DEFAULT 1.05
)
RETURNS TABLE(
  presupuesto_inicial numeric,
  presupuesto_revisado numeric,
  gasto_actual numeric,
  gasto_con_nueva numeric,
  pct_uso numeric,
  alert text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_pres_inicial NUMERIC;
  v_pres_revisado NUMERIC;
  v_gasto NUMERIC;
  v_pres_efectivo NUMERIC;
  v_alert TEXT;
BEGIN
  -- Qualificar columnas con projects.* evita ambigüedad con OUT params
  SELECT projects.presupuesto_inicial, projects.presupuesto_revisado
  INTO v_pres_inicial, v_pres_revisado
  FROM projects WHERE projects.id = p_project_id;

  v_pres_efectivo := COALESCE(v_pres_revisado, v_pres_inicial);
  IF v_pres_efectivo IS NULL OR v_pres_efectivo = 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount_total), 0) INTO v_gasto
  FROM invoices
  WHERE invoices.project_id = p_project_id
    AND invoices.direction = 'recibida'
    AND invoices.deleted_at IS NULL;

  IF (v_gasto + p_new_amount) > v_pres_efectivo * p_threshold_pct THEN
    v_alert := format('OVERRUN: gasto+nueva (%s) supera %s%% del presupuesto (%s)',
      ROUND(v_gasto + p_new_amount, 2),
      ROUND(p_threshold_pct * 100, 0),
      ROUND(v_pres_efectivo, 2));
  ELSIF (v_gasto + p_new_amount) > v_pres_efectivo * 0.85 THEN
    v_alert := format('AVISO: gasto+nueva alcanza el %s%% del presupuesto',
      ROUND(100.0 * (v_gasto + p_new_amount) / v_pres_efectivo, 1));
  END IF;

  RETURN QUERY SELECT
    v_pres_inicial,
    v_pres_revisado,
    v_gasto,
    v_gasto + p_new_amount,
    ROUND(100.0 * (v_gasto + p_new_amount) / v_pres_efectivo, 1),
    v_alert;
END;
$function$;
