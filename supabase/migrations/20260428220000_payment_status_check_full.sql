-- B9 (sesión 27, 28/04/2026): ampliar CHECK constraint invoices.payment_status
-- Añadir 'cobrada' que se necesita para facturas EMITIDAS (cuando cliente paga).
-- El CHECK previo solo tenía: pendiente, pagada, vencida, parcial, cancelada.
-- Bug: la UI RevisionView mostraba 'cobrada' pero al guardar fallaba por CHECK.

-- Drop constraint si existe (nombre Postgres por defecto: <table>_<col>_check)
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check
  CHECK (payment_status IN ('pendiente','pagada','cobrada','vencida','parcial','cancelada'));

COMMENT ON COLUMN public.invoices.payment_status IS
  'pendiente | pagada (factura recibida pagada al proveedor) | cobrada (factura emitida cobrada del cliente) | vencida | parcial | cancelada';
