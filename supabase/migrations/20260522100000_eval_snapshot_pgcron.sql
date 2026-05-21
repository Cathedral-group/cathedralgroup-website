-- ============================================================================
-- Cathedral Group — Snapshot eval automático vía pg_cron (22/05/2026)
--
-- Problema: el "snapshot eval" (eval_runs) llevaba 116h sin ejecutarse →
-- "Sistema Health: DEGRADED". Existía el endpoint POST /api/eval/snapshot pero
-- NINGÚN cron lo disparaba (el último run del 16/05 fue manual).
--
-- Fix: wrapper plpgsql que ejecuta el snapshot + persiste en eval_runs,
-- programado con pg_cron a diario. Todo dentro de Postgres — sin depender de
-- GitHub Actions ni del secret AUDIT_CRON_SECRET. Más robusto y autónomo.
--
-- DEPENDENCIA DE FIRMA: eval_structural_snapshot DEBE seguir devolviendo jsonb
-- escalar (no SETOF). Si cambia a RETURNS TABLE, el `:=` rompe en runtime.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

CREATE OR REPLACE FUNCTION public.run_eval_snapshot_cron()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics jsonb;
  v_id uuid;
BEGIN
  -- eval_structural_snapshot devuelve jsonb escalar (ventana 30 días)
  v_metrics := eval_structural_snapshot(30);
  INSERT INTO eval_runs (run_type, scope, metrics, notes)
  VALUES ('cron', 'invoices', v_metrics, 'pg_cron diario')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_eval_snapshot_cron() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_eval_snapshot_cron() TO service_role;

COMMENT ON FUNCTION public.run_eval_snapshot_cron IS
  'Ejecuta eval_structural_snapshot(30) + persiste en eval_runs. Programado pg_cron diario 06:30 UTC. Reemplaza el cron ausente que dejó el snapshot eval parado 116h (sesión 22/05). Depende de que eval_structural_snapshot devuelva jsonb escalar.';

-- Cron diario 06:30 UTC (08:30 Madrid CEST). Re-ejecutar = UPSERT.
SELECT cron.schedule(
  'eval-snapshot-daily',
  '30 6 * * *',
  $cron$SELECT public.run_eval_snapshot_cron();$cron$
);

COMMIT;
