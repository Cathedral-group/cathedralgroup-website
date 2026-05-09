-- Sprint adicional 10/05 madrugada — Bug 6 (auditoría profunda):
-- "Webhook reprocesador no tiene Idempotency-Key. Race condition: si llegan 2
-- requests simultáneos con la misma factura, ambos pasan Check Duplicado antes
-- del INSERT y se duplica."
--
-- Fix arquitectural: tabla `webhook_idempotency` con UNIQUE message_id +
-- INSERT...ON CONFLICT DO NOTHING en el Adaptador. Si el INSERT no afecta
-- filas → ya procesado → return early.
--
-- TTL: 24h. Cron diario hace cleanup de filas viejas.

CREATE TABLE IF NOT EXISTS public.webhook_idempotency (
  message_id text PRIMARY KEY,
  webhook_path text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT NOW(),
  status text DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_data jsonb
);

CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_processed_at
  ON public.webhook_idempotency (processed_at);

COMMENT ON TABLE public.webhook_idempotency IS
  'Idempotency log de webhooks Cathedral. Cada message_id solo se procesa una vez.
   Auto-cleanup >24h vía cron. Sesión 10/05 (Bug 6 auditoría profunda).';

-- Función helper para cleanup automático
CREATE OR REPLACE FUNCTION public.cleanup_webhook_idempotency()
RETURNS TABLE(deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  DELETE FROM webhook_idempotency
  WHERE processed_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_webhook_idempotency() TO service_role;
