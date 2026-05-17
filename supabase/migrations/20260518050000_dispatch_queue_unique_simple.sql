-- ============================================
-- Migration: simplify agent_dispatch_queue UNIQUE constraint
-- Fecha: 17/05/2026
-- Sesión refactor Op 2 — validator detectó BLOQUEANTE:
--   UNIQUE compuesto con expresión `date_trunc(...)` NO funciona con
--   PostgREST `?on_conflict=dedup_key` (solo acepta column names, no expressions).
-- Fix: simplificar a UNIQUE(dedup_key). Ventana horaria queda EN EL VALOR
-- del dedup_key (e.g. "disk_critical_2026-05-17-14").
-- ============================================

-- Drop old expression-based unique index
DROP INDEX IF EXISTS public.uniq_dispatch_dedup_hourly;

-- Add simple UNIQUE constraint on dedup_key
ALTER TABLE public.agent_dispatch_queue
  DROP CONSTRAINT IF EXISTS agent_dispatch_queue_dedup_key_key;

ALTER TABLE public.agent_dispatch_queue
  ADD CONSTRAINT agent_dispatch_queue_dedup_key_key UNIQUE (dedup_key);

COMMENT ON CONSTRAINT agent_dispatch_queue_dedup_key_key ON public.agent_dispatch_queue IS
  'Cathedral Op 2 dedup. dedup_key incorpora hora UTC en el valor (e.g. "disk_critical_2026-05-17-14") para granularidad temporal. Bash scripts usar pattern: <agent>_<event>_$(date -u +%Y-%m-%d-%H). PostgREST upsert via ?on_conflict=dedup_key + Prefer: resolution=ignore-duplicates.';
