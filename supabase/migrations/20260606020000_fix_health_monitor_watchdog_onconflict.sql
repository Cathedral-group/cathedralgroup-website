-- Fix: health_monitor_watchdog_check() fallaba en CADA ejecucion (pg_cron jobid 8, cada 30 min)
-- con: "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Causa raiz: la funcion ejecutaba `ON CONFLICT (source, dedup_key) DO NOTHING` (sin WHERE),
-- pero los unicos indices UNIQUE sobre (source, dedup_key) son PARCIALES (llevan WHERE).
-- Postgres no puede inferir un indice unico parcial como arbiter sin un index_predicate que
-- implique el predicado del indice.
--   https://www.postgresql.org/docs/15/sql-insert.html  (conflict_target / index_predicate)
--   https://www.postgresql.org/docs/15/indexes-partial.html  (regla de implicacion)
--
-- Fix: anadir el predicado `WHERE dismissed_at IS NULL AND dedup_key IS NOT NULL`, que coincide
-- con el indice TRAZADO `idx_system_notifications_dedup` (creado en 20260510010000) y replica el
-- patron del unico otro escritor que ya funciona, email_audit_alarm_check (20260515060000).
-- Validado contra los indices live (insert x2 en transaccion + ROLLBACK: dedup OK, sin error).
--
-- Drift detectado (NO resuelto aqui, queda anotado): esta funcion y el indice redundante
-- `idx_system_notifications_source_dedup` (WHERE dedup_key IS NOT NULL) existian en produccion
-- pero NO en las migraciones del repo (creados a mano fuera de control de versiones). Esta
-- migracion recupera la funcion al repo. Se anade ademas `SET search_path = ''` (recomendacion
-- de seguridad de Supabase para funciones SECURITY DEFINER; todas las referencias ya van
-- cualificadas con el esquema `public.`, por lo que el cambio es funcionalmente inocuo).

CREATE OR REPLACE FUNCTION public.health_monitor_watchdog_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  last_run timestamptz;
BEGIN
  SELECT MAX(created_at) INTO last_run
  FROM public.agent_diagnoses
  WHERE agent_name = 'health_monitor';

  IF last_run IS NULL OR last_run < NOW() - INTERVAL '30 minutes' THEN
    INSERT INTO public.system_notifications (severity, title, message, source, dedup_key)
    VALUES (
      'critical',
      'Health Monitor agente stale',
      'Ultimo run: ' || COALESCE(last_run::text, 'nunca'),
      'pg_cron_watchdog',
      'health_monitor_stale_' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24')
    )
    ON CONFLICT (source, dedup_key) WHERE dismissed_at IS NULL AND dedup_key IS NOT NULL
    DO NOTHING;
  END IF;
END;
$function$;
