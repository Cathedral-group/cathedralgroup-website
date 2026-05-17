-- ============================================
-- Migration: align agent_name CHECK constraints
-- Fecha: 17/05/2026
-- Sesión refactor Op 2 — smoke test reveló mismatch:
--   agent_diagnoses CHECK: ('health_monitor','bug_diagnose','pre_deploy_validator','project_classifier','director')
--   agent_dispatch_queue CHECK: ('health_diagnose','pre_deploy_validator','bug_diagnose','project_classifier','slo_monitor')
-- Alineamos agent_dispatch_queue a usar 'health_monitor' (canonical migration 20260518000000).
-- ============================================

-- 1) Limpieza rows test antiguas con valor obsoleto
DELETE FROM public.agent_dispatch_queue WHERE agent_name = 'health_diagnose' AND event_type = 'smoke_test_e2e';

-- 2) Replace CHECK constraint agent_dispatch_queue
ALTER TABLE public.agent_dispatch_queue
  DROP CONSTRAINT IF EXISTS agent_dispatch_queue_agent_name_check;

ALTER TABLE public.agent_dispatch_queue
  ADD CONSTRAINT agent_dispatch_queue_agent_name_check
  CHECK (agent_name IN (
    'health_monitor',
    'bug_diagnose',
    'pre_deploy_validator',
    'project_classifier',
    'director',
    'slo_monitor'
  ));

-- 3) Extend agent_diagnoses CHECK para añadir 'slo_monitor' (futuro)
ALTER TABLE public.agent_diagnoses
  DROP CONSTRAINT IF EXISTS agent_diagnoses_agent_name_check;

ALTER TABLE public.agent_diagnoses
  ADD CONSTRAINT agent_diagnoses_agent_name_check
  CHECK (agent_name IN (
    'health_monitor',
    'bug_diagnose',
    'pre_deploy_validator',
    'project_classifier',
    'director',
    'slo_monitor'
  ));

COMMENT ON CONSTRAINT agent_dispatch_queue_agent_name_check ON public.agent_dispatch_queue IS
  'Canonical agent names Cathedral. Aligned con agent_diagnoses constraint (sesión 17/05/2026 Op 2 fix).';
