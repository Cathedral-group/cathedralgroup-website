-- Corrección modelo project_tasks tras feedback David:
--   "Las facturas extras son un flujo aparte. Lo que quiero es que las tareas
--    puedan ser del presupuesto aprobado, tareas nuevas de obra, o tareas para
--    los socios (gestión interna)."
--
-- Cambios:
--   - Quitar columnas es_facturable_extra + invoice_id (era un flujo equivocado)
--   - Añadir columna `tipo` con 3 valores: obra_presupuesto | obra_remate | interna_socio
--   - project_id pasa a NULLABLE (las tareas internas socio pueden no estar atadas a obra)
--   - Check constraint: solo interna_socio puede no tener project_id

-- 1. Quitar columnas del enfoque anterior
ALTER TABLE public.project_tasks
  DROP COLUMN IF EXISTS es_facturable_extra,
  DROP COLUMN IF EXISTS invoice_id;

-- 2. Añadir columna tipo (3 valores)
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'obra_remate'
    CHECK (tipo IN ('obra_presupuesto', 'obra_remate', 'interna_socio'));

COMMENT ON COLUMN public.project_tasks.tipo IS
  'obra_presupuesto: tarea del presupuesto aprobado. Al tacharla certifica % de su fase. '
  'obra_remate: tarea de obra añadida (no está en presupuesto, va en margen). '
  'interna_socio: gestión para socios admin (NO la ve el trabajador). project_id puede ser NULL.';

-- 3. Backfill: las que tienen phase_id → obra_presupuesto. Las demás → obra_remate
UPDATE public.project_tasks
SET tipo = CASE
  WHEN phase_id IS NOT NULL THEN 'obra_presupuesto'
  ELSE 'obra_remate'
END
WHERE tipo = 'obra_remate'; -- solo las recién insertadas con default

-- 4. Permitir project_id NULL (solo si tipo='interna_socio')
ALTER TABLE public.project_tasks
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_project_required;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_project_required CHECK (
    (tipo IN ('obra_presupuesto', 'obra_remate') AND project_id IS NOT NULL)
    OR
    (tipo = 'interna_socio')
  );

-- 5. Check: phase_id solo si tipo='obra_presupuesto'
ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_phase_only_for_presupuesto;

ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_phase_only_for_presupuesto CHECK (
    phase_id IS NULL OR tipo = 'obra_presupuesto'
  );

CREATE INDEX IF NOT EXISTS idx_project_tasks_tipo
  ON public.project_tasks (tipo, estado, fecha_objetivo)
  WHERE deleted_at IS NULL;

-- 6. Update vista calendar_events: añade tipo al payload de eventos task
CREATE OR REPLACE VIEW public.calendar_events AS
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
    jsonb_build_object('jornada_horas', wa.jornada_esperada_horas, 'notas', wa.notas) AS payload
  FROM worker_assignments wa
  LEFT JOIN employees e ON e.id = wa.employee_id
  LEFT JOIN projects p ON p.id = wa.project_id
  WHERE wa.deleted_at IS NULL

  UNION ALL

  SELECT
    d::date,
    ab.employee_id,
    e.nombre,
    NULL::uuid,
    NULL::text,
    NULL::text,
    'absence'::text,
    ab.id::text,
    ab.company_id,
    jsonb_build_object('tipo', ab.tipo, 'motivo', ab.motivo_detalle) AS payload
  FROM worker_absences ab
  LEFT JOIN employees e ON e.id = ab.employee_id
  CROSS JOIN LATERAL generate_series(ab.fecha_inicio, ab.fecha_fin, '1 day'::interval) d
  WHERE ab.deleted_at IS NULL AND ab.status = 'approved'

  UNION ALL

  SELECT
    t.fecha_objetivo,
    t.asignada_a,
    e.nombre,
    t.project_id,
    p.code,
    p.name,
    'task'::text,
    t.id::text,
    t.company_id,
    jsonb_build_object(
      'texto', t.texto,
      'estado', t.estado,
      'tipo', t.tipo,
      'phase_id', t.phase_id
    ) AS payload
  FROM project_tasks t
  LEFT JOIN employees e ON e.id = t.asignada_a
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.deleted_at IS NULL AND t.fecha_objetivo IS NOT NULL

  UNION ALL

  SELECT
    tr.fecha,
    tr.employee_id,
    e.nombre,
    tr.project_id,
    p.code,
    p.name,
    'time_record'::text,
    tr.id::text,
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

  SELECT
    h.fecha,
    NULL::uuid,
    NULL::text,
    NULL::uuid,
    NULL::text,
    NULL::text,
    'holiday'::text,
    h.id::text,
    h.company_id,
    jsonb_build_object('nombre', h.nombre, 'ambito', h.ambito) AS payload
  FROM holidays h;
