-- Tabla de auditoría de cobertura email: detecta y reprocesa emails con
-- adjunto que llegaron a Gmail pero NO se procesaron por el workflow
-- (bugs, OAuth caído, filtros anti-spam, etc.).
--
-- Filosofía: el sistema se auto-cura silenciosamente. Solo molesta al
-- humano cuando algo necesita su cabeza de verdad (status='persistent_orphan').

CREATE TABLE IF NOT EXISTS public.email_audit_attempts (
  id              BIGSERIAL PRIMARY KEY,
  message_id      TEXT NOT NULL UNIQUE,
  gmail_account   TEXT NOT NULL,
  subject         TEXT,
  from_address    TEXT,
  received_at     TIMESTAMPTZ,
  attempt_count   INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','reprocessed_ok','persistent_orphan','ignored')),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_audit_attempts_status_idx
  ON public.email_audit_attempts (status);

CREATE INDEX IF NOT EXISTS email_audit_attempts_account_received_idx
  ON public.email_audit_attempts (gmail_account, received_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.email_audit_attempts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_audit_attempts_updated_at ON public.email_audit_attempts;
CREATE TRIGGER email_audit_attempts_updated_at
  BEFORE UPDATE ON public.email_audit_attempts
  FOR EACH ROW EXECUTE FUNCTION public.email_audit_attempts_set_updated_at();

-- RLS: solo service_role accede (panel admin lee con admin client)
ALTER TABLE public.email_audit_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_audit_attempts IS
  'Auditoría de cobertura email: huérfanos detectados por el cron auditor n8n. attempt_count >= 2 sin éxito → persistent_orphan (visible en /admin/revision).';
