-- ============================================================================
-- Cathedral Group — RPC mark_dispatch_done_or_failed (2026-05-21 tarde-noche)
--
-- Bug Pattern A: nodo workflow `Supabase INSERT` con neverError:true propaga
-- conflict 23505 como "success". Workflow llama Mark Dispatch Completed que
-- marca dispatch_queue.status='done' sin row real → 17 huérfanos detectados
-- en producción hoy.
--
-- Fix BD: extender CHECK constraint status + ADD error_msg + nueva RPC con
-- status real (ok/duplicate/error) en lugar de marca ciega 'done'.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- ADD error_msg col (idempotente)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_dispatch_queue
  ADD COLUMN IF NOT EXISTS error_msg TEXT;

COMMENT ON COLUMN public.agent_dispatch_queue.error_msg
  IS 'Mensaje error si INSERT downstream falló (Pattern A fix sesión 21/05). NULL si status=done OK.';

-- ─────────────────────────────────────────────────────────────────────────
-- ALTER CHECK constraint para incluir 'duplicate' status
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agent_dispatch_queue_status_check'
      AND table_name = 'agent_dispatch_queue'
  ) THEN
    ALTER TABLE public.agent_dispatch_queue DROP CONSTRAINT agent_dispatch_queue_status_check;
  END IF;
END $$;

ALTER TABLE public.agent_dispatch_queue
  ADD CONSTRAINT agent_dispatch_queue_status_check
  CHECK (status IN ('pending','running','done','failed','skipped_dedup','circuit_broken','duplicate'));

-- ─────────────────────────────────────────────────────────────────────────
-- Nueva RPC mark_dispatch_done_or_failed(p_dispatch_id, p_status, p_error_msg)
-- Reemplaza llamadas ciegas a mark_dispatch_completed.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_dispatch_done_or_failed(
  p_dispatch_id BIGINT,
  p_status TEXT DEFAULT 'done',
  p_error_msg TEXT DEFAULT NULL,
  p_cost_usd NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_dispatch_id IS NULL THEN
    RETURN;
  END IF;

  -- Validate status
  IF p_status NOT IN ('done','duplicate','failed') THEN
    RAISE EXCEPTION 'invalid p_status: %', p_status;
  END IF;

  UPDATE public.agent_dispatch_queue
  SET
    status = p_status,
    completed_at = NOW(),
    error_msg = COALESCE(p_error_msg, error_msg),
    cost_usd = COALESCE(p_cost_usd, cost_usd)
  WHERE id = p_dispatch_id
    AND status NOT IN ('done','duplicate','failed','circuit_broken');
END;
$$;

COMMENT ON FUNCTION public.mark_dispatch_done_or_failed
  IS 'Marca dispatch con status real (done/duplicate/failed) + error_msg. Reemplaza mark_dispatch_completed (ciego). Idempotente vía guard status NOT IN.';

GRANT EXECUTE ON FUNCTION public.mark_dispatch_done_or_failed TO service_role, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill 17 huérfanos done-sin-doc actuales → status='duplicate'
-- ─────────────────────────────────────────────────────────────────────────
WITH huerfanos AS (
  SELECT dq.id
  FROM public.agent_dispatch_queue dq
  WHERE dq.event_type = 'admin_upload'
    AND dq.status = 'done'
    AND dq.dedup_key LIKE 'admin-upload-reproc-21maig-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.original_filename = dq.trigger_payload->>'filename'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.contratos c
      WHERE c.original_filename = dq.trigger_payload->>'filename'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.presupuestos p
      WHERE p.original_filename = dq.trigger_payload->>'filename'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.original_filename = dq.trigger_payload->>'filename'
    )
)
UPDATE public.agent_dispatch_queue
SET status='duplicate',
    error_msg='Backfill 21/05 — done sin row destino (Pattern A bug 23505 silent fail)'
WHERE id IN (SELECT id FROM huerfanos);

COMMIT;

NOTIFY pgrst, 'reload schema';
