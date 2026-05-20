-- ============================================================================
-- compute_project_margin(p_project_id uuid)
-- ----------------------------------------------------------------------------
-- Devuelve agregados de rentabilidad real de un proyecto, basado en la nueva
-- dimensión `invoices.cost_scope` (proyecto_directo / proyecto_indirecto /
-- gasto_general / periodo_fiscal). Coherente con la definición contable PGC
-- RICAC 14/04/2015 (ingresos - directos - indirectos = margen neto obra).
--
-- Lecturas (sólo SELECT):
--   - invoices (filtradas por project_id, deleted_at IS NULL, cost_scope)
--   - certificaciones_obra (retención 5% LOE acumulada vs liberada)
--   - projects (presupuesto_inicial + budget_estimated fallback)
--
-- Devuelve JSON con todos los KPIs. NULL-safe (COALESCE 0 en todas las sumas).
--
-- Seguridad: SECURITY DEFINER + search_path fijo + GRANT EXECUTE explícito.
-- No REVOKE anon — la función devuelve sólo agregados de un project_id ya
-- conocido por el caller, sin filas individuales sensibles. RLS sigue
-- aplicando a queries directas a invoices.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_project_margin(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_presupuesto_inicial NUMERIC;
  v_budget_estimated NUMERIC;

  v_total_ingresos NUMERIC := 0;
  v_total_facturas_emitidas INT := 0;
  v_total_gastos_directos NUMERIC := 0;
  v_total_facturas_directas INT := 0;
  v_total_gastos_indirectos NUMERIC := 0;
  v_total_facturas_indirectas INT := 0;

  v_retencion_acumulada NUMERIC := 0;
  v_retencion_liberada NUMERIC := 0;
  v_retencion_pendiente NUMERIC := 0;

  v_presupuesto_certificado NUMERIC := 0;

  v_margen_bruto NUMERIC := 0;
  v_margen_neto NUMERIC := 0;
  v_margen_bruto_pct NUMERIC := 0;
  v_margen_neto_pct NUMERIC := 0;
  v_desviacion NUMERIC := 0;
  v_desviacion_pct NUMERIC := 0;
  v_presupuesto_ref NUMERIC := 0;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'p_project_id es obligatorio';
  END IF;

  -- Resolver proyecto (existe + no borrado) + presupuestos
  SELECT
    p.company_id,
    p.presupuesto_inicial,
    p.budget_estimated
  INTO
    v_company_id,
    v_presupuesto_inicial,
    v_budget_estimated
  FROM public.projects p
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Proyecto % no encontrado o borrado', p_project_id;
  END IF;

  -- Ingresos (facturas emitidas vinculadas al proyecto)
  -- Usamos amount_base si está, si no amount_total - vat_amount (igual que
  -- getNetAmt() en el cliente) — caemos en amount_total si nada más.
  SELECT
    COALESCE(SUM(COALESCE(
      i.amount_base,
      i.amount_total - COALESCE(i.vat_amount, 0),
      0
    )), 0),
    COUNT(*)
  INTO v_total_ingresos, v_total_facturas_emitidas
  FROM public.invoices i
  WHERE i.project_id = p_project_id
    AND i.direction = 'emitida'
    AND i.deleted_at IS NULL;

  -- Gastos directos (cost_scope='proyecto_directo')
  SELECT
    COALESCE(SUM(COALESCE(
      i.amount_base,
      i.amount_total - COALESCE(i.vat_amount, 0),
      0
    )), 0),
    COUNT(*)
  INTO v_total_gastos_directos, v_total_facturas_directas
  FROM public.invoices i
  WHERE i.project_id = p_project_id
    AND i.direction = 'recibida'
    AND i.cost_scope = 'proyecto_directo'
    AND i.deleted_at IS NULL;

  -- Gastos indirectos (cost_scope='proyecto_indirecto')
  SELECT
    COALESCE(SUM(COALESCE(
      i.amount_base,
      i.amount_total - COALESCE(i.vat_amount, 0),
      0
    )), 0),
    COUNT(*)
  INTO v_total_gastos_indirectos, v_total_facturas_indirectas
  FROM public.invoices i
  WHERE i.project_id = p_project_id
    AND i.direction = 'recibida'
    AND i.cost_scope = 'proyecto_indirecto'
    AND i.deleted_at IS NULL;

  -- Retención 5% LOE pendiente = acumulada - liberada
  SELECT
    COALESCE(SUM(COALESCE(c.retencion_acumulada, 0)), 0),
    COALESCE(SUM(COALESCE(c.retencion_liberada, 0)), 0),
    COALESCE(SUM(COALESCE(c.importe_actual, 0)), 0)
  INTO
    v_retencion_acumulada,
    v_retencion_liberada,
    v_presupuesto_certificado
  FROM public.certificaciones_obra c
  WHERE c.project_id = p_project_id
    AND c.deleted_at IS NULL;

  v_retencion_pendiente := GREATEST(v_retencion_acumulada - v_retencion_liberada, 0);

  -- Cálculo márgenes
  v_margen_bruto := v_total_ingresos - v_total_gastos_directos;
  v_margen_neto  := v_total_ingresos - v_total_gastos_directos - v_total_gastos_indirectos;

  IF v_total_ingresos > 0 THEN
    v_margen_bruto_pct := ROUND((v_margen_bruto / v_total_ingresos) * 100, 2);
    v_margen_neto_pct  := ROUND((v_margen_neto  / v_total_ingresos) * 100, 2);
  END IF;

  -- Desviación presupuesto: certificado vs presupuesto_inicial (fallback budget_estimated)
  v_presupuesto_ref := COALESCE(v_presupuesto_inicial, v_budget_estimated);
  IF v_presupuesto_ref IS NOT NULL AND v_presupuesto_ref > 0 THEN
    v_desviacion := v_presupuesto_certificado - v_presupuesto_ref;
    v_desviacion_pct := ROUND((v_desviacion / v_presupuesto_ref) * 100, 2);
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'company_id', v_company_id,
    'total_ingresos', v_total_ingresos,
    'total_facturas_emitidas', v_total_facturas_emitidas,
    'total_gastos_directos', v_total_gastos_directos,
    'total_facturas_directas', v_total_facturas_directas,
    'total_gastos_indirectos', v_total_gastos_indirectos,
    'total_facturas_indirectas', v_total_facturas_indirectas,
    'retencion_acumulada', v_retencion_acumulada,
    'retencion_liberada', v_retencion_liberada,
    'retencion_pendiente', v_retencion_pendiente,
    'presupuesto_inicial', v_presupuesto_inicial,
    'budget_estimated', v_budget_estimated,
    'presupuesto_referencia', v_presupuesto_ref,
    'presupuesto_certificado', v_presupuesto_certificado,
    'margen_bruto', v_margen_bruto,
    'margen_neto', v_margen_neto,
    'margen_bruto_pct', v_margen_bruto_pct,
    'margen_neto_pct', v_margen_neto_pct,
    'desviacion_presupuesto', v_desviacion,
    'desviacion_presupuesto_pct', v_desviacion_pct,
    'fecha_calculo', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.compute_project_margin(UUID) IS
  'Agregados rentabilidad real proyecto: ingresos/gastos por cost_scope, retención 5% LOE pendiente, desviación presupuesto. PGC RICAC 14/04/2015.';

-- Grants explícitos. authenticated lo necesita para llamadas vía PostgREST
-- desde el endpoint Next.js (que usa service_role pero igual concedemos a
-- ambos para flexibilidad futura). NO revocamos anon: la función ya hace
-- check de project_id existente y devuelve sólo agregados.
GRANT EXECUTE ON FUNCTION public.compute_project_margin(UUID) TO authenticated, service_role;
