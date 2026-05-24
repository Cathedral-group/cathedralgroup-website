-- ============================================================================
-- Cathedral Group — Orden constructivo de partidas (orden_montaje) 24/05/2026
--
-- Feedback David: que las partidas se coloquen automáticamente en su posición
-- correcta de obra (luego él puede mover). Secuencia real de reforma integral.
-- TARIMA y PINTURA al final (no estropearlas con trabajos sucios posteriores).
--
-- Orden constructivo (no es el chapter_code numérico):
-- gestión/maquinaria → demolición → estructura → impermeab. → tabiquería →
-- instalaciones empotradas (fontanería/electricidad/gas/clima) + ayudas →
-- falsos techos → alicatado → solado → carpintería → cerrajería →
-- cocina/baños → PINTURA → TARIMA → iluminación → exteriores → varios/remates.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

ALTER TABLE public.quote_items_catalog ADD COLUMN IF NOT EXISTS orden_montaje int;

COMMENT ON COLUMN public.quote_items_catalog.orden_montaje IS
  'Orden constructivo de ejecución (no chapter_code). Coloca partidas automáticamente en su posición de obra. Tarima/pintura al final. Editable después. Sesión 24/05.';

-- 1) Orden por capítulo (secuencia constructiva)
UPDATE public.quote_items_catalog SET orden_montaje = CASE chapter_code
  WHEN '20' THEN 5   -- Gestión de obra (transversal, arranque)
  WHEN '21' THEN 8   -- Maquinaria y medios auxiliares (transversal)
  WHEN '01' THEN 10  -- Demoliciones
  WHEN '16' THEN 20  -- Estructura y refuerzo
  WHEN '15' THEN 30  -- Impermeabilización
  WHEN '02' THEN 40  -- Tabiquería
  WHEN '09' THEN 50  -- Fontanería (empotrada)
  WHEN '08' THEN 55  -- Electricidad (empotrada)
  WHEN '19' THEN 57  -- Gas
  WHEN '10' THEN 60  -- Climatización
  WHEN '22' THEN 65  -- Ayudas de oficio (con instalaciones)
  WHEN '05' THEN 70  -- Techos / falsos techos
  WHEN '04' THEN 80  -- Revestimientos paredes (alicatado)
  WHEN '03' THEN 90  -- Revestimientos suelos (solado; tarima override abajo)
  WHEN '07' THEN 100 -- Carpintería exterior
  WHEN '06' THEN 110 -- Carpintería interior
  WHEN '17' THEN 120 -- Cerrajería y metalistería
  WHEN '12' THEN 130 -- Cocinas
  WHEN '13' THEN 135 -- Baños (sanitarios)
  WHEN '11' THEN 140 -- Pintura (casi al final)
  WHEN '18' THEN 160 -- Iluminación (luminarias al final)
  WHEN '23' THEN 170 -- Revestimientos exteriores
  WHEN '24' THEN 175 -- Urbanización y exteriores
  WHEN '14' THEN 180 -- Varios
  WHEN '25' THEN 185 -- Varios
  ELSE 200
END;

-- 2) Excepción: tarima/parquet/laminado/flotante → 150 (tras pintura, al final)
UPDATE public.quote_items_catalog SET orden_montaje = 150
WHERE chapter_code = '03'
  AND description IS NOT NULL
  AND (description ILIKE '%tarima%' OR description ILIKE '%parquet%' OR description ILIKE '%laminad%' OR description ILIKE '%flotante%');

COMMIT;

NOTIFY pgrst, 'reload schema';
