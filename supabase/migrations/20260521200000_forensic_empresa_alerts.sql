-- ============================================================================
-- Cathedral Group — factura_forensic empresa_alerts (2026-05-21 sesión tarde)
--
-- Problema (test bulk upload hoy):
--   Forensic.score=100 en facturas personales (DNI receptor) o emitidas a
--   empresa distinta a Cathedral B19761915. Forensic actual solo evalúa
--   fraude PDF (EOFs, metadata, firma) — NO valida que la factura sea
--   operativamente válida para Cathedral.
--
-- Fix: añadir columna empresa_alerts + trigger BEFORE INSERT/UPDATE que
-- recalcula score considerando NIF receptor vs Cathedral group CIFs.
--
-- Validator confirmó 4 correcciones obligatorias:
--   1. COALESCE(array_length, 0) — array_length(NULL,1)=NULL bug score
--   2. cathedral_cifs desde tabla companies (multi-SL, no hardcoded)
--   3. IF NOT FOUND guard race condition INSERT paralelo
--   4. Índice GIN en empresa_alerts para query overlap operator
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Columna empresa_alerts
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.factura_forensic
  ADD COLUMN IF NOT EXISTS empresa_alerts TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.factura_forensic.empresa_alerts
  IS 'Alertas relacionadas con NIF receptor vs Cathedral group. Valores: NIF_RECEPTOR_VACIO, NIF_RECEPTOR_PERSONAL, NIF_RECEPTOR_OTRA_EMPRESA, NIF_RECEPTOR_INVALIDO. Disparado por trigger trg_forensic_recalc.';

-- ─────────────────────────────────────────────────────────────────────────
-- Función: recalcula score considerando empresa_alerts + alerts existentes
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recalc_forensic_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_score INT := 100;
  v_invoice RECORD;
  cathedral_cifs TEXT[];
  raw_nif TEXT;
BEGIN
  -- Cargar CIFs Cathedral group (multi-SL: Cathedral House Investment + futuras SL)
  SELECT array_agg(cif) INTO cathedral_cifs
  FROM public.companies
  WHERE cif IS NOT NULL AND deleted_at IS NULL;

  IF cathedral_cifs IS NULL OR array_length(cathedral_cifs, 1) IS NULL THEN
    cathedral_cifs := ARRAY['B19761915']; -- fallback Cathedral House Investment SL
  END IF;

  -- Lookup invoice receptor data
  SELECT nif_receptor, direction INTO v_invoice
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF NOT FOUND THEN
    -- Race condition: forensic insertado antes que invoice visible. Diferir.
    NEW.empresa_alerts := ARRAY['INVOICE_NOT_FOUND: lookup diferido (race condition workflow)'];
    NEW.score := 50;
    RETURN NEW;
  END IF;

  -- Reset empresa_alerts en cada recálculo
  NEW.empresa_alerts := '{}';

  -- Solo aplica a facturas RECIBIDAS (en emitidas Cathedral es emisor)
  IF v_invoice.direction = 'recibida' THEN
    raw_nif := upper(coalesce(v_invoice.nif_receptor, ''));
    raw_nif := regexp_replace(raw_nif, '[-\s]', '', 'g');

    IF raw_nif = '' THEN
      NEW.empresa_alerts := array_append(NEW.empresa_alerts, 'NIF_RECEPTOR_VACIO: Factura sin NIF receptor identificable');
      base_score := base_score - 10;
    ELSIF NOT (raw_nif = ANY(cathedral_cifs)) THEN
      IF raw_nif ~ '^[0-9]{8}[A-Z]$' THEN
        NEW.empresa_alerts := array_append(NEW.empresa_alerts, 'NIF_RECEPTOR_PERSONAL: DNI ' || raw_nif || ' (factura a particular, NO Cathedral)');
        base_score := base_score - 30;
      ELSIF raw_nif ~ '^[A-Z][0-9]{8}$' THEN
        NEW.empresa_alerts := array_append(NEW.empresa_alerts, 'NIF_RECEPTOR_OTRA_EMPRESA: CIF ' || raw_nif || ' distinto a Cathedral group');
        base_score := base_score - 30;
      ELSE
        NEW.empresa_alerts := array_append(NEW.empresa_alerts, 'NIF_RECEPTOR_INVALIDO: ' || raw_nif || ' no es NIF/CIF español válido');
        base_score := base_score - 20;
      END IF;
    END IF;
  END IF;

  -- Descontar por otras alerts existentes (con COALESCE para evitar NULL bug)
  base_score := base_score - (COALESCE(array_length(NEW.pdf_alerts, 1), 0) * 5);
  base_score := base_score - (COALESCE(array_length(NEW.email_alerts, 1), 0) * 5);
  base_score := base_score - (COALESCE(array_length(NEW.numeracion_alerts, 1), 0) * 10);
  base_score := base_score - (COALESCE(array_length(NEW.duplicados_alerts, 1), 0) * 15);

  NEW.score := GREATEST(0, LEAST(100, base_score));
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_recalc_forensic_score
  IS 'Recalcula factura_forensic.score considerando pdf+email+numeracion+duplicados+empresa alerts. Multi-SL aware via companies.cif_nif lookup.';

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger BEFORE INSERT/UPDATE
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_forensic_recalc ON public.factura_forensic;
CREATE TRIGGER trg_forensic_recalc
  BEFORE INSERT OR UPDATE ON public.factura_forensic
  FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_forensic_score();

-- ─────────────────────────────────────────────────────────────────────────
-- Índice GIN para query overlap operator (UI filtra forensic por tipo alerta)
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_forensic_empresa_alerts
  ON public.factura_forensic USING GIN (empresa_alerts);

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill rows existentes (trigger BEFORE UPDATE recalcula automático)
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.factura_forensic SET reviewed_at = reviewed_at WHERE empresa_alerts = '{}';

COMMIT;
