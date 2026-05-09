-- Bug fix sesión 10/05 madrugada (auditoría profunda):
-- El UNIQUE INDEX `invoices_unique_active_dedup` no incluye `doc_type` ni `amount_total`.
-- Consecuencia: rectificativas legítimas con mismo NIF + número + fecha + direction
-- pero importes opuestos chocan con el constraint, fallando el INSERT.
--
-- Fix:
-- 1. DROP el índice viejo
-- 2. CREATE índice nuevo añadiendo `doc_type` (distingue rectificativa/abono/factura)
--    y `ROUND(amount_total, 2)` (distingue importes distintos con tolerancia céntimos)
-- 3. NO afecta a duplicados ya bloqueados anteriormente (rectificativas tendrían
--    distinto doc_type que su original)

-- 1. Drop índice viejo
DROP INDEX IF EXISTS invoices_unique_active_dedup;

-- 2. Recrear con doc_type + amount_total
CREATE UNIQUE INDEX IF NOT EXISTS invoices_unique_active_dedup
ON invoices (
  REGEXP_REPLACE(UPPER(supplier_nif), '[^A-Z0-9]', '', 'g'),
  number,
  issue_date,
  direction,
  doc_type,
  ROUND(COALESCE(amount_total, 0)::numeric, 2)
)
WHERE deleted_at IS NULL
  AND supplier_nif IS NOT NULL
  AND number IS NOT NULL
  AND issue_date IS NOT NULL;

COMMENT ON INDEX invoices_unique_active_dedup IS
  'Sesión 10/05/2026 (post-auditoría profunda): añadidos doc_type + ROUND(amount_total, 2) al UNIQUE para no bloquear rectificativas legítimas con mismo NIF/número/fecha pero importes distintos. Tolerancia céntimo (ROUND a 2 decimales).';
