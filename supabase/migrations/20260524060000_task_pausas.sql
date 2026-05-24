-- ============================================================================
-- Cathedral Group — Pausas internas en tareas del Gantt (24/05/2026)
--
-- Feedback David: al partir una tarea, la continuación NO debe ir en otra fila;
-- la tarea sigue siendo UNA, con un hueco (pausa) en medio. Modelamos las
-- pausas dentro de la propia tarea (jsonb) y la barra se dibuja con segmentos
-- cortados en esas pausas (igual que en findes/festivos).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS pausas jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.project_tasks.pausas IS
  'Array de pausas [{desde,hasta}] (días sin trabajo dentro de la tarea). La barra se corta en estos rangos. Sesión 24/05.';

-- split_task v2: añade una pausa a la tarea y desplaza su fin (no crea tarea nueva)
-- (cambia el tipo de retorno uuid→void, requiere DROP previo)
DROP FUNCTION IF EXISTS public.split_task(uuid, date, date, date);
CREATE OR REPLACE FUNCTION public.split_task(
  p_task_id     uuid,
  p_pausa_desde date,
  p_pausa_hasta date,
  p_nuevo_fin   date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.project_tasks
  SET pausas = COALESCE(pausas, '[]'::jsonb) || jsonb_build_object('desde', p_pausa_desde, 'hasta', p_pausa_hasta),
      fecha_fin_plan = p_nuevo_fin,
      fecha_objetivo = p_nuevo_fin,
      updated_at = now()
  WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea % no encontrada', p_task_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.split_task(uuid, date, date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_task(uuid, date, date, date) TO service_role;

COMMENT ON FUNCTION public.split_task IS
  'Añade una pausa a una tarea y desplaza su fin. La tarea sigue en una fila; la barra se corta en la pausa. v2 sesión 24/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
