-- ════════════════════════════════════════════════════════════════
-- Auto-creación de employee desde primera nómina con NIF nuevo
-- + autocompletado de modelos fiscales (modelo_111_trimestre, modelo_190_anio)
-- ════════════════════════════════════════════════════════════════

-- Función trigger que se ejecuta en INSERT de payrolls:
--   1. Si payrolls.employee_id es NULL pero payrolls.trabajador_nif tiene valor:
--      - Buscar employee por NIF
--      - Si existe → asignar employee_id
--      - Si NO existe → crear employee mínimo con datos snapshot del trabajador
--   2. Autocompletar modelo_111_trimestre + modelo_190_anio si están vacíos
CREATE OR REPLACE FUNCTION trigger_payroll_link_employee()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  -- Solo si tiene NIF y aún no está vinculado
  IF NEW.trabajador_nif IS NOT NULL AND NEW.employee_id IS NULL THEN
    -- Buscar existente
    SELECT id INTO v_employee_id
    FROM employees
    WHERE nif = NEW.trabajador_nif
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_employee_id IS NULL THEN
      -- Crear empleado nuevo con datos snapshot de la nómina
      INSERT INTO employees (
        nombre, nif, num_afiliacion_ss,
        empresa_actual_cif, empresa_actual_nombre,
        categoria_profesional, grupo_cotizacion,
        centro_trabajo, departamento,
        fecha_antiguedad,
        notes
      )
      VALUES (
        NEW.trabajador_nombre, NEW.trabajador_nif, NEW.trabajador_num_afiliacion_ss,
        NEW.empresa_cif, NEW.empresa_nombre,
        NEW.trabajador_categoria, NEW.trabajador_grupo_cotizacion,
        NEW.trabajador_centro, NEW.trabajador_departamento,
        NEW.trabajador_fecha_antiguedad,
        '[Auto-creado desde primera nómina ' || COALESCE(to_char(NEW.periodo_desde, 'MM/YYYY'), '?') || ']'
      )
      RETURNING id INTO v_employee_id;
    END IF;

    NEW.employee_id := v_employee_id;
  END IF;

  -- Autocompletar modelos fiscales si vienen vacíos del workflow
  IF NEW.modelo_111_trimestre IS NULL AND NEW.periodo_mes IS NOT NULL THEN
    NEW.modelo_111_trimestre := 'Q' || CEIL(NEW.periodo_mes::numeric / 3)::text;
  END IF;
  IF NEW.modelo_190_anio IS NULL AND NEW.periodo_anio IS NOT NULL THEN
    NEW.modelo_190_anio := NEW.periodo_anio;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_link_employee_trigger ON payrolls;
CREATE TRIGGER payroll_link_employee_trigger
  BEFORE INSERT ON payrolls
  FOR EACH ROW EXECUTE FUNCTION trigger_payroll_link_employee();

-- ─── Backfill: vincular nóminas existentes a employees + actualizar modelos ───
DO $$
DECLARE
  r record;
  v_employee_id uuid;
BEGIN
  FOR r IN
    SELECT id, trabajador_nif, trabajador_nombre, trabajador_num_afiliacion_ss,
           empresa_cif, empresa_nombre, trabajador_categoria,
           trabajador_grupo_cotizacion, trabajador_centro, trabajador_departamento,
           trabajador_fecha_antiguedad, periodo_desde, periodo_mes, periodo_anio
    FROM payrolls
    WHERE deleted_at IS NULL AND employee_id IS NULL AND trabajador_nif IS NOT NULL
  LOOP
    SELECT id INTO v_employee_id FROM employees WHERE nif = r.trabajador_nif AND deleted_at IS NULL LIMIT 1;
    IF v_employee_id IS NULL THEN
      INSERT INTO employees (
        nombre, nif, num_afiliacion_ss,
        empresa_actual_cif, empresa_actual_nombre,
        categoria_profesional, grupo_cotizacion,
        centro_trabajo, departamento, fecha_antiguedad, notes
      ) VALUES (
        r.trabajador_nombre, r.trabajador_nif, r.trabajador_num_afiliacion_ss,
        r.empresa_cif, r.empresa_nombre, r.trabajador_categoria,
        r.trabajador_grupo_cotizacion, r.trabajador_centro, r.trabajador_departamento,
        r.trabajador_fecha_antiguedad,
        '[Auto-creado en backfill desde nómina ' || COALESCE(to_char(r.periodo_desde, 'MM/YYYY'), '?') || ']'
      ) RETURNING id INTO v_employee_id;
    END IF;
    UPDATE payrolls SET
      employee_id = v_employee_id,
      modelo_111_trimestre = COALESCE(modelo_111_trimestre, 'Q' || CEIL(r.periodo_mes::numeric / 3)::text),
      modelo_190_anio = COALESCE(modelo_190_anio, r.periodo_anio)
    WHERE id = r.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
