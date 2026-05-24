-- ============================================================================
-- Cathedral Group — Días extra de trabajo en el Gantt (24/05/2026)
--
-- Feedback David: por defecto findes/festivos no cuentan (correcto), pero el
-- admin debe poder DECIDIR trabajar un sábado/domingo/festivo concreto. Esos
-- días se guardan por tarea y la barra los pinta como trabajo.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS dias_extra jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.project_tasks.dias_extra IS
  'Fechas (ISO) no laborables (finde/festivo) en las que SÍ se trabaja por decisión del admin. La barra las pinta como trabajo. Sesión 24/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
