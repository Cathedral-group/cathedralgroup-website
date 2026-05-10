-- Sprint 10/05 — Snooze notificaciones (esconder temporalmente sin descartar).
-- Útil cuando una alerta es conocida pero no urgente: se silencia X horas y vuelve a aparecer.

ALTER TABLE public.system_notifications
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_by text;

-- Reemplazar índice activas para incluir el filtro snoozed
DROP INDEX IF EXISTS idx_system_notifications_active;

CREATE INDEX IF NOT EXISTS idx_system_notifications_active
  ON public.system_notifications (severity, created_at DESC)
  WHERE dismissed_at IS NULL
    AND (snoozed_until IS NULL OR snoozed_until < NOW());

COMMENT ON COLUMN public.system_notifications.snoozed_until IS
  'Si está set y > NOW() → la notification se oculta del banner. Cuando NOW() la supere, vuelve a aparecer.';

-- RPC snooze
CREATE OR REPLACE FUNCTION public.snooze_system_notification(
  p_notification_id uuid,
  p_hours int,
  p_admin_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_hours < 1 OR p_hours > 720 THEN
    RAISE EXCEPTION 'p_hours fuera de rango (1..720)';
  END IF;
  UPDATE system_notifications
  SET snoozed_until = NOW() + (p_hours || ' hours')::interval,
      snoozed_by = p_admin_email
  WHERE id = p_notification_id
    AND dismissed_at IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snooze_system_notification(uuid, int, text) TO service_role;
