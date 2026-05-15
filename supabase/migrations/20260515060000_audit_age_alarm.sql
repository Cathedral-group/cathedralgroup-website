-- Alarma age oldest pending email_audit_attempts (15/05/2026)
-- SLO canónico Outbox pattern: alarma si edad pending más antiguo > 24h.
-- Inserta/actualiza row en system_notifications, leído por banner admin.

CREATE OR REPLACE FUNCTION public.email_audit_alarm_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_oldest TIMESTAMPTZ;
  v_age_hours NUMERIC;
  v_count INT;
  v_threshold_hours INT := 24;
BEGIN
  SELECT MIN(received_at), COUNT(*)
    INTO v_oldest, v_count
    FROM public.email_audit_attempts
    WHERE status='pending' AND received_at IS NOT NULL;

  IF v_oldest IS NULL THEN
    UPDATE public.system_notifications
      SET dismissed_at = NOW(), dismissed_by = 'auto:age_resolved'
      WHERE source='email_audit_age' AND dedup_key='oldest_pending' AND dismissed_at IS NULL;
    RETURN;
  END IF;

  v_age_hours := EXTRACT(EPOCH FROM (NOW() - v_oldest)) / 3600;

  IF v_age_hours > v_threshold_hours THEN
    INSERT INTO public.system_notifications (severity, source, dedup_key, title, message, metadata)
    VALUES (
      CASE WHEN v_age_hours > 72 THEN 'critical' ELSE 'warning' END,
      'email_audit_age',
      'oldest_pending',
      format('%s emails sin procesar (más antiguo: %s h)', v_count, round(v_age_hours,1)),
      'Backlog email_audit_attempts. Revisa /admin/revision o ejecuta el cron auditor manualmente.',
      jsonb_build_object('age_hours', round(v_age_hours,1), 'pending_count', v_count, 'oldest_received_at', v_oldest)
    )
    ON CONFLICT (source, dedup_key) WHERE dismissed_at IS NULL AND dedup_key IS NOT NULL
    DO UPDATE SET
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      metadata = EXCLUDED.metadata,
      created_at = NOW();
  ELSE
    UPDATE public.system_notifications
      SET dismissed_at = NOW(), dismissed_by = 'auto:age_resolved'
      WHERE source='email_audit_age' AND dedup_key='oldest_pending' AND dismissed_at IS NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.email_audit_alarm_check() IS
  'SLO canónico Outbox: alarma si edad pending más antiguo > 24h. Llamado cada 15min pg_cron.';

DO $cron_block$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-audit-age-alarm') THEN
    PERFORM cron.unschedule('email-audit-age-alarm');
  END IF;
  PERFORM cron.schedule(
    'email-audit-age-alarm',
    '*/15 * * * *',
    $cmd$ SELECT public.email_audit_alarm_check(); $cmd$
  );
END $cron_block$;
