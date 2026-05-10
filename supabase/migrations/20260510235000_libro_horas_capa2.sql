-- Roadmap libro de horas trabajadores — Capa 2 (imputación laboral)
--
-- Añade time_records.project_id (NULL = horas no imputables a proyecto)
-- Crea project_labor_costs: agregado mensual computado desde time_records + payrolls
-- RPC compute_project_labor_costs idempotente (UPSERT)
-- Patrón multi-empresa: company_id NOT NULL, RLS+FORCE sin policy (service_role only)
--
-- Capa 1 (portal trabajador) se hará en sesión dedicada — esta capa funciona con
-- partes de horas introducidos por el admin desde /admin/personal/dietario.

-- 1. ALTER time_records: añadir project_id
ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_records_project
  ON time_records (project_id, fecha DESC)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

COMMENT ON COLUMN time_records.project_id IS
  'Proyecto al que se imputan estas horas. NULL = horas generales no imputables. '
  'Roadmap libro_horas Capa 1 — el trabajador apunta proyecto desde portal móvil.';

-- 2. project_labor_costs: agregado mensual (resultado del cálculo)
CREATE TABLE IF NOT EXISTS project_labor_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  anio INT NOT NULL CHECK (anio BETWEEN 2020 AND 2100),
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),

  horas_ordinarias NUMERIC(8,2) DEFAULT 0,
  horas_extra NUMERIC(8,2) DEFAULT 0,
  horas_nocturnas NUMERIC(8,2) DEFAULT 0,
  horas_total NUMERIC(8,2) GENERATED ALWAYS AS (
    COALESCE(horas_ordinarias, 0) + COALESCE(horas_extra, 0) + COALESCE(horas_nocturnas, 0)
  ) STORED,

  coste_hora_empresa NUMERIC(10,4),
  coste_imputado_total NUMERIC(15,2),

  source TEXT NOT NULL DEFAULT 'time_records'
    CHECK (source IN ('time_records', 'manual', 'ajuste')),
  payroll_id UUID REFERENCES payrolls(id),

  calculado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT plc_unique UNIQUE (company_id, project_id, employee_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_plc_project
  ON project_labor_costs (project_id, anio DESC, mes DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plc_employee
  ON project_labor_costs (employee_id, anio DESC, mes DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plc_company
  ON project_labor_costs (company_id, anio DESC, mes DESC) WHERE deleted_at IS NULL;

ALTER TABLE project_labor_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_labor_costs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE project_labor_costs IS
  'Roadmap libro_horas Capa 2 — agregado mensual horas × proyecto × empleado con coste '
  'imputado calculado desde payrolls.coste_total_empresa / periodo_horas. UPSERT vía '
  'compute_project_labor_costs(). Multi-empresa con RLS+FORCE.';

-- 3. RPC compute_project_labor_costs (idempotente UPSERT)
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
  -- Validación
  IF p_anio IS NULL OR p_mes IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id, anio y mes son obligatorios';
  END IF;

  -- UPSERT desde time_records JOIN payrolls (DISTINCT ON para nómina más reciente del mes)
  WITH employee_hours AS (
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
    GROUP BY tr.employee_id, tr.project_id
  ),
  payroll_costs AS (
    SELECT DISTINCT ON (p.employee_id)
      p.employee_id,
      p.id AS payroll_id,
      CASE
        WHEN COALESCE(p.periodo_horas, 0) > 0
          THEN p.coste_total_empresa / p.periodo_horas
        ELSE NULL
      END AS coste_hora
    FROM payrolls p
    WHERE p.deleted_at IS NULL
      AND p.company_id = p_company_id
      AND p.periodo_anio = p_anio
      AND p.periodo_mes = p_mes
    ORDER BY p.employee_id, p.created_at DESC
  ),
  computed AS (
    SELECT
      eh.employee_id,
      eh.project_id,
      eh.h_ord,
      eh.h_ext,
      eh.h_noc,
      pc.coste_hora,
      pc.payroll_id,
      ROUND(((eh.h_ord + eh.h_ext + eh.h_noc) * COALESCE(pc.coste_hora, 0))::numeric, 2) AS imputado
    FROM employee_hours eh
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

  -- Resumen del periodo computado
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
  WHERE plc.company_id = p_company_id
    AND plc.anio = p_anio AND plc.mes = p_mes
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
  'Roadmap libro_horas Capa 2 — recalcula imputación laboral mes×proyecto×empleado '
  'desde time_records + payrolls.coste_total_empresa/periodo_horas. Idempotente '
  '(UPSERT). Llamar tras cierre de mes nominal o cuando se modifiquen partes de horas.';

-- 4. Vista resumen por proyecto (helper UI)
CREATE OR REPLACE VIEW vw_project_labor_summary AS
SELECT
  plc.company_id,
  plc.project_id,
  p.code AS project_code,
  plc.anio,
  plc.mes,
  COUNT(DISTINCT plc.employee_id) AS empleados_count,
  SUM(plc.horas_total) AS horas_total,
  SUM(plc.coste_imputado_total) AS coste_total_mes
FROM project_labor_costs plc
JOIN projects p ON p.id = plc.project_id
WHERE plc.deleted_at IS NULL
GROUP BY plc.company_id, plc.project_id, p.code, plc.anio, plc.mes;

COMMENT ON VIEW vw_project_labor_summary IS
  'Roadmap libro_horas Capa 2 — agregado por proyecto×mes para drill-down rápido en UI.';
