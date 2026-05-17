-- ============================================
-- Migration: pg_cron replay stale agent dispatches
-- Fecha: 17/05/2026
-- Sesión refactor Op 2 — capa resiliencia event-driven
-- Validación: doc-validator (3 bugs identified + corrected):
--   FIX H: FOR UPDATE SKIP LOCKED (lock contention)
--   FIX C: pg_notify DESPUÉS de UPDATE (orden idempotencia)
--   FIX D: status='circuit_broken' al alcanzar max attempts (no rows huérfanas)
-- ============================================

CREATE OR REPLACE FUNCTION public.replay_stale_dispatches()
RETURNS TABLE(dispatch_id BIGINT, age_seconds INT, action TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_new_attempts INT;
BEGIN
  FOR v_row IN
    SELECT id, attempts, EXTRACT(EPOCH FROM (NOW() - created_at))::INT AS age_sec
    FROM public.agent_dispatch_queue
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '2 minutes'
      AND attempts < 3
    ORDER BY created_at ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  LOOP
    v_new_attempts := v_row.attempts + 1;

    UPDATE public.agent_dispatch_queue
    SET
      attempts = v_new_attempts,
      status = CASE WHEN v_new_attempts >= 3 THEN 'circuit_broken' ELSE status END
    WHERE id = v_row.id;

    IF v_new_attempts < 3 THEN
      PERFORM pg_notify('cathedral_agent_dispatch', v_row.id::text);
      dispatch_id := v_row.id;
      age_seconds := v_row.age_sec;
      action := 'replayed';
    ELSE
      dispatch_id := v_row.id;
      age_seconds := v_row.age_sec;
      action := 'circuit_broken';
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replay_stale_dispatches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replay_stale_dispatches() TO service_role, postgres;

SELECT cron.schedule(
  'cathedral-agent-dispatch-replay',
  '*/5 * * * *',
  $$SELECT public.replay_stale_dispatches();$$
);

COMMENT ON FUNCTION public.replay_stale_dispatches() IS
  'Replay agent_dispatch_queue rows status=pending >2min via pg_notify. Anti-flood SKIP LOCKED + max 3 attempts → circuit_broken. Capa resiliencia Op 2 event-driven.';
