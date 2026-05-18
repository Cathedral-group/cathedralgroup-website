-- ============================================
-- Migration: Op 2 extended for workflow_invoice_ocr → Workflow Definitivo dispatch
-- Fecha: 18/05/2026 sesión Plan C tarde
-- Sesión: David decisión arquitectural reusar Op 2 + conectar admin upload + portal tickets
--         al Workflow Definitivo (OcYrtR9pM6jIa7NK) via webhook Reprocesador.
-- Validators: doc-validator + n8n-doc-validator + general-purpose + cavecrew-investigator
-- ============================================
--
-- Cambios:
--   1. Extender CHECK constraint agent_name con 'workflow_invoice_ocr' (NOT VALID + VALIDATE
--      pattern safe — datos existentes ya en lista old, validation pasará).
--   2. Crear helpers `get_webhook_url_for_agent` + `get_webhook_headers_for_agent` —
--      DRY-no-repeat entre `dispatch_agent_webhook` trigger + `replay_stale_dispatches` sweeper.
--   3. UPDATE dispatch_agent_webhook con branching URL por agent_name + NULL guard token.
--   4. UPDATE replay_stale_dispatches con mismo branching (else workflow_invoice_ocr stale rows
--      irían al webhook Op2 incorrecto).
--
-- POST-MIGRATION MANUAL (NO en migration — secret real):
--   Supabase Dashboard → Vault → New secret:
--     name:        cathedral_reprocess_token
--     value:       <Bearer token real de credential n8n dfTYu6xcyozU4BOs sin prefijo "Bearer ">
--     description: Token webhook Reprocesador Workflow Definitivo OcYrtR9pM6jIa7NK
--
--   Sin este secret manual: trigger skipea workflow_invoice_ocr dispatches con RAISE WARNING
--   (Op 2 path normal NO afectado).
--
-- ============================================

-- ============================================
-- 1. Extender CHECK constraint con NOT VALID + VALIDATE + DROP old pattern
-- ============================================

-- Lista actualizada: empíricamente medido pg_constraint actual incluye health_monitor + director
-- (corrige assumption migration original 20260518010000 que decía health_diagnose)
ALTER TABLE public.agent_dispatch_queue
  ADD CONSTRAINT agent_dispatch_queue_agent_name_check_v2
  CHECK (agent_name IN (
    'health_monitor','pre_deploy_validator','bug_diagnose',
    'project_classifier','director','slo_monitor','workflow_invoice_ocr'
  )) NOT VALID;

ALTER TABLE public.agent_dispatch_queue
  VALIDATE CONSTRAINT agent_dispatch_queue_agent_name_check_v2;

ALTER TABLE public.agent_dispatch_queue
  DROP CONSTRAINT IF EXISTS agent_dispatch_queue_agent_name_check;

