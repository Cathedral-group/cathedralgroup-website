-- ─────────────────────────────────────────────────────────────────────────────
-- pricing_config — parámetros editables de la calculadora pública /presupuesto
-- (niveles de calidad, factores por tipo, multiplicadores de zona, extras, global).
--
-- Fuente única: la web (/presupuesto) y el panel admin leen de aquí. Solo service_role
-- accede (panel escribe vía API service_role; la web lee vía ruta server service_role).
-- NO hay acceso anon/authenticated (lección de seguridad: fugas por anon SELECT).
--
-- Cada fila lleva `explanation` (el porqué del estudio, visible en el panel para que
-- cualquier socio sepa que hay un criterio detrás) + `updated_at`/`updated_by`
-- (cuándo y quién lo tocó por última vez).
--
-- Valores aprobados por David 14/06/2026 tras estudio de mercado Madrid 2025-26.
-- Detalle: memory/cathedral-calculadora-estudio.md. Idempotente (seguro re-ejecutar).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  item_key text NOT NULL,
  label_es text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  val_min numeric,
  val_mid numeric,
  val_max numeric,
  val_factor numeric,
  pricing text,
  scope text,
  min_level text,
  in_interiorismo boolean NOT NULL DEFAULT false,
  is_contact boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  explanation text,
  source text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT pricing_config_category_chk CHECK (category IN ('level','project_type','zone','extra','global')),
  CONSTRAINT pricing_config_pricing_chk CHECK (pricing IS NULL OR pricing IN ('fixed','perM2')),
  CONSTRAINT pricing_config_scope_chk CHECK (scope IS NULL OR scope IN ('all','house')),
  CONSTRAINT pricing_config_unique UNIQUE (category, item_key)
);

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config FORCE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE public.pricing_config TO service_role;
REVOKE ALL ON TABLE public.pricing_config FROM anon, authenticated;

-- updated_at se autoactualiza en cada UPDATE (patrón Cathedral)
CREATE OR REPLACE FUNCTION public.pricing_config_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_config_updated_at ON public.pricing_config;
CREATE TRIGGER trg_pricing_config_updated_at
  BEFORE UPDATE ON public.pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.pricing_config_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_pricing_config_cat
  ON public.pricing_config(category, sort_order) WHERE active;

-- ── Seed: NIVELES (€/m², base = reforma integral en zona estándar) ──
INSERT INTO public.pricing_config
  (category, item_key, label_es, sort_order, val_min, val_mid, val_max, is_contact, explanation, source) VALUES
 ('level','economica','Económica',1,600,640,680,false,
   'Acabados funcionales de calidad: gres/porcelánico básico, sanitarios funcionales, carpintería sencilla. Es el suelo de Cathedral: somos empresa con garantía y dirección de obra, no un autónomo low-cost, por eso no bajamos de 600 €/m². El mercado situaba la integral económica de empresa en Madrid en 600-700 €/m².',
   'Estudio reforma Madrid 2025-26: ArQuality, Hometailor, Idealista/Wollyhome, Cronoshare, Madrid Reformas y Obras, Honra2, Reformadísimo, ReformasMadrid20.'),
 ('level','estandar','Estándar',2,680,800,950,false,
   'El precio real de Cathedral para el cliente medio: porcelánico estándar, sanitarios de marca, carpintería de calidad. El mercado de empresa estándar en Madrid está en 700-900 €/m²; nuestra horquilla 680-950 lo cubre.',
   'Estudio reforma Madrid 2025-26 (mismas fuentes).'),
 ('level','premium','Premium',3,950,1100,1250,false,
   'Porcelánico medio-alto, piedra de gama media, carpintería a medida, domótica básica. Mercado premium Madrid 900-1.200 €/m².',
   'Estudio reforma Madrid 2025-26 (mismas fuentes).'),
 ('level','altoStanding','Alto Standing',4,1250,1575,1900,false,
   'Mármol de gama alta, microcemento, mobiliario de diseño, domótica integral. Mercado alto standing Madrid 1.200-1.600+ €/m²; el tope 1.900 cubre proyectos muy exigentes sin entrar en excepcional.',
   'Estudio reforma Madrid 2025-26 (mismas fuentes).'),
 ('level','excepcional','Excepcional',5,NULL,NULL,NULL,true,
   'Sin precio por m²: un proyecto de este nivel es único, su alcance no se reduce a un €/m². Se define tras estudio personalizado. La calculadora deriva a contacto (capta lead).',
   NULL)
