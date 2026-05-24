-- ============================================================================
-- Cathedral Group — Modelo de segmentos para el Gantt (24/05/2026)
--
-- Reemplaza el modelo de "pausas que desplazan el fin" (defectuoso: contaba
-- findes dos veces, cortes no limpios) por SEGMENTOS de trabajo explícitos,
-- como hacen dhtmlx-gantt / MS Project. Cada tarea tiene un array de bloques
-- [{inicio,fin}]; los huecos entre bloques SON las pausas (no se modelan).
-- fecha_inicio_plan/fin pasan a ser min/max derivados de los segmentos.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS segmentos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.project_tasks.segmentos IS
  'Array de bloques de trabajo [{inicio,fin}]. Cada bloque = una barra; los huecos entre bloques son las pausas. fecha_inicio_plan/fin = min/max derivados. Sesión 24/05.';

-- Inicializa segmentos desde fecha_inicio/fin para tareas existentes
UPDATE public.project_tasks
SET segmentos = jsonb_build_array(jsonb_build_object('inicio', fecha_inicio_plan, 'fin', fecha_fin_plan))
WHERE fecha_inicio_plan IS NOT NULL AND fecha_fin_plan IS NOT NULL
  AND (segmentos IS NULL OR jsonb_array_length(segmentos) = 0);

-- RPC: reemplaza los segmentos de una tarea y recalcula inicio/fin (min/max)
CREATE OR REPLACE FUNCTION public.update_task_segments(p_task_id uuid, p_segmentos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min date;
  v_max date;
BEGIN
  SELECT min((s->>'inicio')::date), max((s->>'fin')::date)
    INTO v_min, v_max
    FROM jsonb_array_elements(p_segmentos) s;
  IF v_min IS NULL THEN
    RAISE EXCEPTION 'Se requiere al menos un segmento';
  END IF;
  UPDATE public.project_tasks
  SET segmentos = p_segmentos,
      fecha_inicio_plan = v_min,
      fecha_fin_plan = v_max,
      fecha_objetivo = v_max,
      updated_at = now()
  WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea % no encontrada', p_task_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_task_segments(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_segments(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.update_task_segments IS
  'Reemplaza segmentos de una tarea y recalcula fecha_inicio_plan/fin (min/max). Toda edición del Gantt (mover/redimensionar/partir/fusionar) manda el array completo. Sesión 24/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
