-- exceptions_log retention pg_cron (15/05/2026)
--
-- Investigación: exceptions_log creció a 24K rows/24h por workflow Captura Errores
-- registrando cada retry attempt (antipatrón log-every-retry).
--
-- Solución tiered (research validated Microsoft Azure + Supabase docs):
--   - HOY: pg_cron retention 30d para resolved=true (cleanup automático)
--   - PROXIMA SESION: modificar Captura Errores logic (B) — log solo si retry FALLA
--
-- Conservar forense:
--   - resolved=false sin límite tiempo (evidencia bugs estructurales)
--   - resolved=true >30d se purga (ya cumplió su rol)

CREATE OR REPLACE FUNCTION public.prune_exceptions_log_resolved()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.exceptions_log
  WHERE resolved = true
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'cutoff', now() - interval '30 days', 'criteria', 'resolved=true >30d');
END;
$$;
GRANT EXECUTE ON FUNCTION public.prune_exceptions_log_resolved() TO service_role;

-- Schedule daily 03:45 UTC (after disk-heartbeats-prune 03:30, before exceptions-log-prune 03:35)
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'exceptions-log-resolved-prune';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'exceptions-log-resolved-prune',
  '45 3 * * *',
  $cron$SELECT public.prune_exceptions_log_resolved();$cron$
);

COMMENT ON FUNCTION public.prune_exceptions_log_resolved IS
  'Daily 03:45 UTC: borra exceptions_log resolved=true >30d. Mantiene unresolved sin limite (forense). Complemento del fix definitivo: modificar Captura Errores subworkflow para no registrar pre-retry (próxima sesión).';

-- Verificación post-migration
SELECT
  (SELECT count(*) FROM public.exceptions_log) AS total_rows,
  (SELECT count(*) FROM public.exceptions_log WHERE resolved=true) AS resolved_true_total,
  (SELECT count(*) FROM public.exceptions_log WHERE resolved=true AND created_at < now() - interval '30 days') AS will_purge_today,
  (SELECT count(*) FROM cron.job WHERE jobname='exceptions-log-resolved-prune') AS cron_job_registered;
