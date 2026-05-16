-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Smart Dedup columns + manually_edited trigger
-- Date: 2026-05-17 (sesión post-cutover Plan A 100%)
-- Author: Cathedral / Claude
-- ────────────────────────────────────────────────────────────────────────────
-- Context: tras incidente UFW dropeando container→pdf2img (15/05 → 16/05),
-- 18 facturas BD con ai_confidence=0.2 y campos estructurados null. Para
-- self-heal automático + protección trabajo manual, añadir gating columns
-- al dedup pattern.
--
-- Refs:
--   - docs/adr/0008-cutover-workflow-general-deferido.md (Plan A 100%)
--   - cathedral-pendiente.md (sesión 17/05 Smart dedup design)
--   - Research industry: Stampli/Coupa/Brex/Rossum/Mindee (threshold 0.75,
--     manually_edited flag explícito, cap reprocess_attempts)
--   - Refutación doc-validator: documents NO tiene review_status — solo
--     invoices + quotes reciben columnas
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── INVOICES ─────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reprocess_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reprocess_at timestamptz;

COMMENT ON COLUMN public.invoices.manually_edited IS
  'TRUE si humano editó row desde admin UI. Set por trigger BD ante UPDATE de role authenticated. Smart dedup respeta este flag (no reprocesa).';
COMMENT ON COLUMN public.invoices.reprocess_attempts IS
  'Contador intentos OCR. Smart dedup cap a 3 para anti-loop. Reset NULL → 0 al volver a aceptar reproceso post-éxito.';
COMMENT ON COLUMN public.invoices.last_reprocess_at IS
  'Timestamp último reproceso vía Smart dedup. NULL si nunca reprocesado.';

-- ─── QUOTES ──────────────────────────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reprocess_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reprocess_at timestamptz;

COMMENT ON COLUMN public.quotes.manually_edited IS
  'Idéntico a invoices.manually_edited. Smart dedup gate.';
COMMENT ON COLUMN public.quotes.reprocess_attempts IS
  'Idéntico a invoices.reprocess_attempts.';
COMMENT ON COLUMN public.quotes.last_reprocess_at IS
  'Idéntico a invoices.last_reprocess_at.';

-- ─── Trigger function: marca manually_edited=true en UPDATE desde admin UI ─
-- Detecta role authenticated (admin UI con JWT) vs service_role (workflow n8n).
-- service_role bypassa este trigger porque request.jwt.claims tiene
-- 'role'='service_role' (verificado: Supabase Postgres incluye los claims
-- del JWT en request.jwt.claims via PostgREST). Si current_setting falla
-- (e.g. CLI psql directo), default no marca — comportamiento conservador.
CREATE OR REPLACE FUNCTION public.mark_manually_edited()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Obtener role del JWT actual (NULL si no hay JWT context = CLI/migrations)
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::json ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  -- Solo marcar si UPDATE viene de role 'authenticated' (admin UI logged-in user).
  -- Excluye:
  --   - service_role (workflow n8n, scripts batch)
  --   - anon (público — no debería poder UPDATEar igualmente por RLS)
  --   - NULL (migrations, psql directo, sin contexto JWT)
  IF v_role = 'authenticated' THEN
    NEW.manually_edited := true;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.mark_manually_edited() IS
  'Marca manually_edited=true en UPDATEs de admin UI (role=authenticated). service_role workflow n8n bypassa para permitir Smart dedup reprocess.';

-- ─── Trigger attach: invoices + quotes ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_invoices_mark_manually_edited ON public.invoices;
CREATE TRIGGER trg_invoices_mark_manually_edited
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  WHEN (OLD.manually_edited IS DISTINCT FROM true)  -- ya marcado → skip
  EXECUTE FUNCTION public.mark_manually_edited();

DROP TRIGGER IF EXISTS trg_quotes_mark_manually_edited ON public.quotes;
CREATE TRIGGER trg_quotes_mark_manually_edited
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  WHEN (OLD.manually_edited IS DISTINCT FROM true)
  EXECUTE FUNCTION public.mark_manually_edited();

-- ─── Index parcial para Smart dedup query performance ─────────────────────
-- Query típico smart dedup: SELECT id, ai_confidence, review_status, reviewed_at,
--   reviewed_by, manually_edited, reprocess_attempts, updated_at
-- WHERE file_hash = $1 AND deleted_at IS NULL.
-- Index existente sobre (file_hash) cubre lookup; las columnas extra son fetch
-- por heap. Volumen Cathedral ~700 invoices no requiere covering index.
-- Si pasa de 10k rows, considerar:
-- CREATE INDEX CONCURRENTLY idx_invoices_smart_dedup ON public.invoices (file_hash)
--   INCLUDE (ai_confidence, review_status, reviewed_at, reviewed_by,
--            manually_edited, reprocess_attempts, updated_at)
--   WHERE deleted_at IS NULL;

COMMIT;
