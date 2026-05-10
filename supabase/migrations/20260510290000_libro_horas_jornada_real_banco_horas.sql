-- Roadmap libro de horas — jornada real Cathedral + festivos Madrid + banco horas extras
--
-- David explica horario Cathedral (10/05/2026 noche):
-- - L-J 8-18 con 1h comer = 9h efectivas
-- - V 8-12 = 4h efectivas
-- - Total 40h/semana
-- - Horas extra: trabajador elige compensar (descansar otro día) o pagar como extra

-- 1. Tabla holidays — festivos genérica multi-año, multi-ámbito
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id), -- NULL = aplica a todas las empresas
  fecha DATE NOT NULL,
  nombre TEXT NOT NULL,
  ambito TEXT NOT NULL DEFAULT 'autonomico'
    CHECK (ambito IN ('nacional', 'autonomico', 'local', 'empresa')),
  comunidad_autonoma TEXT, -- 'MADRID', 'CATALUÑA', etc.
  municipio TEXT,          -- 'Madrid', 'Alcalá de Henares', etc.
  fuente TEXT,             -- ej: 'BOE 2025-XYZ' o 'BOCM 2025-XYZ'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_fecha ON holidays (fecha);
CREATE INDEX IF NOT EXISTS idx_holidays_company ON holidays (company_id, fecha) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique
  ON holidays (fecha, COALESCE(comunidad_autonoma,''), COALESCE(municipio,''), COALESCE(company_id::text,''));

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE holidays IS
  'Calendario festivos. ambito=nacional aplica a toda España; autonomico requiere CCAA; '
  'local requiere municipio; empresa requiere company_id. Para Madrid centro, se incluyen '
  'festivos nacional + Comunidad Madrid + Madrid capital (Almudena, San Isidro).';

