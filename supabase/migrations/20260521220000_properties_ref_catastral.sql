-- ============================================================================
-- Cathedral Group — properties.referencia_catastral (2026-05-21 sesión Plan A)
--
-- Bug F2 confirmado: 41/41 docs no-invoices con property_id NULL post-OCR.
-- Auto-linker workflow necesita lookup properties por referencia_catastral
-- (Ley 13/1996 obligatoria para escrituras + licencias + seguros + notas
-- simples). Hoy properties NO tiene esa columna.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS referencia_catastral TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_ref_catastral
  ON public.properties(referencia_catastral)
  WHERE referencia_catastral IS NOT NULL;

COMMENT ON COLUMN public.properties.referencia_catastral
  IS 'Referencia catastral 20 caracteres (Ley 13/1996). Identificador único finca España. Usado por workflow auto-linker para vincular escrituras/licencias/seguros a property.';

COMMIT;

NOTIFY pgrst, 'reload schema';
