-- ============================================================================
-- Cathedral Group — factura_forensic FK ON DELETE CASCADE (2026-05-21 sesión tarde)
--
-- Problema descubierto en test bulk upload:
--   factura_forensic.invoice_id NO tenía FK formal a invoices(id). Al hacer
--   DELETE FROM invoices durante test reset, factura_forensic quedaba con
--   149 rows huérfanos referenciando UUIDs que ya no existían.
--   UI /admin/revision mostraba conteos forensic incongruentes (157 forensic
--   vs 8 invoices reales).
--
-- Fix: añadir FK constraint con ON DELETE CASCADE. Cleanup huérfanos previos.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

-- Cleanup huérfanos previos (si existen tras esta migration corre fresh)
DELETE FROM public.factura_forensic
WHERE invoice_id NOT IN (SELECT id FROM public.invoices);

-- Add FK CASCADE (idempotente check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'factura_forensic'
      AND constraint_name = 'factura_forensic_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.factura_forensic
      ADD CONSTRAINT factura_forensic_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON CONSTRAINT factura_forensic_invoice_id_fkey ON public.factura_forensic
  IS 'FK CASCADE — cleanup automático cuando invoice borrada (sesión 21/05 fix)';

COMMIT;
