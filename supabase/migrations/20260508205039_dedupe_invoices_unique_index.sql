-- Sesión 8/05/2026 noche tarde — auditoría descubrió 17 grupos de duplicados
-- en invoices activas (mismo NIF normalizado + number + issue_date + direction).
-- Riesgo real: pagar facturas 2 veces (regla `feedback_duplicidad_documentos.md`).
--
-- Esta migration:
-- 1. Soft-delete los 17 duplicados manteniendo el más antiguo de cada grupo.
-- 2. Crea UNIQUE INDEX parcial preventivo para que el workflow no inserte más.
--
-- IDEMPOTENTE: el UPDATE solo afecta filas con duplicados pendientes; el INDEX
-- usa IF NOT EXISTS. Aplicar varias veces no causa daño.

-- 1. Soft-delete duplicados
WITH dups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY REGEXP_REPLACE(UPPER(supplier_nif), '[^A-Z0-9]', '', 'g'),
                   number,
                   issue_date,
                   direction
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM invoices
  WHERE deleted_at IS NULL
    AND supplier_nif IS NOT NULL
    AND number IS NOT NULL
    AND issue_date IS NOT NULL
)
UPDATE invoices i
SET
  deleted_at = NOW(),
  notes = COALESCE(notes || E'\n', '') ||
          '[SOFT-DELETE 2026-05-08 sesion 8/05 noche tarde] ' ||
          'Duplicado detectado en auditoria. Mantenida la mas antigua del grupo ' ||
          '(NIF normalizado + number + issue_date + direction). Recuperable.'
FROM dups d
WHERE i.id = d.id AND d.rn > 1;

-- 2. UNIQUE INDEX preventivo
-- Bloquea futuras INSERT de duplicados con la misma combinación clave.
-- Solo aplica a rows activas; soft-deleted no entran (deleted_at IS NULL en filter).
-- Normaliza NIF (UPPER + remove non-alphanumeric) para detectar variantes con/sin guiones.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_unique_active_dedup
ON invoices (
  REGEXP_REPLACE(UPPER(supplier_nif), '[^A-Z0-9]', '', 'g'),
  number,
  issue_date,
  direction
)
WHERE deleted_at IS NULL
  AND supplier_nif IS NOT NULL
  AND number IS NOT NULL
  AND issue_date IS NOT NULL;

-- 3. Comment en la columna para documentar la regla en el schema
COMMENT ON INDEX invoices_unique_active_dedup IS
  'Sesion 8/05/2026: previene duplicados en invoices activas por NIF (normalizado UPPER+regex) + number + issue_date + direction. Si el workflow intenta insertar duplicado, falla a nivel BD. Si llegara a darse, revisar Check Duplicado del workflow LWZWxjo9O5ku7tF7.';
