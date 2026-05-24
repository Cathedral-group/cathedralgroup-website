-- ============================================================================
-- Cathedral Group — Generación automática del Gantt desde el presupuesto
-- (24/05/2026)
--
-- Feedback David: "creas el presupuesto y se crea el diagrama solo". El Gantt
-- se autogenera agrupando las partidas por capítulo, en orden constructivo,
-- con duración según horas/trabajadores y fechas en cascada.
--
-- RPC transaccional replace_gantt_tasks: borra las tareas auto previas e
-- inserta las nuevas en una sola transacción (si el insert falla, rollback).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

-- Marcador de tareas generadas por el autogenerador (para poder regenerar)
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS gantt_auto boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.replace_gantt_tasks(p_project_id uuid, p_tasks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_count integer;
BEGIN
  SELECT company_id INTO v_company FROM public.projects WHERE id = p_project_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Proyecto % no encontrado', p_project_id;
  END IF;

  -- Borra las auto-generadas previas (no toca tareas manuales)
  DELETE FROM public.project_tasks
  WHERE project_id = p_project_id AND gantt_auto = true;

  -- Inserta las nuevas desde el jsonb
  INSERT INTO public.project_tasks
    (company_id, project_id, texto, estado, prioridad, subtipo, tipo,
     orden, fecha_inicio_plan, fecha_fin_plan, fecha_objetivo,
     created_source, gantt_auto)
  SELECT
    v_company, p_project_id,
    t->>'texto', 'pendiente', 'media', 'tarea', 'obra_presupuesto',
    (t->>'orden')::int, (t->>'fecha_inicio_plan')::date, (t->>'fecha_fin_plan')::date, (t->>'fecha_fin_plan')::date,
    'admin', true
  FROM jsonb_array_elements(p_tasks) AS t;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_gantt_tasks(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_gantt_tasks(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_gantt_tasks IS
  'Reemplaza atómicamente las tareas auto-generadas del Gantt de un proyecto (gantt_auto=true). No toca tareas manuales. Sesión 24/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
