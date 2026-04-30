-- ============================================================================
-- Migración: invoices · Verifactu 2027 + Libro IVA + Granularidad económica
-- Fecha: 2026-04-29
-- Sesión: 29 (post-bugs Mistral/Pre-Clasif arreglados)
-- ============================================================================
--
-- Esta migración amplía la tabla `invoices` para que el sistema sea legalmente
-- conforme con TODA la normativa española aplicable a Cathedral House Investment SL,
-- y prepare la BD para Verifactu obligatorio el 1 de enero de 2027.
--
-- Normativa cubierta:
-- - RD 1619/2012 Reglamento de Facturación (contenido factura)
-- - RD 1624/1992 Reglamento IVA arts. 62-69 (libro registro)
-- - Ley 37/1992 LIVA (régimenes especiales, exenciones, ISP)
-- - RD 1007/2023 Verifactu (huella, encadenamiento, QR, envío AEAT)
-- - Orden HAC/1177/2024 especificaciones técnicas Verifactu
-- - Ley 38/1999 LOE (certificaciones obra, garantía decenal)
-- - RD Legislativo 1/2004 Ley Catastro (referencia catastral)
-- - LGT art. 200 (sanciones inexactitud libros registro)
--
-- Filosofía: aplicar la regla "extraer TODO" (feedback_extraer_todo.md).
-- Todas las columnas son NULLABLE para no romper inserts existentes; el flujo
-- las irá poblando según lo que el extractor (Gemini + Mistral OCR) detecte.
-- ============================================================================

BEGIN;

