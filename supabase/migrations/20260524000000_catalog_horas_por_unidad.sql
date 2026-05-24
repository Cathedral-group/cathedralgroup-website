-- ============================================================================
-- Cathedral Group — Rendimientos (horas/unidad) catálogo partidas (24/05/2026)
--
-- Feedback David: el presupuesto debe estimar las HORAS de una obra según m²
-- y tareas, para planificar (alimenta el Gantt). Cada partida necesita un
-- rendimiento = horas de mano de obra por unidad.
--
-- Valores REALES del Generador de Precios CYPE (generadordeprecios.info),
-- verificados ficha a ficha por agentes research (suma oficial + ayudante/peón
-- de la sección "Mano de obra" de cada descompuesto). Son punto de partida
-- por capítulo+unidad; editables por partida.
--
-- Capítulos sin mano de obra directa (20 Gestión, 21 Maquinaria/alquiler,
-- 22 Ayudas de oficio, 14/25 Varios) → NULL (no tienen rendimiento horario).
-- Unidad 'pa' (partida alzada) → NULL siempre.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

ALTER TABLE public.quote_items_catalog
  ADD COLUMN IF NOT EXISTS horas_por_unidad numeric;

COMMENT ON COLUMN public.quote_items_catalog.horas_por_unidad IS
  'Rendimiento: horas de mano de obra por unidad (oficial+ayudante). Base CYPE generadordeprecios.info. Estimación por capítulo+unidad, ajustable por partida. Alimenta cálculo de horas del presupuesto → planificación obra. Sesión 24/05.';

-- Rendimientos h(MO)/unidad por capítulo+unidad (CYPE). Solo unidades con dato
-- fiable; el resto queda NULL para rellenar a mano.
UPDATE public.quote_items_catalog SET horas_por_unidad = CASE
  WHEN chapter_code = '01' AND unit = 'm2' THEN 0.40   -- demolición/levantado (prom. tabique 0.22 + pavimento 0.62)
  WHEN chapter_code = '02' AND unit = 'm2' THEN 0.45   -- tabique fábrica 0.54 / trasdosado pladur 0.38
  WHEN chapter_code = '02' AND unit = 'ml' THEN 0.45
  WHEN chapter_code = '03' AND unit = 'm2' THEN 0.60   -- solado gres RSG010
  WHEN chapter_code = '04' AND unit = 'm2' THEN 0.66   -- alicatado RAG011
  WHEN chapter_code = '05' AND unit = 'm2' THEN 0.57   -- falso techo pladur RTC015
  WHEN chapter_code = '06' AND unit = 'ud' THEN 1.80   -- puerta paso LPM010
  WHEN chapter_code = '06' AND unit = 'ml' THEN 0.18   -- rodapié RSG020
  WHEN chapter_code = '07' AND unit = 'ud' THEN 1.88   -- ventana aluminio LCL060
  WHEN chapter_code = '07' AND unit = 'm2' THEN 0.68   -- acristalamiento LVC010
  WHEN chapter_code = '08' AND unit = 'ud' THEN 1.00   -- punto eléctrico (derivado IEI015, orden de magnitud)
  WHEN chapter_code = '09' AND unit = 'ml' THEN 0.06   -- tubería PEX IHE110
  WHEN chapter_code = '09' AND unit = 'ud' THEN 2.50   -- punto fontanería (instalación aseo IFI repartida)
  WHEN chapter_code = '10' AND unit = 'ud' THEN 4.00   -- split ICN020/040
  WHEN chapter_code = '11' AND unit = 'm2' THEN 0.19   -- pintura plástica RIP030
  WHEN chapter_code = '11' AND unit = 'ml' THEN 0.10
  WHEN chapter_code = '12' AND unit = 'ml' THEN 1.77   -- mobiliario cocina SCM022
  WHEN chapter_code = '13' AND unit = 'ud' THEN 1.15   -- sanitario (inodoro/lavabo/ducha SAI/SAL/SAD)
  WHEN chapter_code = '13' AND unit = 'm2' THEN 0.61   -- alicatado baño RAG014
  WHEN chapter_code = '15' AND unit = 'm2' THEN 0.26   -- impermeabilización NIN010
  WHEN chapter_code = '15' AND unit = 'ml' THEN 0.26
  WHEN chapter_code = '16' AND unit = 'm2' THEN 1.58   -- refuerzo forjado EHH050
  WHEN chapter_code = '16' AND unit = 'ml' THEN 1.13   -- refuerzo viga EHH030
  WHEN chapter_code = '17' AND unit = 'ml' THEN 0.88   -- barandilla FDD250
  WHEN chapter_code = '17' AND unit = 'm2' THEN 0.80   -- reja FDR010
  WHEN chapter_code = '17' AND unit = 'ud' THEN 0.80
  WHEN chapter_code = '18' AND unit = 'ud' THEN 0.80   -- downlight III100
  WHEN chapter_code = '18' AND unit = 'ml' THEN 0.30   -- luminaria lineal LED III143
  WHEN chapter_code = '19' AND unit = 'ud' THEN 2.50   -- punto gas (instalación IGI015 repartida)
  WHEN chapter_code = '23' AND unit = 'm2' THEN 1.40   -- SATE/ETICS FSM010
  WHEN chapter_code = '24' AND unit = 'm2' THEN 0.67   -- pavimento exterior baldosa hormigón
  WHEN chapter_code = '24' AND unit = 'ml' THEN 0.58   -- bordillo UXB020
  ELSE horas_por_unidad
END
WHERE unit <> 'pa';

COMMIT;

NOTIFY pgrst, 'reload schema';
