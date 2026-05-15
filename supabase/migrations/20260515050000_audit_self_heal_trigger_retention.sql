-- Self-healing email_audit_attempts (15/05/2026, research-validated)
--
-- Problema: workflow general NUNCA llama mode=success → rows pending acumulan
-- (514 backlog observado, 358 con attempt_count=0). El cron auditor solo
-- procesa 5 oldest/día con attempt_count<2 → drenaje glacial.
--
-- Solución (industry standard Outbox + Stripe retry pattern):
--   1. Trigger AFTER INSERT en invoices/quotes/documents marca audit row
--      reprocessed_ok automáticamente si existe match por email_message_id.
--      Idempotente, resiliente a fallo cron, eventual consistency garantizada.
--   2. pg_cron retention: pending viejo → persistent_orphan / ignored según
--      attempt_count, evitando acumulación infinita.
--
-- Riesgo: cero a operaciones existentes. Trigger es AFTER INSERT no-op si
-- audit row no existe (la inmensa mayoría de inserts manuales /admin).

-- =============================================================================
-- Función self-heal
-- =============================================================================
CREATE OR REPLACE FUNCTION public.email_audit_mark_reprocessed_ok()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Solo si el INSERT tiene email_message_id (procesado por workflow email)
  IF NEW.email_message_id IS NULL OR NEW.email_message_id = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.email_audit_attempts
  SET status = 'reprocessed_ok',
      last_attempt_at = NOW(),
      last_error = NULL
  WHERE message_id = NEW.email_message_id
    AND status IN ('pending', 'persistent_orphan');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.email_audit_mark_reprocessed_ok() IS
  'Self-heal: cuando workflow general crea invoice/quote/document, marca el audit row correspondiente como reprocessed_ok. Reemplaza la llamada faltante a mode=success del workflow.';

-- =============================================================================
-- Triggers en las 3 tablas destino
-- =============================================================================
DROP TRIGGER IF EXISTS invoices_email_audit_heal ON public.invoices;
CREATE TRIGGER invoices_email_audit_heal
  AFTER INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.email_audit_mark_reprocessed_ok();

DROP TRIGGER IF EXISTS quotes_email_audit_heal ON public.quotes;
CREATE TRIGGER quotes_email_audit_heal
  AFTER INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.email_audit_mark_reprocessed_ok();

DROP TRIGGER IF EXISTS documents_email_audit_heal ON public.documents;
CREATE TRIGGER documents_email_audit_heal
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.email_audit_mark_reprocessed_ok();

-- =============================================================================
-- Self-heal one-shot del backlog actual (514 pending)
-- =============================================================================
UPDATE public.email_audit_attempts ea
SET status = 'reprocessed_ok',
    last_attempt_at = NOW(),
    last_error = 'auto_healed:backlog_drain_20260515'
WHERE status IN ('pending', 'persistent_orphan')
  AND message_id IN (
    SELECT DISTINCT email_message_id FROM public.invoices
      WHERE email_message_id IS NOT NULL AND deleted_at IS NULL
    UNION
    SELECT DISTINCT email_message_id FROM public.quotes
      WHERE email_message_id IS NOT NULL AND deleted_at IS NULL
    UNION
    SELECT DISTINCT email_message_id FROM public.documents
      WHERE email_message_id IS NOT NULL AND deleted_at IS NULL
  );

-- =============================================================================
-- pg_cron retention: bounded retries (Stripe pattern)
-- =============================================================================
-- - pending con attempt_count >= 2 y > 7 días sin tocar → persistent_orphan
-- - pending con attempt_count = 0 y > 30 días → ignored (auto-clean ruido)
-- - reprocessed_ok / ignored / persistent_orphan > 180 días → DELETE
CREATE OR REPLACE FUNCTION public.email_audit_attempts_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.email_audit_attempts
  SET status = 'persistent_orphan',
      last_error = COALESCE(last_error, '') || ' | auto_promoted:retention_7d_2attempts'
  WHERE status = 'pending'
    AND attempt_count >= 2
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '7 days';

  UPDATE public.email_audit_attempts
  SET status = 'ignored',
      last_error = COALESCE(last_error, '') || ' | auto_ignored:retention_30d_no_attempt'
  WHERE status = 'pending'
    AND attempt_count = 0
    AND created_at < NOW() - INTERVAL '30 days';

  DELETE FROM public.email_audit_attempts
  WHERE status IN ('reprocessed_ok', 'ignored', 'persistent_orphan')
    AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '180 days';
END;
$$;

COMMENT ON FUNCTION public.email_audit_attempts_retention() IS
  'Retention bounded: pending viejo → terminal, terminales > 180d → DELETE. Llamado por pg_cron diario.';

-- pg_cron job (idempotente)
SELECT cron.unschedule('email-audit-retention') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-audit-retention'
);
SELECT cron.schedule(
  'email-audit-retention',
  '17 3 * * *',  -- 03:17 UTC daily (después del cron auditor 03:00)
  $cron$ SELECT public.email_audit_attempts_retention(); $cron$
);
