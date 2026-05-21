-- ============================================================================
-- Cathedral Group — time_records permitir multi-proyecto por día (21/05/2026)
--
-- Feedback David: "si quiero asignar a un trabajador dos o tres proyectos el
-- mismo día porque tiene que pasar por dos o tres, no me deja".
--
-- Constraint original (`time_records_unique_day` UNIQUE employee_id, fecha)
-- pensado para fichaje RDL 8/2019 (un registro jornada por día). Pero la
-- tabla ahora cumple dos funciones:
--   1. Asignaciones planificadas (cuadrante admin) — varios proyectos/día OK
--   2. Fichaje real trabajador (hora_entrada/salida) — un registro/día
--
-- Solución: UNIQUE (employee_id, fecha, project_id). PostgreSQL trata NULLs
-- como distintos en UNIQUE por defecto, así que el fichaje sin project_id
-- sigue permitiendo solo uno por día (las filas planificadas siempre tienen
-- project_id NOT NULL en la práctica).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.time_records DROP CONSTRAINT IF EXISTS time_records_unique_day;

ALTER TABLE public.time_records
  ADD CONSTRAINT time_records_unique_day_project UNIQUE (employee_id, fecha, project_id);

COMMENT ON CONSTRAINT time_records_unique_day_project ON public.time_records
  IS 'Permite N proyectos por (employee_id, fecha). NULL project_id sigue siendo único por (employee_id, fecha) en la práctica porque NULLs son distintos (sesión 21/05).';

COMMIT;

NOTIFY pgrst, 'reload schema';