-- ============================================
-- 2. Helpers extraídos para DRY-no-repeat (dispatch + replay usan ambos)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_webhook_url_for_agent(p_agent_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_agent_name = 'workflow_invoice_ocr' THEN
    RETURN 'https://n8n.cathedralgroup.es/webhook/cathedral-reprocess';
  ELSE
    -- Op 2 webhook actual (Cathedral-Agent-Dispatch HVBW9fxJg34GzTsB)
    RETURN 'https://n8n.cathedralgroup.es/webhook/cathedral-agent-dispatch-791d17ed-d20e-4be0-b532-f7caee3ba700';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_webhook_headers_for_agent(p_agent_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF p_agent_name = 'workflow_invoice_ocr' THEN
    -- Vault lookup token webhook Reprocesador
    SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE name = 'cathedral_reprocess_token'
    LIMIT 1;

    -- NULL guard: si secret no creado en Vault → caller decide skip
    IF v_token IS NULL THEN
      RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    );
  ELSE
    -- Op 2 webhook actual: URL UUID secret, sin Authorization header
    RETURN jsonb_build_object('Content-Type', 'application/json');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_webhook_url_for_agent(TEXT) IS
  'Cathedral Op 2 v2 — branch URL webhook por agent_name. workflow_invoice_ocr→Definitivo, resto→Op 2.';

COMMENT ON FUNCTION public.get_webhook_headers_for_agent(TEXT) IS
  'Cathedral Op 2 v2 — branch headers webhook por agent_name. workflow_invoice_ocr requiere Vault secret cathedral_reprocess_token. Returns NULL si secret missing (caller decide skip).';

-- ============================================
-- 3. UPDATE dispatch_agent_webhook trigger con branching + NULL guard
-- ============================================

CREATE OR REPLACE FUNCTION public.dispatch_agent_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_request_id BIGINT;
  v_webhook_url TEXT;
  v_headers JSONB;
  v_body JSONB;
BEGIN
  IF NEW.status = 'pending' THEN
    v_webhook_url := public.get_webhook_url_for_agent(NEW.agent_name);
    v_headers := public.get_webhook_headers_for_agent(NEW.agent_name);

    -- NULL guard: si headers null (secret missing) → skip + warning + dejar row pending
    -- Sweeper retry intentará de nuevo cuando secret se cree
    IF v_headers IS NULL THEN
      RAISE WARNING 'dispatch_agent_webhook: cathedral_reprocess_token Vault secret missing — skipping dispatch (agent_name=%, dispatch_id=%)', NEW.agent_name, NEW.id;
      RETURN NEW;
    END IF;

    -- Body diferente por agent_name
    IF NEW.agent_name = 'workflow_invoice_ocr' THEN
      -- Workflow Definitivo espera Gmail-like payload + dispatch_id metadata
      v_body := NEW.trigger_payload || jsonb_build_object('dispatch_id', NEW.id);
    ELSE
      -- Op 2 body minimal
      v_body := jsonb_build_object(
        'dispatch_id', NEW.id,
        'agent_name', NEW.agent_name,
        'event_type', NEW.event_type,
        'severity', NEW.severity
      );
    END IF;

    SELECT net.http_post(
      url := v_webhook_url,
      body := v_body,
      headers := v_headers,
      timeout_milliseconds := 10000
    ) INTO v_request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- 4. UPDATE replay_stale_dispatches con mismo branching (DRY via helpers)
-- ============================================

CREATE OR REPLACE FUNCTION public.replay_stale_dispatches()
RETURNS TABLE(dispatch_id BIGINT, age_seconds INT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_row RECORD;
  v_new_attempts INT;
  v_request_id BIGINT;
  v_webhook_url TEXT;
  v_headers JSONB;
  v_body JSONB;
BEGIN
  FOR v_row IN
    SELECT id, agent_name, event_type, severity, trigger_payload, attempts,
           EXTRACT(EPOCH FROM (NOW() - created_at))::INT AS age_sec
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
      v_webhook_url := public.get_webhook_url_for_agent(v_row.agent_name);
      v_headers := public.get_webhook_headers_for_agent(v_row.agent_name);

      -- NULL guard: si secret missing, skip retry (row queda pending, próximo replay reintenta)
      IF v_headers IS NULL THEN
        dispatch_id := v_row.id;
        age_seconds := v_row.age_sec;
        action := 'skipped_secret_missing';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_row.agent_name = 'workflow_invoice_ocr' THEN
        v_body := v_row.trigger_payload || jsonb_build_object('dispatch_id', v_row.id);
      ELSE
        v_body := jsonb_build_object(
          'dispatch_id', v_row.id,
          'agent_name', v_row.agent_name,
          'event_type', v_row.event_type,
          'severity', v_row.severity
        );
      END IF;

      SELECT net.http_post(
        url := v_webhook_url,
        body := v_body,
        headers := v_headers,
        timeout_milliseconds := 10000
      ) INTO v_request_id;

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

COMMENT ON FUNCTION public.dispatch_agent_webhook() IS
  'Cathedral Op 2 v2 (18/05/2026) — extended agent_name workflow_invoice_ocr → webhook Reprocesador Workflow Definitivo. Vault secret cathedral_reprocess_token requerido (post-migration manual). NULL guard skip si secret missing.';

COMMENT ON FUNCTION public.replay_stale_dispatches() IS
  'Cathedral Op 2 v2 (18/05/2026) — sweeper pg_cron cada 5min. Branching URL+headers por agent_name via helpers. NULL guard skip si Vault secret missing (row stays pending).';
