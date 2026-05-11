-- Cancelar ausencias aprobadas (admin + trabajador) — David sesión 11/05/2026
--
-- Flujo de cancelación:
--   1. PENDIENTE: el trabajador puede cancelar la suya libremente (status='pending' → 'cancelled')
--   2. APROBADA: el trabajador solicita cancelación (set cancellation_requested_*)
--      → el admin decide (set cancellation_decision='approved'|'rejected')
--      → si approved: status='cancelled' + restituir banco horas si tipo='banco_horas'
--   3. ADMIN puede cancelar cualquiera con motivo (status='cancelled' directo).
--
-- No tocar el CHECK existente de status — usamos columnas separadas para el
-- "estado intermedio" de petición de cancelación pendiente de aprobar.

ALTER TABLE worker_absences
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_requested_motivo TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_decided_by_email TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_decision TEXT
    CHECK (cancellation_decision IS NULL OR cancellation_decision IN ('approved','rejected')),
  ADD COLUMN IF NOT EXISTS cancellation_admin_motivo TEXT;

COMMENT ON COLUMN worker_absences.cancellation_requested_at IS
  'Cuando el trabajador (desde portal) o el admin solicita cancelar una ausencia '
  'ya aprobada. Si admin aprueba la cancelación, status pasa a cancelled.';
COMMENT ON COLUMN worker_absences.cancellation_decision IS
  'Decisión del admin sobre la solicitud de cancelación. NULL = pendiente, '
  'approved = aceptada (status pasa a cancelled), rejected = rechazada (sigue approved).';
COMMENT ON COLUMN worker_absences.cancellation_admin_motivo IS
  'Motivo opcional cuando el admin cancela directamente una ausencia (sin solicitud previa).';

-- RPC restituir banco horas: cuando se cancela una ausencia tipo banco_horas
-- que ya estaba approved, hay que devolver las horas al saldo del trabajador.
-- El cálculo del banco se hace via get_worker_overtime_balance, que mira:
--   horas_extra acumuladas en time_records - horas en worker_overtime_redemptions.
-- Las ausencias banco_horas se registran al banco vía worker_overtime_redemptions.
-- Al cancelar, soft-deleteamos esa entrada.

CREATE OR REPLACE FUNCTION restitute_banco_horas_on_cancel(
  p_absence_id UUID,
  p_admin_email TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_absence RECORD;
  v_restituted_count INT;
BEGIN
  SELECT id, employee_id, tipo, status, fecha_inicio, fecha_fin, horas_total
  INTO v_absence
  FROM worker_absences
  WHERE id = p_absence_id;

  IF v_absence IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'absence_not_found');
  END IF;

  IF v_absence.tipo <> 'banco_horas' THEN
    -- No es banco_horas, nada que restituir
    RETURN jsonb_build_object('ok', TRUE, 'restituted', 0, 'reason', 'not_banco_horas');
  END IF;

  -- Soft-delete redenciones asociadas a este rango de fechas + employee
  -- (asumiendo que worker_overtime_redemptions tiene employee_id + fecha + motivo)
  UPDATE worker_overtime_redemptions
  SET deleted_at = NOW(),
      motivo = COALESCE(motivo, '') || ' [CANCELADO POR ' || p_admin_email || ' EL ' || NOW()::text || ']'
  WHERE employee_id = v_absence.employee_id
    AND fecha BETWEEN v_absence.fecha_inicio AND v_absence.fecha_fin
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_restituted_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', TRUE, 'restituted', v_restituted_count);
END;
$$;

COMMENT ON FUNCTION restitute_banco_horas_on_cancel IS
  'Cuando se cancela una ausencia tipo banco_horas approved, devuelve las horas '
  'al banco haciendo soft-delete de las entradas en worker_overtime_redemptions '
  'del rango de fechas afectado. Llamado desde el endpoint admin al cancelar.';

GRANT EXECUTE ON FUNCTION restitute_banco_horas_on_cancel(UUID, TEXT) TO service_role;
