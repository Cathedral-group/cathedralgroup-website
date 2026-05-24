-- ============================================================================
-- Cathedral Group — Línea base del Gantt (24/05/2026)
--
-- Feedback David: ver arriba la fecha prevista y la desviación (días y horas de
-- más o de menos). Guardamos la planificación prevista al generar el Gantt
-- desde el presupuesto para poder comparar con lo que realmente se planifica.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS gantt_inicio_previsto     date,
  ADD COLUMN IF NOT EXISTS gantt_fin_previsto        date,
  ADD COLUMN IF NOT EXISTS gantt_horas_previstas     numeric,
  ADD COLUMN IF NOT EXISTS gantt_trabajadores_previstos int;

COMMENT ON COLUMN public.projects.gantt_fin_previsto IS
  'Línea base: fin planificado al generar el Gantt desde el presupuesto. Para medir desviación. Sesión 24/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
