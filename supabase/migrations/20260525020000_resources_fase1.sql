-- Planificación de recursos — Fase 1 (aditiva, no rompe nada).
--
-- Crea una tabla unificada `resources` (patrón MS Project / Primavera P6):
--   - type='empleado': recurso ligado a un empleado de nómina (employee_id)
--   - type='externo': recurso placeholder "Trabajador 1..N" prestado por otra empresa,
--     sin nómina ni portal. Se asigna trabajo igual que a un empleado.
-- `employees` sigue siendo la fuente de verdad de RRHH/nómina; `resources` es la
-- identidad de PLANIFICACIÓN. Fases 2-3 (assignments + calendario unificado) van aparte.

CREATE TABLE IF NOT EXISTS resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  type          TEXT NOT NULL CHECK (type IN ('empleado','externo')),
  display_name  TEXT NOT NULL,
  employee_id   UUID REFERENCES employees(id) ON DELETE CASCADE,
  trade         TEXT,          -- oficio: encofrador, peón, fontanero...
  lent_by       TEXT,          -- empresa que presta el externo
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  -- un empleado tiene employee_id; un externo no
  CONSTRAINT resources_type_employee_ck CHECK (
    (type = 'empleado' AND employee_id IS NOT NULL) OR
    (type = 'externo'  AND employee_id IS NULL)
  )
);

-- Un único recurso vivo por empleado
CREATE UNIQUE INDEX IF NOT EXISTS uq_resources_employee
  ON resources (employee_id) WHERE employee_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_company
  ON resources (company_id) WHERE deleted_at IS NULL;

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE resources IS
  'Planificación Fase 1 — pool unificado de recursos asignables. type=empleado (FK employees) '
  'o type=externo (placeholder "Trabajador N", sin nómina). Multi-empresa RLS+FORCE patrón F2. '
  'employees = RRHH/nómina; resources = identidad de planificación.';

-- Backfill: 1 recurso por empleado activo (sin baja, sin borrar)
INSERT INTO resources (company_id, type, display_name, employee_id, trade, active)
SELECT e.company_id, 'empleado', e.nombre, e.id, e.categoria_profesional,
       (e.fecha_baja IS NULL)
FROM employees e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM resources r WHERE r.employee_id = e.id AND r.deleted_at IS NULL
  );

-- Placeholders externos iniciales "Trabajador 1..6" para Cathedral House Investment SL
INSERT INTO resources (company_id, type, display_name, active)
SELECT '00000000-0000-0000-0000-cca7ed1a1000', 'externo', 'Trabajador ' || g, TRUE
FROM generate_series(1, 6) AS g
WHERE NOT EXISTS (
  SELECT 1 FROM resources r
  WHERE r.type = 'externo' AND r.display_name = 'Trabajador ' || g AND r.deleted_at IS NULL
);

-- Sincronización employees → resources: alta crea recurso, baja/borrado lo desactiva.
CREATE OR REPLACE FUNCTION sync_employee_resource()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM resources r WHERE r.employee_id = NEW.id AND r.deleted_at IS NULL) THEN
      INSERT INTO resources (company_id, type, display_name, employee_id, trade, active)
      VALUES (NEW.company_id, 'empleado', NEW.nombre, NEW.id, NEW.categoria_profesional, (NEW.fecha_baja IS NULL));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE resources SET
      display_name = NEW.nombre,
      trade        = NEW.categoria_profesional,
      active       = (NEW.fecha_baja IS NULL AND NEW.deleted_at IS NULL),
      deleted_at   = NEW.deleted_at,
      updated_at   = NOW()
    WHERE employee_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_resource ON employees;
CREATE TRIGGER trg_sync_employee_resource
  AFTER INSERT OR UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION sync_employee_resource();

COMMENT ON FUNCTION sync_employee_resource IS
  'Mantiene resources en sync con employees: alta crea recurso empleado, baja/borrado lo desactiva.';
