-- ============================================================================
-- Cathedral Group — Tareas + Reuniones multi-attendees (21/05/2026 noche)
--
-- Feedback David: "añadimos tareas socios y trabajadores. Los socios además
-- tienen reuniones. Reuniones a varios socios a la vez. Trabajador marca
-- hecha, admin ve panel sin notificación."
--
-- 1) Extender project_tasks: hora_inicio, hora_fin, subtipo (tarea|reunion)
-- 2) Tabla nueva task_attendees: pivot N:N. Una fila por attendee.
--    Socio (user_id auth) XOR Trabajador (employee_id). Cada attendee tiene
--    su propio estado pendiente|hecho → trabajador marca su parte sin afectar
--    al resto.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- ─── 1. Extender project_tasks ────────────────────────────────────────────

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fin    time,
  ADD COLUMN IF NOT EXISTS subtipo     text NOT NULL DEFAULT 'tarea';

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_subtipo_check;
ALTER TABLE public.project_tasks
  ADD  CONSTRAINT project_tasks_subtipo_check
  CHECK (subtipo IN ('tarea','reunion'));

COMMENT ON COLUMN public.project_tasks.hora_inicio IS 'Hora inicio (HH:MM). NULL = tarea sin hora del día.';
COMMENT ON COLUMN public.project_tasks.hora_fin    IS 'Hora fin reuniones con duración. NULL en tareas simples.';
COMMENT ON COLUMN public.project_tasks.subtipo     IS 'tarea | reunion. Reunión renderiza con 🤝, tarea con 📋.';

-- ─── 2. Tabla task_attendees ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_attendees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  socio_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','hecho','rechazado')),
  completed_at    timestamptz,
  completed_by_email text,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Exactamente uno: socio O trabajador (no ambos, no ninguno)
  CONSTRAINT task_attendees_one_target_chk
    CHECK ((socio_user_id IS NOT NULL)::int + (employee_id IS NOT NULL)::int = 1),

  -- No duplicar attendee mismo task
  CONSTRAINT task_attendees_unique_socio   UNIQUE (task_id, socio_user_id),
  CONSTRAINT task_attendees_unique_worker  UNIQUE (task_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_task_attendees_task    ON public.task_attendees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attendees_socio   ON public.task_attendees(socio_user_id) WHERE socio_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_attendees_worker  ON public.task_attendees(employee_id)   WHERE employee_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_attendees_pending ON public.task_attendees(task_id, estado) WHERE estado = 'pendiente';

ALTER TABLE public.task_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attendees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_attendees_service_all ON public.task_attendees;
CREATE POLICY task_attendees_service_all
  ON public.task_attendees
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.task_attendees IS
  'Pivot N:N entre project_tasks y socios/trabajadores. Cada attendee mantiene su propio estado. Reuniones admiten múltiples socios. Tareas a múltiples trabajadores. Sesión 21/05.';

COMMIT;

NOTIFY pgrst, 'reload schema';
