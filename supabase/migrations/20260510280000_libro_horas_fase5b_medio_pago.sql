-- Roadmap libro de horas — Fase 5b (medio de pago en gastos)
--
-- David explica modelo operativo Rafael (10/05/2026 noche):
-- - Tarjeta empresa llega esta semana → será el medio default
-- - Bolsillo personal solo cuando la tarjeta falle (minoritario)
-- - Coche empresa cuando se compre → para combustible/peajes
--
-- Cambios:
--   1. worker_expense_items.medio_pago con default 'tarjeta_empresa' (refleja caso Rafael)
--   2. Trigger que auto-confirma gastos pagados con tarjeta_empresa o coche_empresa
--      (no requieren reembolso, solo conciliación con extracto bancario)
--   3. Vehicle ref opcional para coche_empresa (FK a flota_vehiculos)

ALTER TABLE worker_expense_items
  ADD COLUMN IF NOT EXISTS medio_pago TEXT NOT NULL DEFAULT 'tarjeta_empresa'
    CHECK (medio_pago IN ('bolsillo_personal', 'tarjeta_empresa', 'coche_empresa', 'efectivo_caja_obra')),
  ADD COLUMN IF NOT EXISTS vehiculo_id UUID; -- FK opcional cuando exista flota

COMMENT ON COLUMN worker_expense_items.medio_pago IS
  'Cómo pagó el trabajador. tarjeta_empresa/coche_empresa NO requieren reembolso '
  '(auto-confirmed). bolsillo_personal sigue flujo pending→confirmed→reimbursed.';

COMMENT ON COLUMN worker_expense_items.vehiculo_id IS
  'FK opcional a flota_vehiculos (cuando exista). Para gastos coche_empresa: '
  'combustible, peajes, aparcamiento del coche de Cathedral.';

-- Trigger: auto-confirmar al crear si medio = tarjeta/coche empresa
CREATE OR REPLACE FUNCTION auto_confirm_expense_if_company_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.medio_pago IN ('tarjeta_empresa', 'coche_empresa') AND NEW.status = 'pending' THEN
    NEW.status := 'confirmed';
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, NOW());
    NEW.reviewed_by_email := COALESCE(NEW.reviewed_by_email, 'auto:' || NEW.medio_pago);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_confirm_expense ON worker_expense_items;
CREATE TRIGGER trigger_auto_confirm_expense
  BEFORE INSERT OR UPDATE OF medio_pago, status ON worker_expense_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_confirm_expense_if_company_paid();

COMMENT ON FUNCTION auto_confirm_expense_if_company_paid IS
  'Auto-confirma gastos pagados con tarjeta o coche empresa. No requieren '
  'reembolso al trabajador, solo conciliación bancaria por el admin.';

-- Índice útil para filtros admin (qué hay que reembolsar vs qué conciliar)
CREATE INDEX IF NOT EXISTS idx_worker_expense_medio_status
  ON worker_expense_items (company_id, medio_pago, status, fecha DESC)
  WHERE deleted_at IS NULL;
