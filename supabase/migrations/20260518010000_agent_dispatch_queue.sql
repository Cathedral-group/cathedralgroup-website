-- ============================================
-- Migration: agent_dispatch_queue + pg_notify trigger (Op 2 event-driven)
-- Fecha: 17/05/2026
-- Sesión refactor: cron LLM 15min DEPRECATED → event-driven Op 2 (n8n webhook trigger via pg_net)
-- Validación: research agent (88/100 winner vs Daemon Node 65/100 + Vercel 71/100) + doc-validator
-- Nivel automatización: 1 (agente PROPONE, David APLICA manual) — Nivel 3 future-ready
-- ============================================

CREATE TABLE IF NOT EXISTS public.agent_dispatch_queue (
  id BIGSERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL CHECK (agent_name IN (
    'health_diagnose','pre_deploy_validator','bug_diagnose','project_classifier','slo_monitor'
  )),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','low','medium','critical')),
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','running','done','failed','skipped_dedup','circuit_broken'
  )),
  max_budget_usd NUMERIC(6,4) NOT NULL DEFAULT 0.10,
  cost_usd NUMERIC(8,5),
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  diagnosis TEXT,
  proposed_fix TEXT,
  auto_apply_eligible BOOL NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  fix_outcome TEXT CHECK (fix_outcome IS NULL OR fix_outcome IN ('success','failed','reverted','pending'))
);

-- Dedup hourly window: AT TIME ZONE 'UTC' fuerza expresión IMMUTABLE (doc-validator BLOCKER 1 fix)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dispatch_dedup_hourly ON public.agent_dispatch_queue (
  dedup_key, date_trunc('hour', created_at AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_dispatch_pending_by_agent ON public.agent_dispatch_queue (status, agent_name)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_dispatch_created_at ON public.agent_dispatch_queue (created_at DESC);

ALTER TABLE public.agent_dispatch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_dispatch_queue FORCE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE public.agent_dispatch_queue TO service_role;
GRANT SELECT ON TABLE public.agent_dispatch_queue TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.agent_dispatch_queue_id_seq TO service_role;

DROP POLICY IF EXISTS "service_role full dispatch" ON public.agent_dispatch_queue;
CREATE POLICY "service_role full dispatch" ON public.agent_dispatch_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated admin read dispatch" ON public.agent_dispatch_queue;
CREATE POLICY "authenticated admin read dispatch" ON public.agent_dispatch_queue
  FOR SELECT TO authenticated USING (private.is_admin_email());

-- Trigger pg_notify (sin SECURITY DEFINER — pg_notify no requiere privilegios, doc-validator advisory)
CREATE OR REPLACE FUNCTION public.notify_agent_dispatch() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM pg_notify('cathedral_agent_dispatch', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_notify ON public.agent_dispatch_queue;
CREATE TRIGGER trg_dispatch_notify
  AFTER INSERT ON public.agent_dispatch_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_dispatch();

-- Link agent_diagnoses → dispatch_id (trazabilidad). ON DELETE SET NULL preserva diagnoses huérfanos.
ALTER TABLE public.agent_diagnoses
  ADD COLUMN IF NOT EXISTS dispatch_id BIGINT REFERENCES public.agent_dispatch_queue(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_diagnoses_dispatch_id ON public.agent_diagnoses(dispatch_id)
  WHERE dispatch_id IS NOT NULL;

COMMENT ON TABLE public.agent_dispatch_queue IS 'Event-driven agent dispatch queue. Sistema pasivo INSERT row al detectar incident → trigger pg_notify cathedral_agent_dispatch → n8n webhook spawn agente. Op 2 selected 17/05/2026.';
COMMENT ON COLUMN public.agent_dispatch_queue.auto_apply_eligible IS 'Future-ready Nivel 3 selectivo. Default FALSE (Nivel 1: agente PROPONE, David APLICA manual).';
COMMENT ON COLUMN public.agent_dispatch_queue.dedup_key IS 'Anti-spam UNIQUE constraint hourly window. Patrón: <agent>:<event_type>:<resource_id>.';