-- ============================================================================
-- BLOQUE A — Verifactu 2027 (RD 1007/2023 + Orden HAC/1177/2024)
-- ============================================================================
-- Cathedral es persona jurídica → obligada desde 1/1/2027.
-- Las columnas se pueblan ya desde sesión 29 para tener histórico cuando
-- arranque el sistema oficial. La 1ª factura del 1/1/2027 debe tener
-- es_primer_registro_verifactu=TRUE y huella_anterior_sha256=NULL.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tipo_factura_codigo TEXT;
COMMENT ON COLUMN invoices.tipo_factura_codigo IS
  'Verifactu: F1 completa | F2 simplificada | F3 sustitutiva | F4 recapitulativa simplif. | F5 simplificada cualificada | R1-R5 rectificativas';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_tipo_factura_codigo_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_tipo_factura_codigo_check
  CHECK (tipo_factura_codigo IS NULL OR tipo_factura_codigo IN
    ('F1','F2','F3','F4','F5','R1','R2','R3','R4','R5'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS clave_regimen_iva TEXT;
COMMENT ON COLUMN invoices.clave_regimen_iva IS
  'Verifactu clave régimen: 01 general | 02 exportación | 03 bienes usados | 04 oro inversión | 05 agencias viaje | 06 grupo entidades | 07 criterio caja | 08 IPSI/IGIC | 09 servicios agencias viaje | 10 cobros terceros | 11 arrendamientos local | 12 arrendamientos sujetos retención | 13 arrendamientos no sujetos retención | 14 obras certificadas Admin | 15 cobro aplazado | 17 OSS-IOSS | 18 recargo equivalencia | 19 actividades agrícolas';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS calificacion_operacion TEXT;
COMMENT ON COLUMN invoices.calificacion_operacion IS
  'Verifactu: S1 sujeta y no exenta | S2 sujeta no exenta inversión sujeto pasivo | N1 no sujeta art. 7 LIVA | N2 no sujeta otros';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_calificacion_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_calificacion_check
  CHECK (calificacion_operacion IS NULL OR calificacion_operacion IN ('S1','S2','N1','N2'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS huella_sha256 TEXT;
COMMENT ON COLUMN invoices.huella_sha256 IS
  'Verifactu huella del registro: SHA-256 de IDEmisor + NumSerie + FechaExpedicion + TipoFactura + CuotaTotal + ImporteTotal + HuellaRegistroAnterior + FechaHoraHusoGenRegistro. Distinto de file_hash (huella del PDF binario).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS huella_anterior_sha256 TEXT;
COMMENT ON COLUMN invoices.huella_anterior_sha256 IS
  'Verifactu encadenamiento: huella del registro anterior emitido por Cathedral. NULL solo en el primer registro.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_primer_registro_verifactu BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN invoices.es_primer_registro_verifactu IS
  'Verifactu: TRUE solo en la primera factura emitida bajo el sistema. Esperable: 1 ó 2 filas TRUE en toda la historia.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fecha_hora_huso_gen_registro TIMESTAMPTZ;
COMMENT ON COLUMN invoices.fecha_hora_huso_gen_registro IS
  'Verifactu: timestamp ISO 8601 con zona horaria del momento exacto de generación del registro.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tipo_huella_verifactu TEXT DEFAULT '01';
COMMENT ON COLUMN invoices.tipo_huella_verifactu IS
  'Verifactu: 01 = SHA-256. Único valor admitido al 2026.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sistema_informatico_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sistema_informatico_version TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sistema_informatico_instalacion TEXT;
COMMENT ON COLUMN invoices.sistema_informatico_id IS
  'Verifactu: identificador del sistema informático certificado (Cathedral n8n + Supabase tras certificación).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qr_url_verifactu TEXT;
COMMENT ON COLUMN invoices.qr_url_verifactu IS
  'Verifactu: URL al servicio de cotejo AEAT con NIF emisor + NumSerie + FechaExpedicion + ImporteTotal. Imprimible como QR 30x30 a 40x40 mm en factura.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS enviado_aeat BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fecha_envio_aeat TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS estado_aeat TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS csv_aeat TEXT;
COMMENT ON COLUMN invoices.csv_aeat IS
  'Verifactu: Código Seguro de Verificación devuelto por AEAT tras aceptar el registro.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xml_registro_alta JSONB;
COMMENT ON COLUMN invoices.xml_registro_alta IS
  'Verifactu: estructura completa del XML enviado a AEAT. Persistencia para auditoría.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subsanacion BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rechazo_previo BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- BLOQUE B — Libro registro IVA (RD 1624/1992 arts. 62-69)
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS numero_recepcion INTEGER;
COMMENT ON COLUMN invoices.numero_recepcion IS
  'RIVA art. 64: número correlativo asignado por el receptor (Cathedral) al registrar la factura recibida en libro.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS periodo_liquidacion TEXT;
COMMENT ON COLUMN invoices.periodo_liquidacion IS
  'Formato YYYY-MM. Periodo en el que la factura computa para el modelo 303.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS trimestre TEXT;
COMMENT ON COLUMN invoices.trimestre IS 'Formato YYYY-T (T=1..4). Para agregaciones modelo 303.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fecha_registro_contable DATE;
COMMENT ON COLUMN invoices.fecha_registro_contable IS
  'RIVA art. 64.3: fecha en que la factura se registra contablemente. Plazo: 4 días naturales desde recepción y antes del día 16 del mes siguiente al devengo.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS computa_347 BOOLEAN DEFAULT TRUE;
COMMENT ON COLUMN invoices.computa_347 IS
  'TRUE si la factura computa para modelo 347 (operaciones >3.005,06€). FALSE si está excluida (SII, intracomunitaria del 349, alquileres con retención del 180, etc.).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS computa_349_clave TEXT;
COMMENT ON COLUMN invoices.computa_349_clave IS
  'Clave modelo 349 si es intracomunitaria: E entrega | A adquisición | T triangular | S servicio prestado | I servicio adquirido | M-H rectificaciones | R-D régimen depósito.';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_349_clave_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_349_clave_check
  CHECK (computa_349_clave IS NULL OR computa_349_clave IN ('E','A','T','S','I','M','H','R','D'));

-- ============================================================================
-- BLOQUE C — Granularidad económica por tipo IVA (LIVA + Modelo 303)
-- ============================================================================
-- Hoy `vat_pct` y `vat_amount` son únicos. Una factura puede tener varios tipos
-- (ej. base 21% + base 10% en construcción de vivienda con materiales mixtos).
-- Las columnas siguientes permiten desglose para el modelo 303 casillas 01-09.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_imponible_4 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cuota_iva_4 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_imponible_10 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cuota_iva_10 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_imponible_21 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cuota_iva_21 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_imponible_0_exenta NUMERIC(14,2);
COMMENT ON COLUMN invoices.base_imponible_0_exenta IS
  'Base imponible de operaciones exentas (vivienda alquiler, art. 20 LIVA). Computa modelo 303 casilla 60.';

-- Recargo de equivalencia (LIVA art. 156-163, sólo proveedores a minoristas)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recargo_eq_5_2 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recargo_eq_1_4 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recargo_eq_0_5 NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS recargo_eq_1_75 NUMERIC(14,2);

-- ============================================================================
-- BLOQUE D — Régimen y leyendas (LIVA art. 84, 20, 21 + RD 1619/2012 art. 6)
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_exenta BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS motivo_exencion TEXT;
COMMENT ON COLUMN invoices.motivo_exencion IS
  'Verifactu: E1 art. 20 | E2 art. 21 | E3 art. 22 | E4 art. 24 | E5 art. 25 | E6 otros.';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_motivo_exencion_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_motivo_exencion_check
  CHECK (motivo_exencion IS NULL OR motivo_exencion IN ('E1','E2','E3','E4','E5','E6'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_legal_exencion TEXT;
COMMENT ON COLUMN invoices.base_legal_exencion IS
  'Texto del artículo invocado, ej. "art. 20.Uno.23 LIVA". Obligatorio en factura por art. 6.1.j RD 1619/2012.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_criterio_caja BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN invoices.es_criterio_caja IS
  'Régimen especial criterio de caja LIVA art. 163 decies-sexies. Devengo al cobro o 31 dic año siguiente.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_intracomunitaria BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_exportacion BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS es_triangular BOOLEAN DEFAULT FALSE;
-- es_recargo_equivalencia y inversion_sujeto_pasivo ya existen en la tabla.

-- Leyendas obligatorias en la factura (RD 1619/2012 art. 6.1.l-p)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS leyenda_inversion TEXT;
COMMENT ON COLUMN invoices.leyenda_inversion IS
  'Texto a incluir en factura cuando hay inversión sujeto pasivo, ej. "Operación con inversión del sujeto pasivo según art. 84.Uno.2.f LIVA".';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS leyenda_exencion TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS leyenda_otra TEXT;

-- ============================================================================
-- BLOQUE E — Rectificativas estructuradas (RD 1619/2012 art. 15)
-- ============================================================================
-- Hoy ya existen `es_rectificativa`, `numero_factura_original`, `linked_invoice_id`.
-- Añadimos las columnas faltantes para conformar plenamente con Verifactu y
-- para distinguir entre rectificación por sustitución (S) o por diferencias (I).
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS factura_origen_fecha DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tipo_rectificativa TEXT;
COMMENT ON COLUMN invoices.tipo_rectificativa IS
  'S = sustitución (factura nueva reemplaza la original) | I = por diferencias (sólo el delta).';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_tipo_rectificativa_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_tipo_rectificativa_check
  CHECK (tipo_rectificativa IS NULL OR tipo_rectificativa IN ('S','I'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS motivo_rectificacion_codigo TEXT;
COMMENT ON COLUMN invoices.motivo_rectificacion_codigo IS
  'Verifactu R1-R5: R1 error fundado en derecho | R2 art. 80 LIVA concurso | R3 art. 80 LIVA créditos incobrables | R4 otras causas | R5 rectificativa de simplificada.';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_motivo_rectificacion_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_motivo_rectificacion_check
  CHECK (motivo_rectificacion_codigo IS NULL OR motivo_rectificacion_codigo IN ('R1','R2','R3','R4','R5'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_rectificada NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cuota_rectificada NUMERIC(14,2);

-- ============================================================================
-- BLOQUE F — Construcción / certificaciones de obra (LOE Ley 38/1999)
-- ============================================================================
-- Cathedral hace reformas y obras. Las certificaciones de obra son frecuentes
-- y tienen contenido específico distinto a una factura simple.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS importe_certificado_a_origen NUMERIC(14,2);
COMMENT ON COLUMN invoices.importe_certificado_a_origen IS
  'Acumulado de toda la obra ejecutada hasta la fecha de la certificación.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS importe_certificado_anterior NUMERIC(14,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS importe_certificado_periodo NUMERIC(14,2);
COMMENT ON COLUMN invoices.importe_certificado_periodo IS
  'Importe líquido de la certificación de este periodo (a_origen - anterior).';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retencion_garantia_porcentaje NUMERIC(5,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retencion_garantia_importe NUMERIC(14,2);
COMMENT ON COLUMN invoices.retencion_garantia_porcentaje IS
  'LOE art. 19: típicamente 5% retenido al contratista durante el plazo de garantía decenal.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS revision_precios NUMERIC(14,2);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS director_obra_nif TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS director_ejecucion_nif TEXT;
COMMENT ON COLUMN invoices.director_obra_nif IS
  'NIF del arquitecto director de obra (LOE art. 12). Útil para vincular firma.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS poliza_decenal_numero TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS poliza_decenal_aseguradora TEXT;
COMMENT ON COLUMN invoices.poliza_decenal_numero IS
  'LOE art. 19: seguro decenal obligatorio en obra nueva residencial.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS referencia_catastral TEXT;
COMMENT ON COLUMN invoices.referencia_catastral IS
  'RD Legislativo 1/2004 Ley Catastro: 20 caracteres. Vincula la factura al inmueble en el sistema.';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_ref_catastral_format;
ALTER TABLE invoices ADD CONSTRAINT invoices_ref_catastral_format
  CHECK (referencia_catastral IS NULL OR LENGTH(referencia_catastral) = 20);

-- ============================================================================
-- BLOQUE G — Direcciones desglosadas emisor + receptor (RD 1619/2012 art. 6.1.e)
-- ============================================================================
-- Hoy `direccion_emisor` es TEXT único. Para Verifactu y libro registro hay que
-- desglosar para ser consultable y conforme con el formato XML AEAT.
-- ============================================================================

-- Emisor
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_via_publica TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_numero TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_resto_direccion TEXT;
COMMENT ON COLUMN invoices.emisor_resto_direccion IS 'Escalera, piso, puerta, etc.';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_codigo_postal TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_municipio TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_provincia TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_codigo_pais TEXT DEFAULT 'ES';
COMMENT ON COLUMN invoices.emisor_codigo_pais IS 'ISO 3166-1 alpha-2.';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emisor_nif_iva_intracom TEXT;
COMMENT ON COLUMN invoices.emisor_nif_iva_intracom IS
  'NIF-IVA con prefijo país, ej. ESB19761915. Obligatorio en operaciones intracomunitarias (modelo 349).';

-- Receptor (algunas columnas ya existen: nif_receptor, nombre_receptor)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_via_publica TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_numero TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_resto_direccion TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_codigo_postal TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_municipio TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_provincia TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_codigo_pais TEXT DEFAULT 'ES';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_nif_iva_intracom TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receptor_codigo_dir3 TEXT;
COMMENT ON COLUMN invoices.receptor_codigo_dir3 IS
  'Solo Administración Pública: código DIR3 obligatorio para FACe. Ej. EA0009003.';

-- ============================================================================
-- BLOQUE H — Pago granular (RD 1619/2012 + Verifactu)
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS forma_pago_codigo TEXT;
COMMENT ON COLUMN invoices.forma_pago_codigo IS
  '01 contado | 02 recibo domiciliación SEPA | 03 transferencia | 04 letra aceptada | 05 confirming | 06 pagaré | 07 cheque | 08 tarjeta';

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_forma_pago_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_forma_pago_check
  CHECK (forma_pago_codigo IS NULL OR forma_pago_codigo IN ('01','02','03','04','05','06','07','08'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS referencia_remesa TEXT;
COMMENT ON COLUMN invoices.referencia_remesa IS 'Referencia SEPA si pago domiciliado.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS num_plazos INTEGER;

-- ============================================================================
-- BLOQUE I — Auditoría usuarios (trazabilidad)
-- ============================================================================
-- Complementa los created_at/updated_at ya existentes con identidad del usuario.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS usuario_creacion UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS usuario_modificacion UUID;
COMMENT ON COLUMN invoices.usuario_creacion IS
  'auth.users.id del usuario que creó la fila. NULL si la creó el workflow n8n con service_role.';

-- ============================================================================
-- BLOQUE J — Moneda y cambio (operaciones extranjeras)
-- ============================================================================
-- Hoy existen `moneda_original`, `pais_origen`, `es_extranjera`. Faltan tipo cambio.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(10,6);
COMMENT ON COLUMN invoices.tipo_cambio IS
  'Tipo de cambio EUR/divisa aplicado a fecha devengo. Tipo BCE oficial recomendado por AEAT.';

-- ============================================================================
-- BLOQUE K — Texto OCR completo + datos brutos (regla feedback_extraer_todo.md)
-- ============================================================================
-- Arquitectura 5 capas: estos campos garantizan que SIEMPRE tenemos el contenido
-- íntegro del documento extraído, aunque hoy no se use ningún campo concreto.
-- Permite añadir nuevas columnas hot promovidas desde jsonb cuando se necesiten.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS texto_completo TEXT;
COMMENT ON COLUMN invoices.texto_completo IS
  'Texto íntegro del OCR (Mistral) sin filtrar. Hasta 65535 chars típicamente. Permite full-text search con tsvector.';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS datos_brutos JSONB;
COMMENT ON COLUMN invoices.datos_brutos IS
  'JSONB libre con TODO lo que el LLM (Gemini) detectó en el documento. Sin schema. Sirve como red de seguridad cuando descubrimos campos nuevos sin reprocesar.';

-- ============================================================================
-- ÍNDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_huella_sha256 ON invoices(huella_sha256) WHERE huella_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_periodo_liquidacion ON invoices(periodo_liquidacion) WHERE periodo_liquidacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_trimestre ON invoices(trimestre) WHERE trimestre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_referencia_catastral ON invoices(referencia_catastral) WHERE referencia_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_es_intracomunitaria ON invoices(es_intracomunitaria) WHERE es_intracomunitaria IS TRUE;
CREATE INDEX IF NOT EXISTS idx_invoices_computa_347 ON invoices(computa_347) WHERE computa_347 IS TRUE;
CREATE INDEX IF NOT EXISTS idx_invoices_motivo_rectificacion ON invoices(motivo_rectificacion_codigo) WHERE motivo_rectificacion_codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_enviado_aeat ON invoices(enviado_aeat, fecha_envio_aeat) WHERE enviado_aeat IS TRUE;

-- Full-text search sobre texto OCR (preparación, índice GIN sobre tsvector)
CREATE INDEX IF NOT EXISTS idx_invoices_texto_completo_fts
  ON invoices USING GIN (to_tsvector('spanish', COALESCE(texto_completo, '')));

-- ============================================================================
-- Recargar PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
