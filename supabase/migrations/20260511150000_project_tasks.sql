-- Lista de tareas por proyecto (to-do simple, conectado admin + portal trabajador)
--
-- David: 'tareas asignadas a cada proyecto. Que podamos ponerles el día.
-- En el calendario, click día → click proyecto → click tareas → marcar. Los
-- trabajadores las ven en su portal, pueden tacharlas e incluso añadir
-- nuevas. Todos vemos lo mismo.'
--
-- Modelo:
--   - 1 tabla project_tasks
--   - Si fecha_objetivo está rellena: aparece en el calendario ese día
--   - Si asignada_a está rellena: aparece en el portal del trabajador
--   - Si ambas null: vive sólo en la ficha del proyecto
--   - estado: pendiente / hecha (tachable)

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  texto TEXT NOT NULL,
  notas TEXT,

  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'hecha')),
  prioridad TEXT NOT NULL DEFAULT 'media'
    CHECK (prioridad IN ('baja', 'media', 'alta')),

  -- Si está, la tarea aparece ese día en el calendario admin
  fecha_objetivo DATE,

  -- Si está, la tarea aparece en el portal de ese trabajador
  asignada_a UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Quién la creó (admin o trabajador via portal)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  created_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_source TEXT NOT NULL DEFAULT 'admin'
    CHECK (created_source IN ('admin', 'portal')),

  -- Quién la completó
  completed_at TIMESTAMPTZ,
  completed_by_email TEXT,
  completed_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project
  ON public.project_tasks (project_id, estado, fecha_objetivo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned
  ON public.project_tasks (asignada_a, estado, fecha_objetivo DESC)
  WHERE deleted_at IS NULL AND asignada_a IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_calendar
  ON public.project_tasks (company_id, fecha_objetivo, estado)
  WHERE deleted_at IS NULL AND fecha_objetivo IS NOT NULL;

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.project_tasks IS
  'To-do list por proyecto. Conectado admin (ficha proyecto + calendario) + '
  'portal trabajador (Mis tareas). Una sola fuente de verdad — tachar en '
  'cualquier sitio se refleja en los demás.';

COMMENT ON COLUMN public.project_tasks.fecha_objetivo IS
  'Si está rellena, la tarea aparece en el calendario admin ese día. '
  'Si null, vive sólo en la ficha del proyecto.';

COMMENT ON COLUMN public.project_tasks.asignada_a IS
  'Si está rellena, la tarea aparece en el portal del trabajador asignado. '
  'Si null, está pendiente de asignar (sólo admin la ve).';
