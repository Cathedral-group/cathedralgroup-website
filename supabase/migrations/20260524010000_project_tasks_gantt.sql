-- ============================================================================
-- Cathedral Group — Campos de planificación Gantt en project_tasks (24/05/2026)
--
-- Bloque 3 del sistema de planificación: vista Gantt por obra. Cada tarea
-- necesita rango temporal (inicio/fin planificados), orden visual, jerarquía
-- (sub-tareas) y dependencias (predecesor→sucesor).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS fecha_inicio_plan date,
  ADD COLUMN IF NOT EXISTS fecha_fin_plan    date,
  ADD COLUMN IF NOT EXISTS orden             int,
  ADD COLUMN IF NOT EXISTS parent_task_id    uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dependencias      jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_project_tasks_parent
  ON public.project_tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_gantt
  ON public.project_tasks(project_id, fecha_inicio_plan) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.project_tasks.fecha_inicio_plan IS 'Inicio planificado (barra Gantt). Sesión 24/05.';
COMMENT ON COLUMN public.project_tasks.fecha_fin_plan IS 'Fin planificado (barra Gantt).';
COMMENT ON COLUMN public.project_tasks.orden IS 'Orden visual de filas en el Gantt.';
COMMENT ON COLUMN public.project_tasks.parent_task_id IS 'Sub-tarea: FK a la tarea padre (misma tabla).';
COMMENT ON COLUMN public.project_tasks.dependencias IS 'Array de task_ids predecesores (JSON). Para flechas de dependencia.';

COMMIT;

NOTIFY pgrst, 'reload schema';
