-- Bloque A — Preparar terreno para Calendario + Tareas conectadas + certificación automática
--
-- Decisiones de los 3 eruditos auditores (UX + data + dominio):
--   1. Mantener project_phases SEPARADA de project_tasks (fase = contable, tarea = operativa)
--   2. Añadir phase_id NULLABLE en project_tasks (tarea opcional dentro de una fase)
--   3. Añadir es_facturable_extra + invoice_id para tareas extras que se facturan después
--   4. Añadir estado 'en_curso' (no solo pendiente/hecha)
--   5. Vista materializada calendar_day_view para queries del calendario admin
--   6. Índices faltantes para que el calendario semanal sea rápido

-- 1. Ampliar project_tasks
ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_estado_check;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_estado_check
  CHECK (estado IN ('pendiente', 'en_curso', 'hecha'));

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_facturable_extra BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.project_tasks.phase_id IS
  'Si está, la tarea pertenece a una fase del presupuesto y cuenta para su % de certificación. '
  'NULL = tarea extra (no está en presupuesto, suele ser remate o trabajo añadido).';
COMMENT ON COLUMN public.project_tasks.es_facturable_extra IS
  'Marca una tarea EXTRA (sin phase) como facturable. Al completarla, el admin recibe aviso de '
  'crear factura extra. invoice_id se rellena cuando se factura.';

CREATE INDEX IF NOT EXISTS idx_project_tasks_phase
  ON public.project_tasks (phase_id, estado)
  WHERE deleted_at IS NULL AND phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_extra_facturable
  ON public.project_tasks (project_id)
  WHERE deleted_at IS NULL AND es_facturable_extra = TRUE AND invoice_id IS NULL;

-- 2. RPC para calcular % de certificación de una fase (tareas hechas / total)
CREATE OR REPLACE FUNCTION public.get_phase_progress(p_phase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_hechas INT := 0;
  v_en_curso INT := 0;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE estado != 'cancelled'),
    COUNT(*) FILTER (WHERE estado = 'hecha'),
    COUNT(*) FILTER (WHERE estado = 'en_curso')
  INTO v_total, v_hechas, v_en_curso
  FROM project_tasks
  WHERE phase_id = p_phase_id AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'phase_id', p_phase_id,
    'total', v_total,
    'hechas', v_hechas,
    'en_curso', v_en_curso,
    'pct', CASE WHEN v_total > 0 THEN ROUND((v_hechas::numeric / v_total) * 100, 1) ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION public.get_phase_progress IS
  'Progreso de una fase calculado desde sus project_tasks: hechas/total. '
  'Devuelve 0% si la fase no tiene tareas (modo legacy: status manual).';

GRANT EXECUTE ON FUNCTION public.get_phase_progress(UUID) TO service_role;

-- 3. RPC bulk: progreso de todas las fases de un proyecto en una query
CREATE OR REPLACE FUNCTION public.get_project_phases_with_progress(p_project_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH phase_stats AS (
    SELECT
      ph.id,
      ph.name,
      ph.status AS legacy_status,
      ph.start_date,
      ph.end_date,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) AS total_tareas,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.estado = 'hecha') AS hechas,
      COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL AND t.estado = 'en_curso') AS en_curso
    FROM project_phases ph
    LEFT JOIN project_tasks t ON t.phase_id = ph.id
    WHERE ph.project_id = p_project_id
    GROUP BY ph.id, ph.name, ph.status, ph.start_date, ph.end_date
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'legacy_status', legacy_status,
    'start_date', start_date,
    'end_date', end_date,
    'total_tareas', total_tareas,
    'hechas', hechas,
    'en_curso', en_curso,
    'pct', CASE WHEN total_tareas > 0 THEN ROUND((hechas::numeric / total_tareas) * 100, 1) ELSE 0 END
  ) ORDER BY start_date NULLS LAST, name)
  INTO v_result
  FROM phase_stats;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_phases_with_progress(UUID) TO service_role;