ON CONFLICT (category, item_key) DO NOTHING;

-- ── Seed: TIPOS DE PROYECTO (factor × sobre el €/m² del nivel) ──
INSERT INTO public.pricing_config
  (category, item_key, label_es, sort_order, val_factor, is_custom, explanation) VALUES
 ('project_type','reformaIntegral','Reforma integral',1,1.0,false,
   'Referencia del cálculo (×1,0): renovación completa de la vivienda.'),
 ('project_type','reformaParcial','Reforma parcial',2,1.25,false,
   '×1,25 sobre el €/m². Concentra las partidas caras (cocina, baño) en muchos menos m²; el usuario introduce los m² de la zona reformada, no de toda la casa, así que el €/m² sube por concentración pero el total sigue siendo menor que una integral completa. Modelo simple: no se pregunta al cliente por componentes.'),
 ('project_type','interiorismo','Interiorismo',3,0.4,false,
   '×0,4 sobre el €/m². Cubre diseño, decoración y dirección de proyecto, SIN obra y SIN mobiliario (el mobiliario es un extra aparte porque puede costar más que el propio diseño). 100 m² en gama premium ≈ 40.000 €. El mercado de interiorismo sin muebles ronda 0,4× una integral.'),
 ('project_type','cambioUso','Cambio de uso',4,1.3,false,
   '×1,3 a igual acabado: suma licencias y adecuación para convertir local en vivienda (PGOUM nov-2023, superficie útil mínima 40 m²).'),
 ('project_type','obraNueva','Obra nueva',5,1.75,false,
   '×1,75: construir desde cero cuesta 1,6-2,0× una reforma integral al mismo nivel de acabado (estructura, cimentación, instalaciones completas).'),
 ('project_type','promocion','Promoción y desarrollo',6,NULL,true,
   'Sin €/m²: una promoción o desarrollo a gran escala varía demasiado para una estimación automática. La calculadora deriva a contacto (capta lead).')
ON CONFLICT (category, item_key) DO NOTHING;

-- ── Seed: ZONAS (multiplicador por localización) ──
INSERT INTO public.pricing_config
  (category, item_key, label_es, sort_order, val_factor, explanation, source) VALUES
 ('zone','zoneMoraleja','La Moraleja / La Finca / Puerta de Hierro',1,1.5,
   'Las zonas residenciales más exclusivas de Madrid. El estudio daba ×1,70; David lo moderó a ×1,50.',
   'Estudio por barrios: Reformadísimo, lamoraleja.madrid, Tinsa, Wollyhome, Ayuntamiento de Madrid.'),
 ('zone','zoneSalamanca','Salamanca',2,1.25,
   'Barrio de Salamanca: +10-20% sobre la base por coste de acceso, logística y nivel de acabado esperado.',NULL),
 ('zone','zoneCentro','Chamberí / Chamartín / Retiro',3,1.15,
   'Distritos centrales premium: +15%.',NULL),
 ('zone','zonePozuelo','Pozuelo / Aravaca',4,1.15,
   'Suburbios premium del oeste: +15%.',NULL),
 ('zone','zoneLasRozas','Las Rozas / Majadahonda / Boadilla',5,1.05,
   'Suburbios consolidados del noroeste: +5% sobre la base.',NULL),
 ('zone','zoneStandard','Madrid y alrededores',6,1.0,
   'Multiplicador de referencia (×1,0) para el resto de Madrid capital y su área metropolitana.',NULL)
ON CONFLICT (category, item_key) DO NOTHING;

-- ── Seed: GLOBAL (casilla edificio protegido) ──
INSERT INTO public.pricing_config
  (category, item_key, label_es, sort_order, val_factor, explanation) VALUES
 ('global','protected','Edificio protegido o señorial',1,1.3,
   'Casilla opcional. Edificios catalogados/protegidos o señoriales (cascos de Salamanca, Chamberí) elevan el coste por partidas especiales: rehabilitación, materiales específicos, restricciones de obra. El estudio daba ×1,45; suavizado a ×1,30.')
ON CONFLICT (category, item_key) DO NOTHING;

