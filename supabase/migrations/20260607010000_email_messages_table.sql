-- ============================================================================
-- 20260607010000_email_messages_table.sql
-- Tabla `email_messages`: guarda el EMAIL/conversación de origen de cada documento.
-- Los docs (invoices + typed-docs) ya guardan `email_message_id` → enlazan por ahí.
--
-- Objetivo (David 07/06): no usar el email y tirarlo — RETENERLO, mostrarlo en el
-- panel admin, y que un AGENTE futuro pueda consultarlo en la BD sin entrar en Gmail.
--
-- Diseño = tabla dedicada (NO columnas en cada doc): vale para cualquier tipo de
-- documento, NO toca la tabla invoices (cero riesgo al flujo vivo), y es el hogar
-- natural de la conversación (asunto, cuerpo, remitente, remitente original de
-- reenvíos, hilo) + consulta por agente (FTS ahora; embeddings/pgvector después).
--
-- Seguridad: datos personales (RGPD) → SOLO service_role (sin acceso anon ni
-- authenticated directo). El panel lee vía API admin con service_role, igual que
-- el resto de datos sensibles (patrón vat_quarterly post-fix 06/06).
-- Validado por doc-validator + agente de diseño n8n (sesión 07/06/2026).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id  text NOT NULL,
  gmail_account     text,
  from_address      text,
  from_original     text,        -- remitente ORIGINAL si es reenvío (Fwd:), parseado del cuerpo (futuro)
  to_address        text,
  subject           text,
  body              text,
  received_at       timestamptz,
  thread_id         text,
  headers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  company_id        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_messages_message_id_unique UNIQUE (email_message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_messages_from      ON public.email_messages (from_address) WHERE from_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_received  ON public.email_messages (received_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread    ON public.email_messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_company   ON public.email_messages (company_id) WHERE company_id IS NOT NULL;
-- Búsqueda de texto (para el agente): asunto + cuerpo
CREATE INDEX IF NOT EXISTS idx_email_messages_fts ON public.email_messages
  USING gin (to_tsvector('spanish', coalesce(subject,'') || ' ' || coalesce(body,'')));

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages FORCE ROW LEVEL SECURITY;

-- Datos sensibles (RGPD): SOLO service_role. Panel lee vía API admin service_role.
GRANT ALL PRIVILEGES ON TABLE public.email_messages TO service_role;

CREATE POLICY email_messages_service_all ON public.email_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at automático en UPSERT (PostgREST merge-duplicates no lo toca solo)
CREATE TRIGGER email_messages_set_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW
  EXECUTE PROCEDURE extensions.moddatetime(updated_at);

COMMENT ON TABLE public.email_messages IS
  'Email/conversacion de origen de documentos (enlace por email_message_id desde invoices/typed-docs). Solo service_role (datos sensibles RGPD); panel lee via API admin. Para mostrar en admin + consulta por agente futuro. Sesion 07/06/2026.';
