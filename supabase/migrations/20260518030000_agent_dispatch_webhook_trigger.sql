-- ============================================
-- Migration: BD trigger → pg_net.http_post → n8n webhook Cathedral-Agent-Dispatch
-- Fecha: 17/05/2026
-- Sesión refactor Op 2 — pg_net replace pg_notify (Op 1 daemon descartado)
-- Validación: research agent 88/100 winner + Supabase Database Webhooks pattern
--
-- Cuando bash detecta breach → INSERT agent_dispatch_queue → este trigger llama
-- n8n webhook → workflow Cathedral-Agent-Dispatch ejecuta agente Haiku 4.5.
-- ============================================

-- Wrapper function pg_net.http_post (SECURITY DEFINER porque pg_net schema 'extensions'
-- requiere permisos elevados; postgres role tiene acceso, trigger context no).
CREATE OR REPLACE FUNCTION public.dispatch_agent_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_request_id BIGINT;
  v_webhook_url TEXT := 'https://n8n.cathedralgroup.es/webhook/cathedral-agent-dispatch-791d17ed-d20e-4be0-b532-f7caee3ba700';
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT net.http_post(
      url := v_webhook_url,
      body := jsonb_build_object('dispatch_id', NEW.id, 'agent_name', NEW.agent_name, 'event_type', NEW.event_type, 'severity', NEW.severity),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 8000
    ) INTO v_request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Reemplaza trigger anterior (notify_agent_dispatch) que solo hacía pg_notify
DROP TRIGGER IF EXISTS trg_dispatch_notify ON public.agent_dispatch_queue;
DROP TRIGGER IF EXISTS trg_dispatch_webhook ON public.agent_dispatch_queue;

CREATE TRIGGER trg_dispatch_webhook
  AFTER INSERT ON public.agent_dispatch_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_agent_webhook();

-- Update replay function: usar pg_net en vez de pg_notify (consistencia event-driven Op 2)
CREATE OR REPLACE FUNCTION public.replay_stale_dispatches()
RETURNS TABLE(dispatch_id BIGINT, age_seconds INT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row RECORD;
  v_new_attempts INT;
  v_request_id BIGINT;
  v_webhook_url TEXT := 'https://n8n.cathedralgroup.es/webhook/cathedral-agent-dispatch-791d17ed-d20e-4be0-b532-f7caee3ba700';
BEGIN
  FOR v_row IN
    SELECT id, agent_name, event_type, severity, attempts, EXTRACT(EPOCH FROM (NOW() - created_at))::INT AS age_sec
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
      SELECT net.http_post(
        url := v_webhook_url,
        body := jsonb_build_object('dispatch_id', v_row.id, 'agent_name', v_row.agent_name, 'event_type', v_row.event_type, 'severity', v_row.severity),
        headers := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 8000
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
  'Cathedral Op 2 — BD trigger on INSERT agent_dispatch_queue calls n8n webhook via pg_net.http_post. Workflow Cathedral-Agent-Dispatch HVBW9fxJg34GzTsB ejecuta Haiku 4.5 diagnose.';
