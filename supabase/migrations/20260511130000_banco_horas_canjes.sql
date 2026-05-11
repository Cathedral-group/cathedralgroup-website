-- Banco horas con canjes (refactor) — David sesión 11/05/2026
--
-- Modelo:
--   Antes: el trabajador en el parte elegía 'horas_extra_modo' (compensar/pagar)
--          + admin las metía en worker_overtime_redemptions sin flujo de aprobación.
--   Ahora: las horas extras van SIEMPRE al banco automáticamente. El trabajador
--          luego solicita canjes (descansar día/medio o pagar en nómina) desde
--          el portal. El admin aprueba o rechaza desde el panel.
--
-- Cambios:
--   1. worker_overtime_redemptions añade columnas status/modo/fechas de decisión
--   2. RPC get_worker_overtime_balance solo cuenta canjes 'approved' como descontados
--   3. Los canjes 'pending' aparecen como "pendientes de aprobar" en el balance

ALTER TABLE worker_overtime_redemptions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  ADD COLUMN IF NOT EXISTS modo_canje TEXT
    CHECK (modo_canje IS NULL OR modo_canje IN ('descanso_dia', 'descanso_medio_dia', 'descanso_horas', 'pago_nomina')),
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_by TEXT,  -- 'portal:nombre' o 'admin:email'
  ADD COLUMN IF NOT EXISTS requested_motivo TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_by_email TEXT,
  ADD COLUMN IF NOT EXISTS decision_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill: los canjes pre-existentes los marcamos como ya aprobados (es lo que eran)
UPDATE worker_overtime_redemptions
SET status = 'approved',
    decided_at = COALESCE(decided_at, created_at),
    decided_by_email = COALESCE(decided_by_email, created_by_email)
WHERE status IS NULL OR (status = 'approved' AND decided_at IS NULL);

COMMENT ON COLUMN worker_overtime_redemptions.status IS
  'pending: trabajador lo solicitó, falta aprobación admin. '
  'approved: aprobado, las horas se descuentan del banco. '
  'rejected: admin lo rechazó, las horas vuelven al banco (no estaban descontadas). '
  'cancelled: trabajador o admin lo canceló antes de decidir.';

COMMENT ON COLUMN worker_overtime_redemptions.modo_canje IS
  'descanso_dia: 1 día completo (típicamente 8h). descanso_medio_dia: medio día (4h). '
  'descanso_horas: horas sueltas con horas_descontadas exacto. '
  'pago_nomina: se cobra en nómina del mes (no es descanso).';

-- Update RPC get_worker_overtime_balance: solo descontar las 'approved'
CREATE OR REPLACE FUNCTION get_worker_overtime_balance(
  p_employee_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horas_acumuladas NUMERIC := 0;
  v_horas_canjeadas NUMERIC := 0;
  v_horas_pendientes NUMERIC := 0;
BEGIN
  -- Horas extra acumuladas: SOLO partes con modo='compensar' o sin modo (default banco)
  -- Si en el futuro queremos contar todas las extras al banco, quitar el filtro.
  SELECT COALESCE(SUM(horas_extra), 0) INTO v_horas_acumuladas
  FROM time_records
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL
    AND horas_extra > 0
    AND (horas_extra_modo IS NULL OR horas_extra_modo = 'compensar');

  -- Canjes aprobados (descansos disfrutados o pagos hechos)
  SELECT COALESCE(SUM(horas_descontadas), 0) INTO v_horas_canjeadas
  FROM worker_overtime_redemptions
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL
    AND status = 'approved';

  -- Canjes pendientes de aprobar (reservados, pero no descontados aún)
  SELECT COALESCE(SUM(horas_descontadas), 0) INTO v_horas_pendientes
  FROM worker_overtime_redemptions
  WHERE employee_id = p_employee_id
    AND deleted_at IS NULL
    AND status = 'pending';

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'horas_acumuladas', v_horas_acumuladas,
    'horas_canjeadas', v_horas_canjeadas,
    'horas_pendientes_canje', v_horas_pendientes,
    'horas_disponibles', v_horas_acumuladas - v_horas_canjeadas - v_horas_pendientes,
    'computed_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION get_worker_overtime_balance IS
  'Balance banco horas extras del trabajador. '
  'horas_disponibles = acumuladas (de partes compensar) - canjeadas (approved) - pendientes (en cola).';

CREATE INDEX IF NOT EXISTS idx_redemptions_status
  ON worker_overtime_redemptions (employee_id, status, fecha DESC)
  WHERE deleted_at IS NULL;
