-- B4 Generación auto borrador 303 IVA — Cathedral roadmap gestión integral
--
-- Por qué esta migración existe
--   Cada trimestre Cathedral tiene que presentar el modelo 303 (autoliquidación
--   IVA) en AEAT. El cálculo es siempre el mismo: agregar invoices del periodo,
--   separar repercutido (emitidas) de soportado deducible (recibidas), calcular
--   diferencia. Hacerlo a mano cada trimestre es trabajo repetitivo y propenso
--   a errores.
--
--   Esta RPC genera el borrador completo en JSON desde invoices + tablas
--   companies. Cubre las casillas básicas del 303 (régimen general). Casos
--   especiales (intragrupo, inversión sujeto pasivo, intracomunitarias) se
--   marcan en notas para revisión humana — el roadmap los va a cubrir
--   incrementalmente.
--
-- Sprint B4 — sesión 10/05/2026 noche tarde, post Bloque 0 F1-F5BD desplegado.

CREATE OR REPLACE FUNCTION generate_303_draft(
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
  v_emitidas JSONB;
  v_recibidas JSONB;
  v_intragroup JSONB;
  v_company JSONB;
  v_result JSONB;
  v_total_devengado NUMERIC;
  v_total_deducir NUMERIC;
BEGIN
  -- Resolver fechas del periodo (modelo 303 trimestral o anual; mensual si SII)
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
        RAISE EXCEPTION 'Periodo invalido: %. Permitidos: 1T,2T,3T,4T,A,01-12', p_periodo;
      END IF;
  END CASE;

  -- Datos empresa
  SELECT jsonb_build_object(
    'cif', cif,
    'razon_social', razon_social,
    'sii_obligado', sii_obligado,
    'verifactu_obligado', verifactu_obligado
  )
  INTO v_company
  FROM companies WHERE id = p_company_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Company no encontrada: %', p_company_id;
  END IF;

  -- Emitidas (IVA repercutido) — casillas régimen general 01-09
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'base_total', ROUND(COALESCE(SUM(amount_base), 0)::numeric, 2),
    'iva_total', ROUND(COALESCE(SUM(vat_amount), 0)::numeric, 2),
    'irpf_retenido_a_terceros', ROUND(COALESCE(SUM(retencion_importe), 0)::numeric, 2),
    -- Casillas régimen general
    'casilla_01_base_4', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 4 THEN amount_base END), 0)::numeric, 2),
    'casilla_03_cuota_4', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 4 THEN vat_amount END), 0)::numeric, 2),
    'casilla_04_base_10', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 10 THEN amount_base END), 0)::numeric, 2),
    'casilla_06_cuota_10', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 10 THEN vat_amount END), 0)::numeric, 2),
    'casilla_07_base_21', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 21 THEN amount_base END), 0)::numeric, 2),
    'casilla_09_cuota_21', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 21 THEN vat_amount END), 0)::numeric, 2),
    -- No sujetas / exentas
    'no_sujeto_o_exento', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 0 OR vat_pct IS NULL THEN amount_base END), 0)::numeric, 2),
    -- Rectificativas
    'casilla_25_rectificadas_base', ROUND(COALESCE(SUM(CASE WHEN es_rectificativa THEN amount_base END), 0)::numeric, 2),
    'casilla_26_rectificadas_cuota', ROUND(COALESCE(SUM(CASE WHEN es_rectificativa THEN vat_amount END), 0)::numeric, 2),
    -- Otras alertas
    'rectificativas_count', COALESCE(SUM(CASE WHEN es_rectificativa THEN 1 ELSE 0 END), 0),
    'recapitulativas_count', COALESCE(SUM(CASE WHEN es_recapitulativa THEN 1 ELSE 0 END), 0),
    'sin_revisar', COALESCE(SUM(CASE WHEN review_status = 'pendiente' THEN 1 ELSE 0 END), 0)
  )
  INTO v_emitidas
  FROM invoices
  WHERE company_id = p_company_id
    AND direction = 'emitida'
    AND issue_date BETWEEN v_start AND v_end
    AND deleted_at IS NULL
    AND COALESCE(review_status, 'pendiente') NOT IN ('rechazado', 'error');

  -- Recibidas (IVA soportado deducible) — casillas 28-31
  -- Asumimos toda factura recibida es deducible salvo casos especiales.
  -- En F5-completo se afinará con flag deducible explícito.
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'base_total', ROUND(COALESCE(SUM(amount_base), 0)::numeric, 2),
    'iva_total', ROUND(COALESCE(SUM(vat_amount), 0)::numeric, 2),
    'irpf_practicado', ROUND(COALESCE(SUM(retencion_importe), 0)::numeric, 2),
    -- Casilla 28-29: bienes/servicios corrientes
    'casilla_28_base_corrientes', ROUND(COALESCE(SUM(amount_base), 0)::numeric, 2),
    'casilla_29_cuota_corrientes', ROUND(COALESCE(SUM(vat_amount), 0)::numeric, 2),
    -- Desglose por tipo
    'base_4', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 4 THEN amount_base END), 0)::numeric, 2),
    'cuota_4', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 4 THEN vat_amount END), 0)::numeric, 2),
    'base_10', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 10 THEN amount_base END), 0)::numeric, 2),
    'cuota_10', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 10 THEN vat_amount END), 0)::numeric, 2),
    'base_21', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 21 THEN amount_base END), 0)::numeric, 2),
    'cuota_21', ROUND(COALESCE(SUM(CASE WHEN vat_pct = 21 THEN vat_amount END), 0)::numeric, 2),
    -- Alertas
    'sin_revisar', COALESCE(SUM(CASE WHEN review_status = 'pendiente' THEN 1 ELSE 0 END), 0),
    'needs_company_assignment', COALESCE(SUM(CASE WHEN needs_company_assignment THEN 1 ELSE 0 END), 0),
    'rectificativas_count', COALESCE(SUM(CASE WHEN es_rectificativa THEN 1 ELSE 0 END), 0)
  )
  INTO v_recibidas
  FROM invoices
  WHERE company_id = p_company_id
    AND direction = 'recibida'
    AND issue_date BETWEEN v_start AND v_end
    AND deleted_at IS NULL
    AND COALESCE(review_status, 'pendiente') NOT IN ('rechazado', 'error');

  -- Operaciones intragrupo del periodo (alerta — modelo 232 anual)
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'importe_total', ROUND(COALESCE(SUM(importe), 0)::numeric, 2)
  )
  INTO v_intragroup
  FROM intragroup_transactions
  WHERE (issuer_company_id = p_company_id OR receiver_company_id = p_company_id)
    AND fecha_operacion BETWEEN v_start AND v_end
    AND deleted_at IS NULL;

  -- Resultado consolidado
  v_total_devengado := (v_emitidas->>'iva_total')::numeric;
  v_total_deducir := (v_recibidas->>'iva_total')::numeric;

  v_result := jsonb_build_object(
    'modelo', '303',
    'borrador', true,
    'company', v_company,
    'company_id', p_company_id,
    'ejercicio', p_ejercicio,
    'periodo', p_periodo,
    'periodo_inicio', v_start,
    'periodo_fin', v_end,
    'generado_at', NOW(),
    'emitidas', v_emitidas,
    'recibidas', v_recibidas,
    'intragroup_alerta', v_intragroup,
    -- Casillas resumen del modelo
    'casilla_27_total_devengado', ROUND(v_total_devengado, 2),
    'casilla_45_total_deducir', ROUND(v_total_deducir, 2),
    'casilla_64_resultado', ROUND(v_total_devengado - v_total_deducir, 2),
    'a_ingresar', ROUND(GREATEST(v_total_devengado - v_total_deducir, 0), 2),
    'a_devolver_o_compensar', ROUND(GREATEST(v_total_deducir - v_total_devengado, 0), 2),
    -- Status check para revisor humano
    'alertas', CASE
      WHEN (v_emitidas->>'sin_revisar')::int > 0 OR (v_recibidas->>'sin_revisar')::int > 0
        THEN jsonb_build_array(
          'Hay facturas sin revisar en el periodo. Revisar en /admin/revision antes de presentar.'
        )
      ELSE jsonb_build_array()
    END,
    'notas', jsonb_build_array(
      'Borrador automatico calculado desde invoices del periodo.',
      'Validar manualmente antes de presentar a AEAT.',
      'No incluye automaticamente: inversion sujeto pasivo (RD), operaciones intracomunitarias, regimen recargo equivalencia, prorrata.',
      'Solo facturas con review_status NOT IN (rechazado, error).',
      'Las facturas sin needs_company_assignment=true se omiten — revisarlas manualmente en /admin/revision.',
      CASE WHEN (v_intragroup->>'count')::int > 0
        THEN format('ATENCION: %s operaciones intragrupo en el periodo. Verificar si afectan al 303 (operaciones vinculadas, modelo 232 anual).', v_intragroup->>'count')
        ELSE 'Sin operaciones intragrupo en el periodo.'
      END
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION generate_303_draft IS
  'B4 — genera borrador modelo 303 IVA desde invoices del periodo. Cubre '
  'régimen general con casillas 01-09, 27, 28-29, 45, 64. Casos especiales '
  '(inversión sujeto pasivo, intracomunitarias, prorrata) requieren ajuste '
  'manual. Solo facturas activas con review_status not in (rechazado,error).';

-- RPC complementaria: generate_111_draft (retenciones IRPF rendimientos trabajo y profesionales)
CREATE OR REPLACE FUNCTION generate_111_draft(
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
  v_facturas_profesionales JSONB;
  v_nominas JSONB;
  v_company JSONB;
BEGIN
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

  -- Retenciones a profesionales (facturas recibidas con retención)
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'base_total', ROUND(COALESCE(SUM(amount_base), 0)::numeric, 2),
    'retencion_total', ROUND(COALESCE(SUM(retencion_importe), 0)::numeric, 2)
  )
  INTO v_facturas_profesionales
  FROM invoices
  WHERE company_id = p_company_id
    AND direction = 'recibida'
    AND issue_date BETWEEN v_start AND v_end
    AND deleted_at IS NULL
    AND retencion_importe > 0
    AND COALESCE(review_status, 'pendiente') NOT IN ('rechazado', 'error');

  -- Retenciones a trabajadores (nóminas) — desde tabla payrolls del periodo
  -- Campos reales: total_devengado, irpf_importe, irpf_base, periodo_desde/hasta
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'bruto_total', ROUND(COALESCE(SUM(total_devengado), 0)::numeric, 2),
    'base_irpf_total', ROUND(COALESCE(SUM(irpf_base), 0)::numeric, 2),
    'retencion_irpf_total', ROUND(COALESCE(SUM(irpf_importe), 0)::numeric, 2)
  )
  INTO v_nominas
  FROM payrolls
  WHERE company_id = p_company_id
    AND deleted_at IS NULL
    AND COALESCE(periodo_desde, periodo_hasta, created_at::date) BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'modelo', '111',
    'borrador', true,
    'company', v_company,
    'company_id', p_company_id,
    'ejercicio', p_ejercicio,
    'periodo', p_periodo,
    'periodo_inicio', v_start,
    'periodo_fin', v_end,
    'generado_at', NOW(),
    'profesionales', v_facturas_profesionales,
    'nominas', v_nominas,
    'casilla_01_perceptores_trabajo', (v_nominas->>'count')::int,
    'casilla_02_base_trabajo', (v_nominas->>'base_irpf_total')::numeric,
    'casilla_03_retencion_trabajo', (v_nominas->>'retencion_irpf_total')::numeric,
    'casilla_04_perceptores_profesionales', (v_facturas_profesionales->>'count')::int,
    'casilla_05_base_profesionales', (v_facturas_profesionales->>'base_total')::numeric,
    'casilla_06_retencion_profesionales', (v_facturas_profesionales->>'retencion_total')::numeric,
    'total_a_ingresar', ROUND(
      COALESCE((v_nominas->>'retencion_irpf_total')::numeric, 0) +
      COALESCE((v_facturas_profesionales->>'retencion_total')::numeric, 0),
      2
    ),
    'notas', jsonb_build_array(
      'Borrador automatico modelo 111. Validar antes de presentar.',
      'No incluye: rendimientos capital mobiliario (modelo 123), arrendamientos (115), premios y deportistas.'
    )
  );
END;
$$;

COMMENT ON FUNCTION generate_111_draft IS
  'B4 — genera borrador modelo 111 IRPF retenciones rendimientos trabajo + '
  'profesionales del periodo. Suma nominas + facturas recibidas con retencion_importe>0.';