-- ── Seed: EXTRAS (fixed = € por proyecto | perM2 = €/m² × superficie) ──
-- min_level = gama mínima desde la que aparece. scope = all (siempre) | house (vivienda unifamiliar).
-- in_interiorismo = visible cuando el tipo es interiorismo (solo deco).
INSERT INTO public.pricing_config
  (category, item_key, label_es, sort_order, val_min, val_max, pricing, scope, min_level, in_interiorismo, explanation, source) VALUES
 ('extra','domotica','Domótica',1,3000,30000,'fixed','all','economica',true,
   'Control integral del hogar (iluminación, clima, persianas motorizadas, smart glass como sub-opciones). El rango cubre desde una instalación básica hasta integral.',
   'Tendencias lujo y reforma 2026: Idealista, Arquitectura y Diseño, Habitissimo, Cronoshare, Wollyhome, Sotysolar, ParkSinta.'),
 ('extra','cocina','Cocina de diseño',2,9000,50000,'fixed','all','economica',true,
   'Cocina de diseño con electrodomésticos de gama. Mínimo 9.000 € (8.000 se quedaba corto), máximo 50.000 € para cocinas de alto nivel.',NULL),
 ('extra','climatizacion','Climatización',3,4000,20000,'fixed','all','economica',true,
   'Aerotermia, suelo radiante o conductos con zonificación.',NULL),
 ('extra','iluminacion','Iluminación técnica',4,1500,10000,'fixed','all','economica',true,
   'Iluminación técnica y decorativa (líneas LED, empotrables, control de escenas).',NULL),
 ('extra','mobiliario','Mobiliario a medida',5,8000,40000,'fixed','all','economica',true,
   'Mobiliario y vestidores a medida. Separado del interiorismo porque puede costar más que el propio diseño.',NULL),
 ('extra','ventanas','Ventanas / carpintería exterior',6,300,500,'perM2','all','economica',false,
   'Ventanas y carpintería exterior de gama alta (rotura de puente térmico, triple vidrio). Precio por m² de vivienda.',NULL),
 ('extra','sueloMadera','Suelo de madera noble',7,80,175,'perM2','all','economica',false,
   'Tarima o suelo de madera noble. Precio por m².',NULL),
 ('extra','wallbox','Cargador de coche eléctrico',8,950,2200,'fixed','all','economica',false,
   'Punto de recarga (wallbox). Demanda casi universal.',NULL),
 ('extra','spa','Spa / sauna / baño turco',9,2500,12000,'fixed','all','premium',false,
   'Spa doméstico, sauna o baño turco. Extra de lujo: solo aparece desde Premium.',NULL),
 ('extra','piscina','Piscina',10,20000,35000,'fixed','house','economica',false,
   'Piscina. Solo en vivienda unifamiliar; disponible desde Económica (decisión de David: hay clientes que la quieren aun en reforma económica).',NULL),
 ('extra','ascensor','Ascensor / elevador doméstico',11,8000,50000,'fixed','house','economica',false,
   'Ascensor o elevador doméstico. Solo en vivienda unifamiliar.',NULL),
 ('extra','solar','Fotovoltaica + batería',12,4000,13000,'fixed','house','economica',false,
   'Instalación fotovoltaica con batería. Eficiencia + ayudas MOVES/IRPF. Solo en vivienda unifamiliar.',NULL),
 ('extra','pergola','Pérgola bioclimática',13,3500,20000,'fixed','house','economica',false,
   'Pérgola bioclimática o cerramiento de terraza. Solo en vivienda unifamiliar.',NULL),
 ('extra','fachada','Fachada / SATE',14,60,150,'perM2','house','economica',false,
   'Rehabilitación de fachada o aislamiento SATE. Precio por m². Solo en vivienda unifamiliar.',NULL),
 ('extra','gimnasio','Gimnasio doméstico',15,20000,60000,'fixed','house','premium',false,
   'Gimnasio doméstico. El nuevo número uno del lujo 2026. Solo en vivienda unifamiliar y desde Premium.',NULL),
 ('extra','cine','Home cinema',16,30000,50000,'fixed','house','premium',false,
   'Sala de cine en casa (insonorización incluida; simulador de golf como sub-opción en el tope). Solo en vivienda unifamiliar y desde Premium.',NULL),
 ('extra','paisajismo','Paisajismo / jardín',17,3000,10000,'fixed','house','premium',false,
   'Diseño de jardín y paisajismo. Extra de lujo: solo en vivienda unifamiliar y desde Premium.',NULL)
ON CONFLICT (category, item_key) DO NOTHING;

COMMENT ON TABLE public.pricing_config IS
  'Parámetros editables de la calculadora /presupuesto (niveles, factores, zonas, extras, global). Solo service_role. Cada fila lleva explanation (criterio del estudio) + updated_at/updated_by. Fase 2 (14/06/2026).';
