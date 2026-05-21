-- ============================================================================
-- Cathedral Group — Auto-dismiss notificaciones obsoletas (22/05/2026)
--
-- Feedback David: "no quiero tener mil notificaciones que no son reales".
-- Las alertas reales se re-disparan solas (disco cada 15min, backup/health
-- cada 6h, con dedup_key), así que limpiar las viejas por edad es seguro: si
-- la condición persiste, vuelve a llegar una notificación fresca.
--
-- Reglas por gravedad:
--   info     → 3 días
--   warning  → 10 días
--   critical → 21 días (margen amplio; se re-dispara si sigue mal)
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_dismiss_stale_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.system_notifications
  SET dismissed_at = now(), dismissed_by = 'auto:stale'
  WHERE dismissed_at IS NULL
    AND (
      (severity = 'info'     AND created_at < now() - interval '3 days')  OR
      (severity = 'warning'  AND created_at < now() - interval '10 days') OR
      (severity = 'critical' AND created_at < now() - interval '21 days')
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_dismiss_stale_notifications() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_dismiss_stale_notifications() TO service_role;

COMMENT ON FUNCTION public.auto_dismiss_stale_notifications IS
  'Marca dismissed_at en notificaciones viejas por gravedad (info 3d / warning 10d / critical 21d). Las reales se re-disparan con dedup_key. Cron diario 03:25 UTC. Sesión 22/05.';

-- Cron diario 03:25 UTC (re-ejecutar mismo jobname = UPSERT, no duplica)
SELECT cron.schedule(
  'notifications-auto-dismiss',
  '25 3 * * *',
  $cron$SELECT public.auto_dismiss_stale_notifications();$cron$
);

COMMIT;
