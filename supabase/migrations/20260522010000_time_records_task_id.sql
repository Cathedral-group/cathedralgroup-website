-- ============================================================================
-- Cathedral Group — time_records.task_id (sesión 22/05/2026 noche)
--
-- Feedback David: "en asignaciones, además del proyecto, deberíamos poder
-- elegir las tareas". Vincula asignación día↔trabajador↔proyecto↔tarea.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.time_records
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_records_task_id
  ON public.time_records(task_id)
  WHERE task_id IS NOT NULL;

COMMENT ON COLUMN public.time_records.task_id
  IS 'FK opcional a project_tasks. Permite asignación específica trabajador→proyecto→tarea→día (sesión 22/05).';

COMMIT;

NOTIFY pgrst, 'reload schema';
