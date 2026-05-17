-- employee_project_authorizations: mapping workers → projects autorizados
-- Defensive: workers solo pueden subir worker_attachments a proyectos autorizados explícitamente
-- Cathedral pattern: company_id NOT NULL + RLS+FORCE + GRANT explicit

CREATE TABLE IF NOT EXISTS public.employee_project_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  granted_by_email text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_by_email text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: una autorización activa por (employee, project)
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_project_authorizations_active
  ON public.employee_project_authorizations (employee_id, project_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.employee_project_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_project_authorizations FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='service_role_full_access' AND polrelid='public.employee_project_authorizations'::regclass) THEN
    CREATE POLICY "service_role_full_access" ON public.employee_project_authorizations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.employee_project_authorizations TO service_role;
GRANT SELECT ON public.employee_project_authorizations TO authenticated;
