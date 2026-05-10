-- Roadmap libro de horas — Fase 1 (core MVP cuadrante + firma + RGPD)
--
-- Añade:
--   1. Tabla worker_assignments: cuadrante semanal admin asigna trabajador→proyecto→día
--   2. time_records.worker_signed_at: timestamp firma digital explícita del trabajador
--   3. worker_portal_access.consent_accepted_at: aceptación cláusula RGPD primer acceso
--   4. RPC get_worker_dashboard_stats: acumulados día/semana/mes para el portal

-- 1. worker_assignments — cuadrante (un trabajador puede tener una asignación principal por día)
CREATE TABLE IF NOT EXISTS worker_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  fecha DATE NOT NULL,
  jornada_esperada_horas NUMERIC(5,2) DEFAULT 8,

  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT worker_assignments_unique_day UNIQUE (employee_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_worker_assignments_employee
  ON worker_assignments (employee_id, fecha DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_worker_assignments_project
  ON worker_assignments (project_id, fecha DESC) WHERE deleted_at IS NULL AND project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_worker_assignments_company_fecha
  ON worker_assignments (company_id, fecha DESC) WHERE deleted_at IS NULL;

ALTER TABLE worker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_assignments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE worker_assignments IS
  'Roadmap libro_horas Fase 1 — cuadrante. Admin asigna trabajador→proyecto por día. '
  'El portal trabajador lee la asignación del día para pre-rellenar el parte. '
  'Multi-empresa con RLS+FORCE patrón F2.';

-- 2. Firma digital explícita del trabajador en partes
ALTER TABLE time_records
  ADD COLUMN IF NOT EXISTS worker_signed_at TIMESTAMPTZ;

COMMENT ON COLUMN time_records.worker_signed_at IS
  'Timestamp en que el trabajador pulsó "Confirmo y envío parte" desde el portal. '
  'Junto con hash_registro SHA-256 forma la firma digital del registro (defensa ITSS).';

-- 3. Aceptación cláusula RGPD informativa al primer acceso
ALTER TABLE worker_portal_access
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_text_version TEXT;

COMMENT ON COLUMN worker_portal_access.consent_accepted_at IS
  'Timestamp en que el trabajador aceptó la cláusula informativa RGPD art. 13. '
  'Si NULL, mostrar modal de aceptación al abrir el portal.';

COMMENT ON COLUMN worker_portal_access.consent_text_version IS
  'Versión del texto informativo aceptado (ej. "v1-2026-05"). Permite re-pedir aceptación si cambia.';

-- 4. RPC get_worker_dashboard_stats: acumulados horas para el portal
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
  v_dias_apuntados_mes INT := 0;
  v_dias_pendientes_mes INT := 0;
BEGIN
  -- Horas hoy
  SELECT COALESCE(SUM(
    COALESCE(horas_ordinarias,0) + COALESCE(horas_extra,0) + COALESCE(horas_nocturnas,0)
  ), 0)
  INTO v_horas_hoy
  FROM time_records
  WHERE employee_id = p_employee_id AND fecha = v_today AND deleted_at IS NULL;

  -- Horas semana (lunes a domingo)
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

  -- Días laborables del mes hasta hoy sin parte (días pendientes)
  -- Suma laborables (lunes-viernes) entre v_month_start y v_today menos los apuntados
  WITH dias_laborables AS (
    SELECT generate_series(v_month_start, v_today, INTERVAL '1 day')::date AS d
  )
  SELECT COUNT(*) - v_dias_apuntados_mes
  INTO v_dias_pendientes_mes
  FROM dias_laborables
  WHERE EXTRACT(DOW FROM d) NOT IN (0, 6);  -- lun-vie

  IF v_dias_pendientes_mes < 0 THEN v_dias_pendientes_mes := 0; END IF;

  RETURN jsonb_build_object(
    'today', v_today,
    'week_start', v_week_start,
    'month_start', v_month_start,
    'month_end', v_month_end,
    'horas_hoy', v_horas_hoy,
    'horas_semana', v_horas_semana,
    'horas_mes', v_horas_mes,
    'dias_apuntados_mes', v_dias_apuntados_mes,
    'dias_pendientes_mes', v_dias_pendientes_mes
  );
END;
$$;

COMMENT ON FUNCTION get_worker_dashboard_stats IS
  'Roadmap libro_horas Fase 1 — devuelve acumulados día/semana/mes para el portal trabajador.';

-- 5. Trigger SHA-256 hash_registro en time_records (inalterabilidad ITSS)
-- GAP detectado en Fase 1: el campo hash_registro existía desde 2026-04-26 pero NO había
-- trigger que lo rellenase. Ahora se calcula automáticamente en INSERT/UPDATE.
CREATE OR REPLACE FUNCTION compute_time_record_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.hash_registro := encode(
    digest(
      COALESCE(NEW.employee_id::text, '') || '|' ||
      COALESCE(NEW.fecha::text, '') || '|' ||
      COALESCE(NEW.horas_ordinarias::text, '0') || '|' ||
      COALESCE(NEW.horas_extra::text, '0') || '|' ||
      COALESCE(NEW.horas_nocturnas::text, '0') || '|' ||
      COALESCE(NEW.project_id::text, '') || '|' ||
      COALESCE(NEW.observaciones, '') || '|' ||
      COALESCE(NEW.fuente, '') || '|' ||
      COALESCE(NEW.registrado_por, '') || '|' ||
      COALESCE(NEW.worker_signed_at::text, '') || '|' ||
      COALESCE(NEW.modificado_at::text, '') || '|' ||
      COALESCE(NEW.modificado_por, '') || '|' ||
      COALESCE(NEW.modificado_motivo, '') || '|' ||
      COALESCE(NEW.created_at::text, '')
    , 'sha256'),
    'hex'
  );
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trigger_compute_time_record_hash ON time_records;
CREATE TRIGGER trigger_compute_time_record_hash
  BEFORE INSERT OR UPDATE ON time_records
  FOR EACH ROW
  EXECUTE FUNCTION compute_time_record_hash();

COMMENT ON FUNCTION compute_time_record_hash IS
  'Calcula SHA-256 sobre el contenido del parte para garantizar inalterabilidad ITSS. '
  'Trigger BEFORE INSERT/UPDATE. Junto con worker_signed_at forma la firma digital del registro.';
