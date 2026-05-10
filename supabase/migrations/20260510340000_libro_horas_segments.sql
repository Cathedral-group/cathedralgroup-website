-- Roadmap libro horas — tramos múltiples por día (cuando trabajador cambia de obra)
--
-- David: "Si yo le asigno a un sitio pero tiene que moverse a otro, ¿cómo podría
-- modificar el fichaje poniendo los parciales en los que ha estado?"
--
-- Modelo:
--   - time_records sigue siendo 1 por día (agregado total)
--   - Nueva tabla time_record_segments con N tramos por parte
--   - Cada tramo: proyecto + hora_inicio + hora_fin + horas + geo
--   - Suma de segments = horas del time_record (mantenido por trigger)
--   - Modo simple (1 segment) sigue funcionando = experiencia actual
--   - compute_project_labor_costs ahora suma por segments si existen

CREATE TABLE IF NOT EXISTS time_record_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_record_id UUID NOT NULL REFERENCES time_records(id) ON DELETE CASCADE,

  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  hora_inicio TIME,
  hora_fin TIME,

  horas_ordinarias NUMERIC(5,2) DEFAULT 0,
  horas_extra NUMERIC(5,2) DEFAULT 0,
  horas_nocturnas NUMERIC(5,2) DEFAULT 0,

  observaciones TEXT,
  orden INT NOT NULL DEFAULT 1, -- para ordenar visualmente

  -- Geo del tramo (cuando trabajador ficha en este proyecto)
  geo_lat NUMERIC(10,7),
  geo_lng NUMERIC(10,7),
  geo_accuracy_m INT,
  geofence_status TEXT
    CHECK (geofence_status IS NULL OR geofence_status IN ('within','outside','no_data','low_accuracy')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_segments_time_record
  ON time_record_segments (time_record_id, orden) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_segments_project
  ON time_record_segments (project_id) WHERE deleted_at IS NULL AND project_id IS NOT NULL;

ALTER TABLE time_record_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_record_segments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE time_record_segments IS
  'Tramos parciales del parte de horas — cuando el trabajador estuvo en varias obras '
  'el mismo día. Suma de segments == horas del time_record padre (mantenido por trigger). '
  'Si no hay segments, el time_record agregado tiene las horas directamente.';

-- Trigger: recalcular time_records.horas_* desde segments tras INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION recalc_time_record_from_segments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_record_id UUID := COALESCE(NEW.time_record_id, OLD.time_record_id);
  v_total_ord NUMERIC;
  v_total_ext NUMERIC;
  v_total_noc NUMERIC;
  v_count INT;
BEGIN
  IF v_record_id IS NULL THEN RETURN NEW; END IF;

  SELECT
    COALESCE(SUM(horas_ordinarias), 0),
    COALESCE(SUM(horas_extra), 0),
    COALESCE(SUM(horas_nocturnas), 0),
    COUNT(*)
  INTO v_total_ord, v_total_ext, v_total_noc, v_count
  FROM time_record_segments
  WHERE time_record_id = v_record_id AND deleted_at IS NULL;

  -- Solo actualizamos si hay al menos 1 segment (si todos se borran, mantenemos agregado manual)
  IF v_count > 0 THEN
    UPDATE time_records
    SET horas_ordinarias = v_total_ord,
        horas_extra = v_total_ext,
        horas_nocturnas = v_total_noc
    WHERE id = v_record_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_time_record_segments ON time_record_segments;
CREATE TRIGGER trg_recalc_time_record_segments
  AFTER INSERT OR UPDATE OR DELETE ON time_record_segments
  FOR EACH ROW
  EXECUTE FUNCTION recalc_time_record_from_segments();

COMMENT ON FUNCTION recalc_time_record_from_segments IS
  'Mantiene time_records.horas_* sincronizado con la suma de sus segments. '
  'Si no hay segments, no toca (modo simple = horas directas en el parte).';

-- Update RPC compute_project_labor_costs para sumar segments si existen
CREATE OR REPLACE FUNCTION compute_project_labor_costs(
  p_company_id UUID,
  p_anio INT,
  p_mes INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_processed INT := 0;
  v_records JSONB;
  v_total_imputado NUMERIC := 0;
BEGIN
  IF p_anio IS NULL OR p_mes IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id, anio y mes son obligatorios';
  END IF;

  -- Sumar horas: si parte tiene segments, sumar desde ahí; si no, usar agregado del time_record
  WITH employee_hours_segments AS (
    -- Horas por segment (tienen project_id propio)
    SELECT
      tr.employee_id,
      s.project_id,
      SUM(COALESCE(s.horas_ordinarias, 0)) AS h_ord,
      SUM(COALESCE(s.horas_extra, 0)) AS h_ext,
      SUM(COALESCE(s.horas_nocturnas, 0)) AS h_noc
    FROM time_records tr
    JOIN time_record_segments s ON s.time_record_id = tr.id AND s.deleted_at IS NULL
    WHERE tr.deleted_at IS NULL
      AND tr.company_id = p_company_id
      AND s.project_id IS NOT NULL
      AND EXTRACT(YEAR FROM tr.fecha) = p_anio
      AND EXTRACT(MONTH FROM tr.fecha) = p_mes
    GROUP BY tr.employee_id, s.project_id
  ),
  employee_hours_simple AS (
    -- Horas de time_records SIN segments (modo simple)
    SELECT
      tr.employee_id,
      tr.project_id,
      SUM(COALESCE(tr.horas_ordinarias, 0)) AS h_ord,
      SUM(COALESCE(tr.horas_extra, 0)) AS h_ext,
      SUM(COALESCE(tr.horas_nocturnas, 0)) AS h_noc
    FROM time_records tr
    WHERE tr.deleted_at IS NULL
      AND tr.project_id IS NOT NULL
      AND tr.company_id = p_company_id
      AND EXTRACT(YEAR FROM tr.fecha) = p_anio
      AND EXTRACT(MONTH FROM tr.fecha) = p_mes
      AND NOT EXISTS (
        SELECT 1 FROM time_record_segments s
        WHERE s.time_record_id = tr.id AND s.deleted_at IS NULL
      )
    GROUP BY tr.employee_id, tr.project_id
  ),
  employee_hours AS (
    SELECT employee_id, project_id, h_ord, h_ext, h_noc FROM employee_hours_segments
    UNION ALL
    SELECT employee_id, project_id, h_ord, h_ext, h_noc FROM employee_hours_simple
  ),
  employee_hours_consolidated AS (
    SELECT employee_id, project_id,
      SUM(h_ord) AS h_ord, SUM(h_ext) AS h_ext, SUM(h_noc) AS h_noc
    FROM employee_hours
    GROUP BY employee_id, project_id
  ),
  payroll_costs AS (
    SELECT DISTINCT ON (p.employee_id)
      p.employee_id, p.id AS payroll_id,
      CASE WHEN COALESCE(p.periodo_horas, 0) > 0 THEN p.coste_total_empresa / p.periodo_horas ELSE NULL END AS coste_hora
    FROM payrolls p
    WHERE p.deleted_at IS NULL AND p.company_id = p_company_id
      AND p.periodo_anio = p_anio AND p.periodo_mes = p_mes
    ORDER BY p.employee_id, p.created_at DESC
  ),
  computed AS (
    SELECT
      eh.employee_id, eh.project_id,
      eh.h_ord, eh.h_ext, eh.h_noc,
      pc.coste_hora, pc.payroll_id,
      ROUND(((eh.h_ord + eh.h_ext + eh.h_noc) * COALESCE(pc.coste_hora, 0))::numeric, 2) AS imputado
    FROM employee_hours_consolidated eh
    LEFT JOIN payroll_costs pc ON pc.employee_id = eh.employee_id
  )
  INSERT INTO project_labor_costs (
    company_id, project_id, employee_id, anio, mes,
    horas_ordinarias, horas_extra, horas_nocturnas,
    coste_hora_empresa, coste_imputado_total,
    payroll_id, source, calculado_at
  )
  SELECT
    p_company_id, c.project_id, c.employee_id, p_anio, p_mes,
    c.h_ord, c.h_ext, c.h_noc,
    c.coste_hora, c.imputado,
    c.payroll_id, 'time_records', NOW()
  FROM computed c
  ON CONFLICT (company_id, project_id, employee_id, anio, mes)
  DO UPDATE SET
    horas_ordinarias = EXCLUDED.horas_ordinarias,
    horas_extra = EXCLUDED.horas_extra,
    horas_nocturnas = EXCLUDED.horas_nocturnas,
    coste_hora_empresa = EXCLUDED.coste_hora_empresa,
    coste_imputado_total = EXCLUDED.coste_imputado_total,
    payroll_id = EXCLUDED.payroll_id,
    source = 'time_records',
    calculado_at = NOW(),
    updated_at = NOW();

  GET DIAGNOSTICS v_rows_processed = ROW_COUNT;

  SELECT
    jsonb_agg(jsonb_build_object(
      'project_id', plc.project_id,
      'employee_id', plc.employee_id,
      'horas_total', plc.horas_total,
      'coste_hora_empresa', plc.coste_hora_empresa,
      'coste_imputado_total', plc.coste_imputado_total,
      'payroll_id', plc.payroll_id
    )),
    COALESCE(SUM(plc.coste_imputado_total), 0)
  INTO v_records, v_total_imputado
  FROM project_labor_costs plc
  WHERE plc.company_id = p_company_id AND plc.anio = p_anio AND plc.mes = p_mes
    AND plc.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'periodo', jsonb_build_object('anio', p_anio, 'mes', p_mes),
    'rows_processed', v_rows_processed,
    'total_coste_imputado', v_total_imputado,
    'computed_at', NOW(),
    'records', COALESCE(v_records, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION compute_project_labor_costs IS
  'Imputación laboral mes×proyecto×empleado. Suma desde time_record_segments si existen, '
  'sino desde time_records.project_id (modo simple). Idempotente UPSERT.';
