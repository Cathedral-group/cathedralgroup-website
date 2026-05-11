-- FASE 3 — Push notifications VAPID para admins
--
-- Cada admin (en su móvil + en cada navegador donde se suscriba) genera una
-- PushSubscription única vía navigator.serviceWorker. Los datos sensibles son:
--   - endpoint: URL del push service del navegador (FCM/Mozilla/Apple)
--   - keys.p256dh + keys.auth: claves cifradas para que solo el navegador
--     pueda descifrar el payload
--
-- Una vez registrada, el server puede enviar payloads cifrados a esa URL desde
-- lib/push-server.ts y el SW del admin (admin-sw.js) muestra la notificación.
--
-- Seguridad:
--   - Solo admins de ADMIN_ALLOWED_EMAILS pueden registrar suscripción (endpoint exige AAL2)
--   - RLS + FORCE bloquea acceso desde cliente con anon key
--   - Endpoint único por admin+device (UNIQUE constraint)
--   - last_used_at + last_failed_at para detectar suscripciones rotas (limpiar)

CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  admin_email TEXT NOT NULL,            -- email del admin (de ADMIN_ALLOWED_EMAILS)
  endpoint TEXT NOT NULL,               -- URL push service (FCM/Mozilla/Apple)
  p256dh TEXT NOT NULL,                 -- clave pública cifrado (base64)
  auth TEXT NOT NULL,                   -- secret cifrado (base64)

  -- Info útil para identificar el device
  device_label TEXT,                    -- ej: 'iPhone Safari', 'Chrome MBP'
  user_agent TEXT,
  created_ip TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,             -- última vez que se envió push con éxito
  last_failed_at TIMESTAMPTZ,           -- última vez que push falló (FCM 410 = subscription muerta)
  fail_count INT NOT NULL DEFAULT 0,    -- contador fallos consecutivos (>5 → desactivar)

  deleted_at TIMESTAMPTZ,

  CONSTRAINT admin_push_endpoint_unique UNIQUE (admin_email, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_admin_push_active
  ON public.admin_push_subscriptions (admin_email)
  WHERE deleted_at IS NULL;

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_push_subscriptions FORCE ROW LEVEL SECURITY;

-- No hay policies: solo service_role accede (vía /api/admin/push/* con AAL2 admin check).
-- Cliente con anon key queda bloqueado por RLS+FORCE → 0 filas devueltas.

COMMENT ON TABLE public.admin_push_subscriptions IS
  'FASE 3 push VAPID: suscripciones de notificaciones push del navegador para '
  'admins. Cada admin puede tener varias (una por device/navegador). El payload '
  'que viaja al push service va cifrado con p256dh+auth — el push service NO '
  'puede leerlo, solo el SW del admin con su clave privada local.';
