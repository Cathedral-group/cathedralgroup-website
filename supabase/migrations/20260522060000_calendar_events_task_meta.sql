-- ============================================================================
-- Cathedral Group — calendar_events: exponer subtipo/hora/attendees (21/05)
--
-- La rama 'task' de la view ahora incluye subtipo (tarea|reunion), hora_inicio,
-- hora_fin y el array de attendees (socios + trabajadores con su estado).
-- Resto de ramas sin cambios. CREATE OR REPLACE conserva firma de columnas.
--
-- Validado doc-validator: LATERAL (evita N+1), cast time::text para JSON
-- determinista, COALESCE jsonb_agg → '[]'. Índice idx_task_attendees_task ya
-- existe (migración 20260522040000).
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

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

  -- Tareas / reuniones con fecha (incluye subtipo, hora y attendees)
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
      'phase_id', t.phase_id,
      'subtipo', t.subtipo,
      'hora_inicio', t.hora_inicio::text,
      'hora_fin', t.hora_fin::text,
      'attendees', att.attendees
    ) AS payload
  FROM project_tasks t
  LEFT JOIN employees e ON e.id = t.asignada_a
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tipo', CASE WHEN ta.socio_user_id IS NOT NULL THEN 'socio' ELSE 'trabajador' END,
      'nombre', COALESCE(au.email, emp.nombre),
      'estado', ta.estado
    )), '[]'::jsonb) AS attendees
    FROM task_attendees ta
    LEFT JOIN auth.users au ON au.id = ta.socio_user_id
    LEFT JOIN employees emp ON emp.id = ta.employee_id
    WHERE ta.task_id = t.id
  ) att ON true
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

COMMIT;

NOTIFY pgrst, 'reload schema';
