-- ============================================
-- Migration: stack agentes Cathedral
-- Fecha: 18/05/2026
-- Decretado: doc-validator agent + regla SUPREMA validador_y_mcps
-- Tablas: agent_diagnoses + invoice_classification_suggestions + agent_shadow_logs
-- Plus: schema private + función is_admin_email() SECURITY DEFINER
-- ============================================

-- Schema private para funciones SECURITY DEFINER (no expuesto via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

-- Función admin check (replica lib/auth-allowlist.ts en SQL)
-- Si cambia lista admins → sync este archivo + lib/auth-allowlist.ts
CREATE OR REPLACE FUNCTION private.is_admin_email()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT lower(trim(coalesce((select auth.jwt() ->> 'email'), ''))) IN (
    'd.vieco@cathedralgroup.es',
    'jm.lozano@cathedralgroup.es',
    'j.rivera@cathedralgroup.es'
  )
$$;

REVOKE EXECUTE ON FUNCTION private.is_admin_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin_email() TO authenticated, service_role;

-- ============================================
-- 1. agent_diagnoses — output Bug Diagnose Agent + Health Monitor + otros
-- ============================================
CREATE TABLE public.agent_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL CHECK (agent_name IN ('health_monitor','bug_diagnose','pre_deploy_validator','project_classifier','director')),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('cron','event','manual','test')),
  trigger_context JSONB NOT NULL DEFAULT '{}',
  diagnosis TEXT NOT NULL,
  proposed_fix TEXT,
  confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  citations JSONB DEFAULT '[]',
  revert_plan TEXT,
  applied BOOLEAN DEFAULT FALSE,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','approved','rejected','applied','reverted')),
  tokens_used INTEGER,
  cost_usd NUMERIC(10,6),
  model_version TEXT,
  is_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_diagnoses_status ON public.agent_diagnoses(status) WHERE NOT is_test;
CREATE INDEX idx_agent_diagnoses_agent_created ON public.agent_diagnoses(agent_name, created_at DESC);

ALTER TABLE public.agent_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_diagnoses FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.agent_diagnoses TO authenticated;
GRANT ALL ON public.agent_diagnoses TO service_role;

CREATE TRIGGER handle_updated_at_agent_diagnoses
  BEFORE UPDATE ON public.agent_diagnoses
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);

CREATE POLICY "admin only agent_diagnoses" ON public.agent_diagnoses
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((select private.is_admin_email()));

COMMENT ON TABLE public.agent_diagnoses IS 'Output Claude Agent SDK agents (Health Monitor + Bug Diagnose + Pre-Deploy Validator + Project Classifier + Director). Human-in-loop: NUNCA auto-apply, regla SUPREMA actualizaciones_supervisadas. status: pending → reviewed → approved/rejected → applied/reverted. is_test=true para smoke tests sintéticos. Sesión 18/05/2026.';

-- ============================================
-- 2. invoice_classification_suggestions — Project Classifier propose-only
-- ============================================
CREATE TABLE public.invoice_classification_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  suggested_project_id UUID REFERENCES public.projects(id),
  suggested_supplier_id UUID REFERENCES public.suppliers(id),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  model_version TEXT NOT NULL,
  applied BOOLEAN DEFAULT FALSE,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  rejected BOOLEAN DEFAULT FALSE,
  rejected_reason TEXT,
  tokens_used INTEGER,
  cost_usd NUMERIC(10,6),
  is_test BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_cls_pending ON public.invoice_classification_suggestions(invoice_id) WHERE NOT applied AND NOT rejected;

ALTER TABLE public.invoice_classification_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_classification_suggestions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.invoice_classification_suggestions TO authenticated;
GRANT ALL ON public.invoice_classification_suggestions TO service_role;

CREATE POLICY "admin only invoice_cls" ON public.invoice_classification_suggestions
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((select private.is_admin_email()));

COMMENT ON TABLE public.invoice_classification_suggestions IS 'Project Classifier Agent propone suggested_project_id + suggested_supplier_id + confidence + reasoning post-OCR. Admin valida + applied=true. NO auto-asigna sin gate humano (regla SUPREMA sistema_infalible + actualizaciones_supervisadas). Sesión 18/05/2026.';

-- ============================================
-- 3. agent_shadow_logs — shadow mode validation (append-only)
-- ============================================
CREATE TABLE public.agent_shadow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  trigger_context JSONB NOT NULL DEFAULT '{}',
  agent_output JSONB NOT NULL,
  baseline_output JSONB,
  match BOOLEAN,
  diff_details JSONB,
  tokens_used INTEGER,
  cost_usd NUMERIC(10,6),
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shadow_match ON public.agent_shadow_logs(agent_name, match, created_at DESC);

ALTER TABLE public.agent_shadow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_shadow_logs FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_shadow_logs TO authenticated;
GRANT ALL ON public.agent_shadow_logs TO service_role;

CREATE POLICY "admin select shadow" ON public.agent_shadow_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((select private.is_admin_email()));

COMMENT ON TABLE public.agent_shadow_logs IS 'Shadow mode validation per-agent. Compara agent_output vs baseline_output (n8n actual o endpoint legacy). match=TRUE significa output equivalente. Append-only — no UPDATE/DELETE policies. Pre-cutover validation pattern shadow → 1% → 10% → 50% → 100% rollout. Sesión 18/05/2026.';

-- ============================================
-- Reload PostgREST schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';
