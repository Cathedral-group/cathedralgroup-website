-- ============================================================================
-- Dispatch lifecycle RPCs — mark_dispatch_running / mark_dispatch_completed
-- ----------------------------------------------------------------------------
-- Resuelve bug bookkeeping: Workflow Definitivo procesa factura OK pero queue
-- queda status='pending' → sweeper replay_stale_dispatches retriga 2x → 3
-- attempts → circuit_broken. SHA-256 dedup previene invoice duplicate pero OCR
-- re-ejecuta gastando ~$0.04 extra/factura.
--
-- Patrón: claim-on-start + complete-on-end. NULL-safe (Gmail poll sin
-- dispatch_id pasa por estos RPCs sin efecto).
--
-- Refs:
--   - Validator n8n-doc-validator aprobado 19/05/2026
--   - Sesión 17/05 Op 2 dispatch architecture
--   - Bug observado dispatches 36-45 (todos circuit_broken o pending stale)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_dispatch_running(p_dispatch_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NULL-safe: Gmail poll path no incluye dispatch_id, skip silente
  IF p_dispatch_id IS NULL THEN RETURN; END IF;

  UPDATE public.agent_dispatch_queue
  SET status = 'running',
      started_at = COALESCE(started_at, NOW())
  WHERE id = p_dispatch_id
    AND status IN ('pending', 'running');
END;
$$;

COMMENT ON FUNCTION public.mark_dispatch_running IS
  'Marca dispatch como running al inicio del workflow consumidor. NULL-safe + idempotente.';

CREATE OR REPLACE FUNCTION public.mark_dispatch_completed(p_dispatch_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_dispatch_id IS NULL THEN RETURN; END IF;

  -- Status canónico = 'done' (constraint agent_dispatch_queue_status_check
  -- permite: pending|running|done|failed|skipped_dedup|circuit_broken).
  UPDATE public.agent_dispatch_queue
  SET status = 'done',
      completed_at = NOW()
  WHERE id = p_dispatch_id
    AND status NOT IN ('done', 'circuit_broken');
END;
$$;

COMMENT ON FUNCTION public.mark_dispatch_completed IS
  'Marca dispatch como done al final del workflow consumidor exitoso. NULL-safe + idempotente.';

GRANT EXECUTE ON FUNCTION public.mark_dispatch_running(BIGINT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dispatch_completed(BIGINT) TO service_role, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_dispatch_running(BIGINT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_dispatch_completed(BIGINT) FROM anon;
NOTIFY pgrst, 'reload schema';
