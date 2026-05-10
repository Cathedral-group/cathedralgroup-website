-- Roadmap libro de horas — Fase 6 (ausencias: vacaciones, bajas, permisos)
--
-- El trabajador solicita ausencias desde el portal. Admin aprueba/rechaza.
-- Cuando se aprueba, los días bloquean el cuadrante (no se puede asignar proyecto).
--
-- Tipos de ausencia (Estatuto Trabajadores + Convenio Construcción Madrid):
--   - vacaciones: 22 días/año (176h)
--   - baja_medica: incapacidad temporal (con foto justificante)
--   - permiso_retribuido: matrimonio/mudanza/fallecimiento familiar/etc.
--   - asuntos_propios: días personales sin justificación
--   - ausencia_no_justificada: cuando admin la marca tras detectar día sin parte sin solicitud
--   - banco_horas: media jornada o día tomado a cuenta del banco horas extras

CREATE TABLE IF NOT EXISTS worker_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'vacaciones',
    'baja_medica',
    'permiso_retribuido',
    'asuntos_propios',
    'ausencia_no_justificada',
    'banco_horas'
  )),
  motivo_detalle TEXT, -- ej: 'matrimonio', 'fallecimiento familiar 2º grado', etc.

  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_total INT GENERATED ALWAYS AS (fecha_fin - fecha_inicio + 1) STORED,
  horas_total NUMERIC(7,2), -- para banco_horas o fracciones de día

  -- Solicitud
  solicitado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solicitado_por TEXT, -- 'portal:NOMBRE' o 'admin:email'
  solicitud_fuente TEXT NOT NULL DEFAULT 'admin'
    CHECK (solicitud_fuente IN ('portal', 'admin')),

  -- Justificante (para bajas médicas)
  justificante_attachment_id UUID REFERENCES worker_attachments(id) ON DELETE SET NULL,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_at TIMESTAMPTZ,
  decided_by_email TEXT,
  decision_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT fechas_ok CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_worker_absences_employee
  ON worker_absences (employee_id, fecha_inicio DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_worker_absences_company_status
  ON worker_absences (company_id, status, fecha_inicio DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_worker_absences_range
  ON worker_absences (employee_id, fecha_inicio, fecha_fin) WHERE deleted_at IS NULL AND status = 'approved';

ALTER TABLE worker_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_absences FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE worker_absences IS
  'Roadmap libro_horas Fase 6 — solicitudes de ausencia (vacaciones/baja/permiso). '
  'Si status=approved, los días bloquean el cuadrante. Convenio Construcción Madrid: '
  '22 días vacaciones (176h)/año, permisos retribuidos según ET art. 37.';

-- RPC: comprobar si una fecha tiene ausencia aprobada
CREATE OR REPLACE FUNCTION has_approved_absence(
  p_employee_id UUID,
  p_fecha DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_absence RECORD;
BEGIN
  SELECT id, tipo, motivo_detalle, fecha_inicio, fecha_fin, horas_total
  INTO v_absence
  FROM worker_absences
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL
    AND status = 'approved'
    AND p_fecha BETWEEN fecha_inicio AND fecha_fin
  LIMIT 1;

  IF v_absence IS NULL THEN
    RETURN jsonb_build_object('has_absence', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'has_absence', TRUE,
    'absence_id', v_absence.id,
    'tipo', v_absence.tipo,
    'motivo_detalle', v_absence.motivo_detalle,
    'fecha_inicio', v_absence.fecha_inicio,
    'fecha_fin', v_absence.fecha_fin,
    'horas_total', v_absence.horas_total
  );
END;
$$;

COMMENT ON FUNCTION has_approved_absence IS
  'Devuelve si un trabajador tiene una ausencia aprobada que cubra esa fecha. '
  'Usado por el cuadrante para bloquear celdas con vacaciones/baja.';

-- RPC: vacaciones disfrutadas en un año por trabajador (para control 22 días/año)
CREATE OR REPLACE FUNCTION get_vacation_summary(
  p_employee_id UUID,
  p_anio INT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dias_disfrutados INT := 0;
  v_dias_planificados INT := 0;
BEGIN
  -- Vacaciones aprobadas del año (suma días dentro del rango)
  SELECT
    COALESCE(SUM(CASE
      WHEN fecha_fin <= CURRENT_DATE THEN dias_total
      ELSE GREATEST(0, CURRENT_DATE - fecha_inicio + 1)
    END), 0),
    COALESCE(SUM(dias_total), 0)
  INTO v_dias_disfrutados, v_dias_planificados
  FROM worker_absences
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL
    AND status = 'approved'
    AND tipo = 'vacaciones'
    AND EXTRACT(YEAR FROM fecha_inicio) = p_anio;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'anio', p_anio,
    'dias_anuales', 22,  -- Convenio construcción Madrid
    'dias_disfrutados', v_dias_disfrutados,
    'dias_planificados', v_dias_planificados,
    'dias_disponibles', 22 - v_dias_planificados
  );
END;
$$;

COMMENT ON FUNCTION get_vacation_summary IS
  'Convenio Construcción Madrid: 22 días vacaciones/año (176h). Devuelve disfrutados, '
  'planificados (futuras aprobadas) y disponibles.';