-- 2. Festivos 2026 nacional + Madrid (BOE + BOCM 31/12/2025)
INSERT INTO holidays (fecha, nombre, ambito, comunidad_autonoma, municipio, fuente)
VALUES
  ('2026-01-01', 'Año Nuevo', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-01-06', 'Reyes', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-04-02', 'Jueves Santo', 'autonomico', 'MADRID', NULL, 'BOCM 2025'),
  ('2026-04-03', 'Viernes Santo', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-05-01', 'Día del Trabajador', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-05-02', 'Día de la Comunidad de Madrid', 'autonomico', 'MADRID', NULL, 'BOCM 2025'),
  ('2026-05-15', 'San Isidro', 'local', 'MADRID', 'Madrid', 'BOCM 2025'),
  ('2026-08-15', 'Asunción de la Virgen', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-10-12', 'Día de la Hispanidad', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-11-02', 'Todos los Santos (trasladado)', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-11-09', 'Almudena', 'local', 'MADRID', 'Madrid', 'BOCM 2025'),
  ('2026-12-07', 'Constitución (trasladado)', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-12-08', 'Inmaculada Concepción', 'nacional', NULL, NULL, 'BOE 2025'),
  ('2026-12-25', 'Navidad', 'nacional', NULL, NULL, 'BOE 2025')
ON CONFLICT DO NOTHING;

-- 3. Función jornada esperada por día (Cathedral schedule)
-- L-J 9h | V 4h | finde 0 | festivo 0
CREATE OR REPLACE FUNCTION get_jornada_esperada_horas(
  p_fecha DATE,
  p_company_id UUID DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow INT := EXTRACT(DOW FROM p_fecha)::int; -- 0=dom, 1=lun, ..., 6=sab
  v_es_festivo BOOLEAN;
BEGIN
  -- Sábado y domingo: 0
  IF v_dow IN (0, 6) THEN RETURN 0; END IF;

  -- Festivo Madrid o nacional
  SELECT EXISTS(
    SELECT 1 FROM holidays h
    WHERE h.fecha = p_fecha
      AND (
        h.ambito = 'nacional'
        OR (h.ambito = 'autonomico' AND h.comunidad_autonoma = 'MADRID')
        OR (h.ambito = 'local' AND h.municipio = 'Madrid')
        OR (h.ambito = 'empresa' AND h.company_id = p_company_id)
      )
  ) INTO v_es_festivo;

  IF v_es_festivo THEN RETURN 0; END IF;

  -- Viernes: 4h
  IF v_dow = 5 THEN RETURN 4; END IF;

  -- Lunes a jueves: 9h efectivas (8-18 con 1h comer)
  RETURN 9;
END;
$$;

COMMENT ON FUNCTION get_jornada_esperada_horas IS
  'Cathedral schedule: L-J 9h, V 4h, finde 0, festivo Madrid/nacional 0. '
  'Trabajador apunta horas EFECTIVAS (descontado descanso comer L-J).';

-- 4. Update RPC dashboard stats: usar jornada esperada real
CREATE OR REPLACE FUNCTION get_worker_dashboard_stats(
  p_employee_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_week_start DATE := date_trunc('week', CURRENT_DATE)::date;
  v_month_start DATE := date_trunc('month', CURRENT_DATE)::date;
  v_month_end DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date;

  v_horas_hoy NUMERIC := 0;
  v_horas_semana NUMERIC := 0;
  v_horas_mes NUMERIC := 0;
  v_horas_esperadas_mes NUMERIC := 0;
  v_horas_esperadas_semana NUMERIC := 0;
  v_dias_apuntados_mes INT := 0;
  v_dias_pendientes_mes INT := 0;
  v_company_id UUID;
BEGIN
  -- Localizar company del empleado
  SELECT e.company_id INTO v_company_id FROM employees e WHERE e.id = p_employee_id;

  -- Horas hoy
  SELECT COALESCE(SUM(
    COALESCE(horas_ordinarias,0) + COALESCE(horas_extra,0) + COALESCE(horas_nocturnas,0)
  ), 0)
  INTO v_horas_hoy
  FROM time_records
  WHERE employee_id = p_employee_id AND fecha = v_today AND deleted_at IS NULL;

  -- Horas semana
  SELECT COALESCE(SUM(
    COALESCE(horas_ordinarias,0) + COALESCE(horas_extra,0) + COALESCE(horas_nocturnas,0)
  ), 0)
  INTO v_horas_semana
  FROM time_records
  WHERE employee_id = p_employee_id
    AND fecha >= v_week_start AND fecha <= v_today
    AND deleted_at IS NULL;

  -- Horas mes
  SELECT
    COALESCE(SUM(
      COALESCE(horas_ordinarias,0) + COALESCE(horas_extra,0) + COALESCE(horas_nocturnas,0)
    ), 0),
    COUNT(DISTINCT fecha)
  INTO v_horas_mes, v_dias_apuntados_mes
  FROM time_records
  WHERE employee_id = p_employee_id
    AND fecha >= v_month_start AND fecha <= v_today
    AND deleted_at IS NULL;

  -- Horas esperadas mes (suma jornadas L-J y V hasta hoy, descontando festivos)
  WITH dias AS (
    SELECT generate_series(v_month_start, v_today, INTERVAL '1 day')::date AS d
  )
  SELECT COALESCE(SUM(get_jornada_esperada_horas(d, v_company_id)), 0)
  INTO v_horas_esperadas_mes
  FROM dias;

  -- Horas esperadas semana (lunes a hoy)
  WITH dias AS (
    SELECT generate_series(v_week_start, v_today, INTERVAL '1 day')::date AS d
  )
  SELECT COALESCE(SUM(get_jornada_esperada_horas(d, v_company_id)), 0)
  INTO v_horas_esperadas_semana
  FROM dias;

  -- Días pendientes: días laborables del mes hasta hoy SIN parte
  -- (laborable = jornada esperada > 0)
  WITH dias_laborables AS (
    SELECT generate_series(v_month_start, v_today, INTERVAL '1 day')::date AS d
  ),
  laborables_filtrados AS (
    SELECT d FROM dias_laborables
    WHERE get_jornada_esperada_horas(d, v_company_id) > 0
  ),
  apuntados AS (
    SELECT DISTINCT fecha::date AS d FROM time_records
    WHERE employee_id = p_employee_id AND deleted_at IS NULL
      AND fecha >= v_month_start AND fecha <= v_today
  )
  SELECT COUNT(*)
  INTO v_dias_pendientes_mes
  FROM laborables_filtrados l
  WHERE NOT EXISTS (SELECT 1 FROM apuntados a WHERE a.d = l.d);

  RETURN jsonb_build_object(
    'today', v_today,
    'week_start', v_week_start,
    'month_start', v_month_start,
    'month_end', v_month_end,
    'horas_hoy', v_horas_hoy,
    'horas_semana', v_horas_semana,
    'horas_mes', v_horas_mes,
    'horas_esperadas_semana', v_horas_esperadas_semana,
    'horas_esperadas_mes', v_horas_esperadas_mes,
    'jornada_esperada_hoy', get_jornada_esperada_horas(v_today, v_company_id),
    'dias_apuntados_mes', v_dias_apuntados_mes,
    'dias_pendientes_mes', v_dias_pendientes_mes
  );
END;
$$;

-- 5. Banco de horas extras: modo + tabla canjes
ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS horas_extra_modo TEXT
    CHECK (horas_extra_modo IS NULL OR horas_extra_modo IN ('compensar', 'pagar'));

COMMENT ON COLUMN time_records.horas_extra_modo IS
  'Cómo se gestionan las horas extra de este parte. compensar=van al banco horas (descansará otro día); '
  'pagar=se incluyen en nómina como extras retribuidas. NULL si no hay extras o legacy.';

CREATE TABLE IF NOT EXISTS worker_overtime_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  horas_descontadas NUMERIC(5,2) NOT NULL CHECK (horas_descontadas > 0),
  motivo TEXT,
  time_record_id UUID REFERENCES time_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_overtime_redemp_employee
  ON worker_overtime_redemptions (employee_id, fecha DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_overtime_redemp_company
  ON worker_overtime_redemptions (company_id, fecha DESC) WHERE deleted_at IS NULL;

ALTER TABLE worker_overtime_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_overtime_redemptions FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE worker_overtime_redemptions IS
  'Canjes del banco de horas: cuando el trabajador descansa una jornada parcial (o entera) usando '
  'el saldo acumulado de horas extra "compensar". Saldo = SUM(extras_compensar) - SUM(redemptions).';

-- 6. RPC saldo del banco de horas extras
CREATE OR REPLACE FUNCTION get_worker_overtime_balance(
  p_employee_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extras_acumuladas NUMERIC := 0;
  v_descontadas NUMERIC := 0;
  v_saldo NUMERIC;
BEGIN
  -- Suma horas extra modo 'compensar' apuntadas en time_records
  SELECT COALESCE(SUM(horas_extra), 0)
  INTO v_extras_acumuladas
  FROM time_records
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL
    AND horas_extra > 0
    AND horas_extra_modo = 'compensar';

  -- Suma canjes (días libres descontados del banco)
  SELECT COALESCE(SUM(horas_descontadas), 0)
  INTO v_descontadas
  FROM worker_overtime_redemptions
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL;

  v_saldo := v_extras_acumuladas - v_descontadas;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'extras_acumuladas', v_extras_acumuladas,
    'descontadas', v_descontadas,
    'saldo_horas', v_saldo
  );
END;
$$;

COMMENT ON FUNCTION get_worker_overtime_balance IS
  'Saldo del banco de horas extras del trabajador. saldo = extras_acumuladas (compensar) - descontadas.';
