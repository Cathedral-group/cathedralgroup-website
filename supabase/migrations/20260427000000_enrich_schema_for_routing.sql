-- ════════════════════════════════════════════════════════════════
-- Sesión 24 (27/04/2026) — Enriquecimiento de schema
--
-- Objetivos:
--   1. Ampliar `invoices.categoria_gasto` con 12 nuevas categorías
--      necesarias para una empresa de reformas + flipping + promoción.
--   2. Añadir `invoices.tipo_operacion` para distinguir contabilidad
--      por tipo de negocio (reforma_cliente / flipping / promocion / general).
--   3. Enriquecer `projects` con campos críticos que faltaban:
--      zona, m², tipo_inmueble, n. habitaciones/baños, ref. catastral,
--      jefe de obra, arquitecto, aparejador, nivel calidad,
--      fechas y precios de compra/venta para flippings,
--      presupuestos inicial/revisado para detectar desviaciones.
--
-- Filosofía: "que no se nos quede nada fuera" (regla extraer_todo).
-- Si sobra después, se quita. Mejor pasarse de campos que faltarse.
-- ════════════════════════════════════════════════════════════════

-- ─── 1. Categorías de gasto: ampliar con valores reales del negocio ───
--
-- Antes: categoria_gasto era texto libre (sin CHECK), aunque en práctica
-- se usaban 6 valores (material, mano_de_obra, subcontratas, alquiler,
-- servicios, otros).
--
-- Ahora: 18 valores documentados como CHECK + comentario para que GPT
-- y workflow conozcan el catálogo.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_categoria_gasto_check CHECK (
    categoria_gasto IS NULL OR categoria_gasto = ANY (ARRAY[
      -- Originales (mantener compatibilidad)
      'material',
      'mano_de_obra',
      'subcontratas',
      'alquiler',
      'servicios',
      'otros',
      -- Nuevos (sesión 24)
      'comunidad_propietarios',     -- cuotas y derramas comunidad
      'suministros',                -- luz, agua, gas, internet, teléfono
      'seguros',                    -- RC obra, decenal, vehículos, vida, hogar
      'financiero',                 -- intereses préstamo, comisiones bancarias, cargos
      'tributos_locales',           -- IBI, basuras, plusvalía municipal, vado
      'notaria_registro',           -- gastos notariales y registrales
      'mobiliario_decoracion',      -- muebles, decoración, electrodomésticos para flipping
      'marketing_publicidad',       -- Idealista, Fotocasa, redes sociales, fotógrafo
      'desplazamientos_dietas',     -- gasolina, parking, dietas, viajes
      'software_oficina',           -- SaaS, Office, herramientas digitales
      'gestoria_asesoria',          -- gestoría laboral, fiscal, abogados
      'comisiones_intermediacion'   -- API, comerciales externos, intermediarios
    ])
  );

COMMENT ON COLUMN invoices.categoria_gasto IS
  'Categoría contable del gasto. 18 valores válidos. Útil para P&L por proyecto y para los modelos fiscales (303, 111, 190).';


-- ─── 2. Tipo de operación: distinguir contabilidad por tipo de negocio ───
--
-- Cathedral hace 3 cosas distintas:
--   - reforma_cliente: factura emitida al cliente (OBR-)
--   - flipping: compra-reforma-venta propia (FLP-)
--   - promocion: desarrollo nueva construcción para vender (PRO-, OBN-, CDU-)
--   - gasto_general: sede, suministros oficina, no asignable a obra
--
-- Esto es CRÍTICO para hacer P&L real por unidad de negocio.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tipo_operacion text;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_tipo_operacion_check CHECK (
    tipo_operacion IS NULL OR tipo_operacion = ANY (ARRAY[
      'reforma_cliente',  -- OBR-, factura emitida al cliente
      'flipping',         -- FLP-, compra-reforma-venta propia
      'promocion',        -- PRO-/OBN-, desarrollo
      'cambio_uso',       -- CDU-, cambio de uso de inmueble
      'gasto_general'     -- sede, no asignable a obra
    ])
  );

COMMENT ON COLUMN invoices.tipo_operacion IS
  'Tipo de operación del negocio. Permite separar P&L por unidad: reforma cliente vs flipping vs promoción vs gasto general.';


-- ─── 3. Subcategoría de gasto (más fina dentro de categoria_gasto) ───
--
-- Texto libre por ahora. Útil para reportes muy detallados. No restringido
-- por CHECK porque la subcategoría depende del proveedor / contexto.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subcategoria_gasto text;

COMMENT ON COLUMN invoices.subcategoria_gasto IS
  'Subcategoría libre para detallar el tipo de gasto (ej: "fontanería", "azulejos", "luz Iberdrola").';


-- ════════════════════════════════════════════════════════════════
-- 4. Enriquecer tabla projects
-- ════════════════════════════════════════════════════════════════

-- Zona geográfica (Madrid: Salamanca, Chamberí, Pozuelo, etc.)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zona text;
COMMENT ON COLUMN projects.zona IS 'Zona o barrio del proyecto. Útil para agrupación geográfica.';

-- Características físicas del inmueble
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metros_cuadrados numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tipo_inmueble text;
ALTER TABLE projects
  ADD CONSTRAINT projects_tipo_inmueble_check CHECK (
    tipo_inmueble IS NULL OR tipo_inmueble = ANY (ARRAY[
      'piso', 'atico', 'duplex', 'estudio',
      'local_comercial', 'oficina', 'nave_industrial',
      'casa_unifamiliar', 'chalet', 'adosado',
      'planta_baja', 'planta_completa',
      'edificio_completo', 'finca_rustica', 'suelo_urbano',
      'garaje', 'trastero', 'otro'
    ])
  );

ALTER TABLE projects ADD COLUMN IF NOT EXISTS numero_habitaciones int;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS numero_banos int;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS referencia_catastral text;

-- Equipo del proyecto
ALTER TABLE projects ADD COLUMN IF NOT EXISTS responsable_obra text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS arquitecto_externo text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS aparejador_externo text;

-- Nivel de calidad (debe coincidir con quotes.quality_level)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS nivel_calidad text;
ALTER TABLE projects
  ADD CONSTRAINT projects_nivel_calidad_check CHECK (
    nivel_calidad IS NULL OR nivel_calidad = ANY (ARRAY[
      'estandar', 'premium', 'lujo', 'personalizado'
    ])
  );

-- Datos específicos para flipping/promoción
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fecha_compra date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fecha_venta_real date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS precio_compra numeric;
-- (sale_price ya existe)

-- Detección de desviaciones (presupuesto inicial vs revisado)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS presupuesto_inicial numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS presupuesto_revisado numeric;
COMMENT ON COLUMN projects.presupuesto_inicial IS 'Presupuesto inicial firmado con el cliente o aprobado por el comité.';
COMMENT ON COLUMN projects.presupuesto_revisado IS 'Presupuesto tras revisiones/ampliaciones. Permite ver desviaciones.';

-- Información comercial adicional
ALTER TABLE projects ADD COLUMN IF NOT EXISTS comercial_responsable text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fuente_origen text; -- web, referido, comercial, etc.

-- ════════════════════════════════════════════════════════════════
-- 5. Refrescar PostgREST schema cache (admin panel verá los cambios)
-- ════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
