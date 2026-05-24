-- ============================================================================
-- Cathedral Group — Ajuste orden constructivo (24/05/2026)
--
-- Feedback David: la tabiquería y los trasdosados (cap 02) van ANTES que la
-- impermeabilización de los baños (cap 15). Primero se levantan los tabiques
-- que definen los baños y luego se impermeabiliza.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

UPDATE public.quote_items_catalog SET orden_montaje = 30 WHERE chapter_code = '02'; -- Tabiquería
UPDATE public.quote_items_catalog SET orden_montaje = 40 WHERE chapter_code = '15'; -- Impermeabilización

COMMIT;
