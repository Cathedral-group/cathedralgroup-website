-- Planificación Fase 2 (paso 1): worker_assignments puede referir a un `resource`
-- (empleado O externo), no solo a un empleado. Aditivo, no rompe el cuadrante actual.
--
-- Modelo: el Gantt de la obra es la fuente principal. Asignar un recurso a la obra
-- crea worker_assignments (resource_id + project_id + fecha) para los días laborables
-- del rango planificado → así el cuadrante y el calendario se rellenan solos.

ALTER TABLE worker_assignments
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id);

-- Los externos no tienen empleado: employee_id deja de ser obligatorio.
ALTER TABLE worker_assignments
  ALTER COLUMN employee_id DROP NOT NULL;

-- Backfill: asignaciones existentes (de empleados) apuntan a su recurso.
UPDATE worker_assignments wa
SET resource_id = r.id
FROM resources r
WHERE r.employee_id = wa.employee_id AND r.deleted_at IS NULL AND wa.resource_id IS NULL;

-- Un recurso, una asignación por día (equivalente al unique de employee_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_assignments_resource_day
  ON worker_assignments (resource_id, fecha)
  WHERE resource_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_worker_assignments_resource
  ON worker_assignments (resource_id, fecha DESC)
  WHERE deleted_at IS NULL AND resource_id IS NOT NULL;

COMMENT ON COLUMN worker_assignments.resource_id IS
  'Recurso asignado (empleado o externo). Sustituye progresivamente a employee_id. '
  'employee_id se mantiene para el portal trabajador (prefill por empleado).';
