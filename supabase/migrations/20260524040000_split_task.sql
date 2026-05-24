-- ============================================================================
-- Cathedral Group — Partir tarea del Gantt (24/05/2026)
--
-- Feedback David: si saca trabajadores de una obra unos días, necesita "romper
-- la barra por el medio" y que el resto del trabajo continúe después del hueco.
--
-- split_task: acorta la tarea original hasta el corte e inserta una tarea
-- "(cont.)" con los días restantes, en una sola transacción (atómico).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE OR REPLACE FUNCTION public.split_task(
  p_task_id     uuid,
  p_fin_primera date,
  p_ini_nueva   date,
  p_fin_nueva   date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig public.project_tasks%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_orig FROM public.project_tasks
  WHERE id = p_task_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea % no encontrada', p_task_id;
  END IF;

  UPDATE public.project_tasks
  SET fecha_fin_plan = p_fin_primera, fecha_objetivo = p_fin_primera, updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO public.project_tasks (
    company_id, project_id, texto, estado, prioridad, tipo, subtipo,
    asignada_a, phase_id, orden, fecha_inicio_plan, fecha_fin_plan, fecha_objetivo,
    parent_task_id, gantt_auto, created_source
  ) VALUES (
    v_orig.company_id, v_orig.project_id, v_orig.texto || ' (cont.)',
    v_orig.estado, v_orig.prioridad, v_orig.tipo, v_orig.subtipo,
    v_orig.asignada_a, v_orig.phase_id, v_orig.orden,
    p_ini_nueva, p_fin_nueva, p_fin_nueva,
    p_task_id, false, 'admin'
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.split_task(uuid, date, date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_task(uuid, date, date, date) TO service_role;

COMMENT ON FUNCTION public.split_task IS
  'Parte una tarea del Gantt en dos (original acortada + "(cont.)" con el resto). Atómico. Sesión 24/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
