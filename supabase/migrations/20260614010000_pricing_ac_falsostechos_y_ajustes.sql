-- ─────────────────────────────────────────────────────────────────────────────
-- Ajustes de la calculadora tras el seed (14/06/2026). Idempotente.
--   (1) Reconcilia ventanas (Cortizo, 90-120 €/m²-vivienda) y wallbox (850-1900,
--       corregido a sin IVA) con lo aplicado en vivo vía panel/SQL.
--   (2) Da de alta 2 extras nuevos: Aire acondicionado (€ fijo) y Falsos techos (€/m²).
-- Todo SIN IVA (precios de venta de empresa). Detalle: memory/cathedral-calculadora-estudio.md
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) Ventanas → Cortizo, 90-120 €/m² de vivienda (= 600-800 €/m² de ventana × ~15% hueco)
UPDATE public.pricing_config
SET val_min = 90, val_max = 120,
    label_es = 'Ventanas / carpintería Cortizo (aluminio premium, instalado)'
WHERE category = 'extra' AND item_key = 'ventanas';

-- (1) Wallbox → 850-1900 (corregido a SIN IVA; las fuentes daban con IVA)
UPDATE public.pricing_config
SET val_min = 850, val_max = 1900
WHERE category = 'extra' AND item_key = 'wallbox';

-- (2) Extras nuevos
INSERT INTO public.pricing_config
  (category, item_key, label_es, sort_order, val_min, val_max, pricing, scope, min_level, in_interiorismo, explanation, source) VALUES
 ('extra','aireAcondicionado','Aire acondicionado',18,2000,6000,'fixed','all','economica',false,
   'Aire acondicionado por splits/multisplit (gama media-alta Daikin/Mitsubishi), suministro + instalacion. SIN IVA. Va aparte de la climatizacion por conductos/aerotermia (otra partida). 2.000-6.000 EUR: piso de 2-3 splits (~2.000) a chalet 5+ splits (~6.000). Por debajo de climatizacion-conductos (4.000-20.000).',
   'Cronoshare 2026 (con IVA) ajustado a sin IVA premium.'),
 ('extra','falsosTechos','Falsos techos',19,25,80,'perM2','all','economica',false,
   'Falsos techos, EUR/m2 de vivienda, SIN IVA. Cubre liso minimalista (25) a decorativo con foseado perimetral para cortinas ocultas e iluminacion indirecta LED / multinivel (80). El liso basico suele ir ya en la obra base; esto es la mejora. Foseado real ~50-55 EUR/ml; piso premium con foseado en zonas nobles = 3.000-6.000 EUR. Anclas: CYPE, 3Vpladur, escayolistas.',
   'Estudio Madrid 2025-26: CYPE generador de precios, 3Vpladur/Instalaciones Vargas, escayolistas Valencia, Cronoshare, habitissimo, Malaga Multiservicios.')
ON CONFLICT (category, item_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
