-- Sprint 10/05 — Calendario fiscal Cathedral.
-- Permite saber en cada momento qué modelos AEAT toca presentar y cuáles ya se hicieron.
-- Base para gestión integral Hacienda + Trabajadores desde la plataforma.
--
-- Fechas AEAT España para sociedades SL (Cathedral House Investment SL):
-- - 303 IVA trimestral: T1→20 abr, T2→20 jul, T3→20 oct, T4→30 ene
-- - 111 IRPF retenciones trimestral: mismas fechas que 303
-- - 115 IRPF alquileres trimestral: mismas fechas
-- - 202 Pagos fraccionados IS trimestrales: 20 abr, 20 oct, 20 dic
-- - 390 IVA anual (resumen): 30 enero del año siguiente
-- - 347 Operaciones >3.000€: 29 febrero del año siguiente
-- - 190 Resumen anual retenciones IRPF: 31 enero del año siguiente
-- - 200 Impuesto Sociedades: 1-25 julio (cierre 31 dic año anterior)

-- Tabla con metadatos de cada modelo
CREATE TABLE IF NOT EXISTS public.fiscal_models (
  modelo text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  periodicidad text NOT NULL CHECK (periodicidad IN ('trimestral', 'anual', 'mensual')),
  obligatorio_default boolean NOT NULL DEFAULT true,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO public.fiscal_models (modelo, nombre, descripcion, periodicidad, notes) VALUES
  ('303', 'IVA trimestral', 'Autoliquidación del IVA del trimestre. Diferencia entre IVA repercutido y soportado.', 'trimestral', 'Plazo: día 20 del mes siguiente al fin del trimestre. T4: día 30 enero.'),
  ('111', 'IRPF retenciones trabajadores y profesionales', 'Retenciones a trabajadores (nóminas) y profesionales (facturas).', 'trimestral', 'Plazo: día 20 del mes siguiente. T4: día 30 enero.'),
  ('115', 'IRPF retenciones alquileres', 'Retenciones por arrendamientos urbanos.', 'trimestral', 'Plazo igual que 111.'),
  ('202', 'Pagos fraccionados Sociedades', 'Pagos a cuenta del IS. 3 plazos: abril, octubre, diciembre.', 'trimestral', 'Solo 3 al año: 20 abril (P1), 20 octubre (P2), 20 diciembre (P3). NO en julio.'),
  ('390', 'IVA resumen anual', 'Resumen anual del IVA. Junto con T4 del 303.', 'anual', 'Plazo: 30 enero año siguiente.'),
  ('347', 'Operaciones con terceros >3.000€', 'Declaración informativa de clientes/proveedores con operaciones >3.000€/año.', 'anual', 'Plazo: 29 febrero año siguiente.'),
  ('190', 'Resumen anual retenciones IRPF', 'Resumen anual del 111: trabajadores y profesionales con retención.', 'anual', 'Plazo: 31 enero año siguiente.'),
  ('200', 'Impuesto sobre Sociedades', 'Liquidación anual del IS. Base imponible × 25%.', 'anual', 'Plazo: 25 julio (cierre 31 dic año anterior).')
ON CONFLICT (modelo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  notes = EXCLUDED.notes;

COMMENT ON TABLE public.fiscal_models IS
  'Definición de modelos AEAT obligatorios para Cathedral. Sirve de plantilla para calcular vencimientos automáticos.';

-- ─── Función helper: ajustar fecha al siguiente día hábil ───
-- AEAT considera hábiles lunes-viernes (no sábados/domingos). Festivos nacionales NO ajustamos
-- (queda como deuda menor — el plazo real puede ser un día antes en años con festivo en deadline).
CREATE OR REPLACE FUNCTION public.next_business_day(p_date date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow int;
BEGIN
  v_dow := EXTRACT(DOW FROM p_date);  -- 0=domingo, 6=sábado
  IF v_dow = 0 THEN
    RETURN p_date + INTERVAL '1 day';  -- domingo → lunes
  ELSIF v_dow = 6 THEN
    RETURN p_date + INTERVAL '2 days'; -- sábado → lunes
  ELSE
    RETURN p_date;
  END IF;
END;
$$;

-- ─── RPC principal: próximos vencimientos fiscales ───
CREATE OR REPLACE FUNCTION public.upcoming_fiscal_deadlines(
  p_days_ahead int DEFAULT 60,
  p_days_overdue int DEFAULT 30,  -- también incluir vencidos hace <X días sin presentar
  p_company_cif text DEFAULT 'B19761915'
)
RETURNS TABLE(
  modelo text,
  nombre text,
  descripcion text,
  ejercicio int,
  periodo text,
  fecha_limite date,
  days_until_deadline int,
  estado text,
  importe_a_ingresar numeric,
  filing_id uuid,
  is_overdue boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_min_date date := v_today - (p_days_overdue || ' days')::interval;
  v_max_date date := v_today + (p_days_ahead || ' days')::interval;
  v_year int;
  r record;
BEGIN
  -- Generar deadlines candidatos para los próximos modelos.
  -- Año actual y siguiente cubre todos los plazos posibles dentro de ±90 días.

  FOR v_year IN (EXTRACT(YEAR FROM v_today)::int - 1)..(EXTRACT(YEAR FROM v_today)::int + 1) LOOP

    -- ─── 303 IVA TRIMESTRAL ───
    -- T1→20 abr, T2→20 jul, T3→20 oct, T4→30 ene del año siguiente
    FOR r IN
      SELECT 'T1'::text AS p, MAKE_DATE(v_year, 4, 20) AS fl UNION ALL
      SELECT 'T2', MAKE_DATE(v_year, 7, 20) UNION ALL
      SELECT 'T3', MAKE_DATE(v_year, 10, 20) UNION ALL
      SELECT 'T4', MAKE_DATE(v_year + 1, 1, 30)
    LOOP
      modelo := '303'; nombre := 'IVA trimestral'; ejercicio := v_year; periodo := r.p;
      fecha_limite := next_business_day(r.fl);
      IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
        RETURN QUERY SELECT * FROM resolve_filing_status('303', v_year, r.p, fecha_limite, v_today, p_company_cif);
      END IF;
    END LOOP;

    -- ─── 111 IRPF retenciones trimestral ───
    FOR r IN
      SELECT 'T1'::text AS p, MAKE_DATE(v_year, 4, 20) AS fl UNION ALL
      SELECT 'T2', MAKE_DATE(v_year, 7, 20) UNION ALL
      SELECT 'T3', MAKE_DATE(v_year, 10, 20) UNION ALL
      SELECT 'T4', MAKE_DATE(v_year + 1, 1, 30)
    LOOP
      fecha_limite := next_business_day(r.fl);
      IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
        RETURN QUERY SELECT * FROM resolve_filing_status('111', v_year, r.p, fecha_limite, v_today, p_company_cif);
      END IF;
    END LOOP;

    -- ─── 115 IRPF alquileres trimestral ───
    FOR r IN
      SELECT 'T1'::text AS p, MAKE_DATE(v_year, 4, 20) AS fl UNION ALL
      SELECT 'T2', MAKE_DATE(v_year, 7, 20) UNION ALL
      SELECT 'T3', MAKE_DATE(v_year, 10, 20) UNION ALL
      SELECT 'T4', MAKE_DATE(v_year + 1, 1, 30)
    LOOP
      fecha_limite := next_business_day(r.fl);
      IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
        RETURN QUERY SELECT * FROM resolve_filing_status('115', v_year, r.p, fecha_limite, v_today, p_company_cif);
      END IF;
    END LOOP;

    -- ─── 202 Pagos fraccionados IS (3 plazos al año) ───
    FOR r IN
      SELECT '1P'::text AS p, MAKE_DATE(v_year, 4, 20) AS fl UNION ALL
      SELECT '2P', MAKE_DATE(v_year, 10, 20) UNION ALL
      SELECT '3P', MAKE_DATE(v_year, 12, 20)
    LOOP
      fecha_limite := next_business_day(r.fl);
      IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
        RETURN QUERY SELECT * FROM resolve_filing_status('202', v_year, r.p, fecha_limite, v_today, p_company_cif);
      END IF;
    END LOOP;

    -- ─── 390 IVA anual (30 enero del siguiente) ───
    fecha_limite := next_business_day(MAKE_DATE(v_year + 1, 1, 30));
    IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
      RETURN QUERY SELECT * FROM resolve_filing_status('390', v_year, 'A', fecha_limite, v_today, p_company_cif);
    END IF;

    -- ─── 347 (29 feb del siguiente) ───
    fecha_limite := next_business_day(MAKE_DATE(v_year + 1, 2, 28));  -- 28 feb (no contamos bisiestos)
    IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
      RETURN QUERY SELECT * FROM resolve_filing_status('347', v_year, 'A', fecha_limite, v_today, p_company_cif);
    END IF;

    -- ─── 190 retenciones anual (31 ene del siguiente) ───
    fecha_limite := next_business_day(MAKE_DATE(v_year + 1, 1, 31));
    IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
      RETURN QUERY SELECT * FROM resolve_filing_status('190', v_year, 'A', fecha_limite, v_today, p_company_cif);
    END IF;

    -- ─── 200 IS (25 jul del siguiente) ───
    fecha_limite := next_business_day(MAKE_DATE(v_year + 1, 7, 25));
    IF fecha_limite BETWEEN v_min_date AND v_max_date THEN
      RETURN QUERY SELECT * FROM resolve_filing_status('200', v_year, 'A', fecha_limite, v_today, p_company_cif);
    END IF;

  END LOOP;

  RETURN;
END;
$$;

-- Helper interno para resolver estado del filing (presentado/pendiente)
CREATE OR REPLACE FUNCTION public.resolve_filing_status(
  p_modelo text,
  p_ejercicio int,
  p_periodo text,
  p_fecha_limite date,
  p_today date,
  p_company_cif text
)
RETURNS TABLE(
  modelo text,
  nombre text,
  descripcion text,
  ejercicio int,
  periodo text,
  fecha_limite date,
  days_until_deadline int,
  estado text,
  importe_a_ingresar numeric,
  filing_id uuid,
  is_overdue boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_meta record;
BEGIN
  SELECT fm.nombre, fm.descripcion INTO v_meta
  FROM fiscal_models fm WHERE fm.modelo = p_modelo;

  SELECT tf.id, tf.estado, tf.importe_a_ingresar INTO v_existing
  FROM tax_filings tf
  WHERE tf.modelo = p_modelo
    AND tf.ejercicio = p_ejercicio
    AND tf.periodo = p_periodo
    AND tf.empresa_cif = p_company_cif
    AND tf.deleted_at IS NULL
  ORDER BY tf.created_at DESC
  LIMIT 1;

  modelo := p_modelo;
  nombre := COALESCE(v_meta.nombre, p_modelo);
  descripcion := v_meta.descripcion;
  ejercicio := p_ejercicio;
  periodo := p_periodo;
  fecha_limite := p_fecha_limite;
  days_until_deadline := (p_fecha_limite - p_today)::int;
  estado := COALESCE(v_existing.estado, 'pendiente');
  importe_a_ingresar := v_existing.importe_a_ingresar;
  filing_id := v_existing.id;
  is_overdue := (p_fecha_limite < p_today AND COALESCE(v_existing.estado, 'pendiente') NOT IN ('presentado', 'pagado'));

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upcoming_fiscal_deadlines(int, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_business_day(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_filing_status(text, int, text, date, date, text) TO service_role;

COMMENT ON FUNCTION public.upcoming_fiscal_deadlines IS
  'Devuelve próximos vencimientos AEAT (modelos 303, 111, 115, 202, 390, 347, 190, 200)
   cruzados con tax_filings ya presentadas. Permite ver qué falta presentar y qué está vencido.
   Default ventana: ±60 días futuros + 30 días vencidos sin presentar.';
