-- Sprint adicional 10/05 — Sistema de notificaciones internas para admin.
-- Cierra el ciclo de alerting sin depender de servicio externo (Resend pendiente).
-- Los 3 socios admin ven el banner al entrar en /admin/* si hay notificaciones activas.

CREATE TABLE IF NOT EXISTS public.system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text,
  source text NOT NULL DEFAULT 'system',  -- ej: 'health_cron', 'manual', 'workflow_general', etc.
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  dismissed_by text,        -- email del admin que descartó
  dismissed_at timestamptz,
  -- Para deduplicación: source + dedup_key permite "actualizar en lugar de duplicar"
  dedup_key text
);

-- Índice parcial: solo notificaciones activas (no dismissed) — para query rápida del banner
CREATE INDEX IF NOT EXISTS idx_system_notifications_active
  ON public.system_notifications (severity, created_at DESC)
  WHERE dismissed_at IS NULL;

-- Índice para deduplicación
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_notifications_dedup
  ON public.system_notifications (source, dedup_key)
  WHERE dismissed_at IS NULL AND dedup_key IS NOT NULL;

COMMENT ON TABLE public.system_notifications IS
  'Notificaciones internas del sistema visibles en banner /admin/*. Sustituye email
   alerts mientras Resend/SendGrid no esté configurado. Soporta deduplicación por
   (source, dedup_key) — útil para no spamear cuando el cron health detecta el mismo
   error en varios runs consecutivos.';

-- RPC helper para upsert idempotente: si ya existe (source, dedup_key) activa, actualiza
-- en lugar de crear duplicada.
CREATE OR REPLACE FUNCTION public.upsert_system_notification(
  p_severity text,
  p_title text,
  p_message text DEFAULT NULL,
  p_source text DEFAULT 'system',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_dedup_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  -- Validar severity
  IF p_severity NOT IN ('info', 'warning', 'critical') THEN
    RAISE EXCEPTION 'severity inválida: %', p_severity;
  END IF;

  -- Si tiene dedup_key, intentar UPDATE primero
  IF p_dedup_key IS NOT NULL THEN
    UPDATE system_notifications
    SET severity = p_severity,
        title = p_title,
        message = p_message,
        metadata = p_metadata,
        created_at = NOW()  -- refresca timestamp para que aparezca como reciente
    WHERE source = p_source
      AND dedup_key = p_dedup_key
      AND dismissed_at IS NULL
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- INSERT nuevo
  INSERT INTO system_notifications (severity, title, message, source, metadata, dedup_key)
  VALUES (p_severity, p_title, p_message, p_source, p_metadata, p_dedup_key)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- RPC helper para dismiss
CREATE OR REPLACE FUNCTION public.dismiss_system_notification(
  p_notification_id uuid,
  p_admin_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE system_notifications
  SET dismissed_by = p_admin_email,
      dismissed_at = NOW()
  WHERE id = p_notification_id
    AND dismissed_at IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_system_notification(text, text, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_system_notification(uuid, text) TO service_role;

COMMENT ON FUNCTION public.upsert_system_notification IS
  'Crea o actualiza notificación con deduplicación por (source, dedup_key). El cron
   health la usa con dedup_key=overall_status para no duplicar alertas en cada run.';
