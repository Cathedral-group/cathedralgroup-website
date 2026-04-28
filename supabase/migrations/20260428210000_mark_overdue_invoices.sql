-- B8 (sesión 27, 28/04/2026): función para marcar facturas vencidas
-- Llamada diariamente por workflow n8n `Cathedral · Marcar facturas vencidas (auto diario)`.
--
-- Devuelve número de filas actualizadas para logging/observabilidad.

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS TABLE(updated_count INTEGER, executed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.invoices
  SET payment_status = 'vencida',
      updated_at = NOW()
  WHERE payment_status = 'pendiente'
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND deleted_at IS NULL
    -- Solo facturas recibidas (las emitidas vencidas son cobros pendientes con
    -- semántica distinta — gestionar caso emitida/cobrar vs recibida/pagar)
    AND direction = 'recibida';

  GET DIAGNOSTICS affected = ROW_COUNT;

  RETURN QUERY SELECT affected, NOW();
END;
$$;

COMMENT ON FUNCTION public.mark_overdue_invoices IS
  'Marca como vencidas las facturas recibidas con due_date pasada y payment_status=pendiente. Llamada diariamente por workflow n8n.';

-- Permitir llamada via API REST con service_role (httpCustomAuth de n8n)
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices() TO service_role;
