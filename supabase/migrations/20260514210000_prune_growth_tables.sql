-- ============================================================
-- Anti-growth pruning (continuación blindaje 14/05/2026)
-- Limita crecimiento silente de tablas que pueden saltar tamaño
-- por bugs en cascada o por uso normal acumulado.
-- ============================================================

-- C. Prune exceptions_log >90 días (top tabla con 22MB / 51K rows)
CREATE OR REPLACE FUNCTION public.prune_exceptions_log()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.exceptions_log
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'cutoff', now() - interval '90 days');
END;
$$;
GRANT EXECUTE ON FUNCTION public.prune_exceptions_log() TO service_role;

-- D. Prune cron.job_run_details >7 días (pg_cron history se acumula)
CREATE OR REPLACE FUNCTION public.prune_cron_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'cutoff', now() - interval '7 days');
END;
$$;
GRANT EXECUTE ON FUNCTION public.prune_cron_history() TO service_role;

-- Schedule jobs
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('exceptions-log-prune','cron-history-prune');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('exceptions-log-prune','35 3 * * *',$cron$SELECT public.prune_exceptions_log();$cron$);
SELECT cron.schedule('cron-history-prune','40 3 * * *',$cron$SELECT public.prune_cron_history();$cron$);

COMMENT ON FUNCTION public.prune_exceptions_log IS 'Daily 03:35 UTC: borra exceptions_log >90d. Evita crecimiento silente si bug n8n mete errores masivos.';
COMMENT ON FUNCTION public.prune_cron_history IS 'Daily 03:40 UTC: borra cron.job_run_details >7d. pg_cron history default no se purga solo.';