-- 4. Índices que faltan para el calendario semanal
CREATE INDEX IF NOT EXISTS idx_worker_assignments_fecha_emp
  ON public.worker_assignments (fecha, employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_records_fecha_emp
  ON public.time_records (fecha, employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_holidays_fecha
  ON public.holidays (fecha);

-- 5. Vista materializada calendar_day_view — fuente única de "qué pasa el día X"
-- NOTE: la refrescamos manualmente cada vez que cambia algo relevante (trigger),
-- o vía cron 5min. Para Cathedral (10 personas), refrescar bajo demanda es suficiente.
-- Por ahora la creamos como vista normal (no materializada) — si crece el volumen
-- la convertimos a materializada con índices.
CREATE OR REPLACE VIEW public.calendar_events AS
  -- Asignaciones del cuadrante (lo que se espera)
  SELECT
    wa.fecha,
    wa.employee_id,
    e.nombre AS employee_nombre,
    wa.project_id,
    p.code AS project_code,
    p.name AS project_name,
    'assignment'::text AS event_type,
    wa.id::text AS ref_id,
    wa.company_id,
    jsonb_build_object(
      'jornada_horas', wa.jornada_esperada_horas,
      'notas', wa.notas
    ) AS payload
  FROM worker_assignments wa
  LEFT JOIN employees e ON e.id = wa.employee_id
  LEFT JOIN projects p ON p.id = wa.project_id
  WHERE wa.deleted_at IS NULL

  UNION ALL

  -- Ausencias aprobadas (días que el trabajador NO va a trabajar)
  SELECT
    d::date AS fecha,
    ab.employee_id,
    e.nombre AS employee_nombre,
    NULL::uuid AS project_id,
    NULL::text AS project_code,
    NULL::text AS project_name,
    'absence'::text AS event_type,
    ab.id::text AS ref_id,
    ab.company_id,
    jsonb_build_object('tipo', ab.tipo, 'motivo', ab.motivo_detalle) AS payload
  FROM worker_absences ab
  LEFT JOIN employees e ON e.id = ab.employee_id
  CROSS JOIN LATERAL generate_series(ab.fecha_inicio, ab.fecha_fin, '1 day'::interval) d
  WHERE ab.deleted_at IS NULL AND ab.status = 'approved'

  UNION ALL

  -- Tareas con fecha (las extras + las atadas a fase, todas con fecha_objetivo)
  SELECT
    t.fecha_objetivo AS fecha,
    t.asignada_a AS employee_id,
    e.nombre AS employee_nombre,
    t.project_id,
    p.code AS project_code,
    p.name AS project_name,
    'task'::text AS event_type,
    t.id::text AS ref_id,
    t.company_id,
    jsonb_build_object(
      'texto', t.texto,
      'estado', t.estado,
      'es_extra', t.phase_id IS NULL,
      'phase_id', t.phase_id
    ) AS payload
  FROM project_tasks t
  LEFT JOIN employees e ON e.id = t.asignada_a
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.deleted_at IS NULL AND t.fecha_objetivo IS NOT NULL

  UNION ALL

  -- Fichajes reales (lo que de verdad pasó)
  SELECT
    tr.fecha,
    tr.employee_id,
    e.nombre AS employee_nombre,
    tr.project_id,
    p.code AS project_code,
    p.name AS project_name,
    'time_record'::text AS event_type,
    tr.id::text AS ref_id,
    tr.company_id,
    jsonb_build_object(
      'hora_entrada', tr.hora_entrada,
      'hora_salida', tr.hora_salida,
      'horas_ordinarias', tr.horas_ordinarias,
      'horas_extra', tr.horas_extra,
      'geofence_entrada', tr.entrada_geofence_status,
      'geofence_salida', tr.salida_geofence_status
    ) AS payload
  FROM time_records tr
  LEFT JOIN employees e ON e.id = tr.employee_id
  LEFT JOIN projects p ON p.id = tr.project_id
  WHERE tr.deleted_at IS NULL

  UNION ALL

  -- Festivos (sin employee/project; se aplican a toda la empresa o ámbito)
  SELECT
    h.fecha,
    NULL::uuid AS employee_id,
    NULL::text AS employee_nombre,
    NULL::uuid AS project_id,
    NULL::text AS project_code,
    NULL::text AS project_name,
    'holiday'::text AS event_type,
    h.id::text AS ref_id,
    h.company_id,
    jsonb_build_object('nombre', h.nombre, 'ambito', h.ambito) AS payload
  FROM holidays h;

COMMENT ON VIEW public.calendar_events IS
  'Eventos del calendario admin: assignment + absence + task + time_record + holiday. '
  'Una query, una fuente de verdad. Filtrar por company_id + fecha BETWEEN.';
