-- ============================================================================
-- Migración: quotes + mortgages + documents · Fase 1.B
-- Fecha: 2026-04-29
-- ============================================================================
-- Quotes: Verifactu-ready, granularidad IVA, direcciones, certificaciones obra
-- Mortgages: LCCI Ley 5/2019 completa
-- Documents: campos hot por tipo (escrituras, licencias, certificados, seguros)
-- ============================================================================

-- ============================================================================
-- TABLA quotes (presupuestos)
-- ============================================================================

-- Verifactu-ready (los presupuestos pueden convertirse en facturas)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tipo_factura_codigo TEXT;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_tipo_factura_codigo_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_tipo_factura_codigo_check
  CHECK (tipo_factura_codigo IS NULL OR tipo_factura_codigo IN ('F1','F2','F3','F4','F5'));

-- Granularidad económica IVA por tipo
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS base_imponible_4 NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cuota_iva_4 NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS base_imponible_10 NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cuota_iva_10 NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS base_imponible_21 NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cuota_iva_21 NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS base_imponible_0_exenta NUMERIC(14,2);

-- Direcciones desglosadas emisor (cuando llega presupuesto recibido)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_via_publica TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_numero TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_codigo_postal TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_municipio TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_provincia TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_codigo_pais TEXT DEFAULT 'ES';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS emisor_nif_iva_intracom TEXT;

-- Forma de pago
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS forma_pago_codigo TEXT;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_forma_pago_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_forma_pago_check
  CHECK (forma_pago_codigo IS NULL OR forma_pago_codigo IN ('01','02','03','04','05','06','07','08'));

-- Certificaciones obra
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS importe_certificado_a_origen NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS importe_certificado_anterior NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS importe_certificado_periodo NUMERIC(14,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS retencion_garantia_porcentaje NUMERIC(5,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS retencion_garantia_importe NUMERIC(14,2);

-- Inmueble (proyecto)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS referencia_catastral TEXT;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_ref_catastral_format;
ALTER TABLE quotes ADD CONSTRAINT quotes_ref_catastral_format
  CHECK (referencia_catastral IS NULL OR LENGTH(referencia_catastral) = 20);

-- Auditoría usuarios
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS usuario_creacion UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS usuario_modificacion UUID;

-- Texto OCR + datos brutos (regla extraer TODO)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS texto_completo TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS datos_brutos JSONB;

-- Índices
CREATE INDEX IF NOT EXISTS idx_quotes_referencia_catastral ON quotes(referencia_catastral) WHERE referencia_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_texto_completo_fts
  ON quotes USING GIN (to_tsvector('spanish', COALESCE(texto_completo, '')));

-- ============================================================================
-- TABLA mortgages (Ley 5/2019 LCCI completa)
-- ============================================================================

ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS numero_prestamo TEXT;

-- Tipo interés
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tipo_interes TEXT;
COMMENT ON COLUMN mortgages.tipo_interes IS 'fijo | variable | mixto';
ALTER TABLE mortgages DROP CONSTRAINT IF EXISTS mortgages_tipo_interes_check;
ALTER TABLE mortgages ADD CONSTRAINT mortgages_tipo_interes_check
  CHECK (tipo_interes IS NULL OR tipo_interes IN ('fijo','variable','mixto'));

ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tipo_referencia TEXT;
COMMENT ON COLUMN mortgages.tipo_referencia IS 'Euribor 12m | Euribor 6m | IRPH | otro';
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS diferencial NUMERIC(5,3);
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS redondeo TEXT;
COMMENT ON COLUMN mortgages.redondeo IS 'cuarto_punto | octavo_punto | mas_proximo | sin_redondeo';

-- Estado actual
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS capital_pendiente NUMERIC(14,2);
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS plazo_total_meses INTEGER;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS plazo_restante_meses INTEGER;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS proximo_revision_tipo DATE;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS fecha_fin_prevista DATE;

-- Comisiones detalladas (LCCI)
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS comision_cancelacion_pct NUMERIC(5,3);
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS comision_amortizacion_anticipada_pct NUMERIC(5,3);
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS comision_modificacion_pct NUMERIC(5,3);
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS comision_subrogacion_pct NUMERIC(5,3);

-- Garantías y vinculaciones
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS garantias JSONB;
COMMENT ON COLUMN mortgages.garantias IS 'jsonb [{tipo: hipoteca/aval, finca_registral, fiador_nif, importe}]';
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS vinculaciones JSONB;
COMMENT ON COLUMN mortgages.vinculaciones IS 'jsonb [{tipo: seguro_vida/seguro_hogar/cuenta_nomina/tarjeta, condicion, descuento_pct}]';

-- Subrogación / novación
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS subrogacion_anterior BOOLEAN DEFAULT FALSE;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS prestamo_anterior_id UUID;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS novaciones_historico JSONB;

-- Documentos
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS escritura_drive_url TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS fein_drive_url TEXT;
COMMENT ON COLUMN mortgages.fein_drive_url IS 'Ficha Europea de Información Normalizada (Ley 5/2019)';
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS fiper_drive_url TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tasacion_drive_url TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tabla_amortizacion_drive_url TEXT;

-- Tasación
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tasacion_importe NUMERIC(14,2);
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tasacion_sociedad TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS tasacion_fecha DATE;

-- Inmueble
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS finca_registral TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS referencia_catastral TEXT;
ALTER TABLE mortgages DROP CONSTRAINT IF EXISTS mortgages_ref_catastral_format;
ALTER TABLE mortgages ADD CONSTRAINT mortgages_ref_catastral_format
  CHECK (referencia_catastral IS NULL OR LENGTH(referencia_catastral) = 20);

-- Estado
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activa';
ALTER TABLE mortgages DROP CONSTRAINT IF EXISTS mortgages_estado_check;
ALTER TABLE mortgages ADD CONSTRAINT mortgages_estado_check
  CHECK (estado IN ('activa','cancelada','subrogada','novada','en_mora'));

-- Auditoría
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS texto_completo TEXT;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS datos_brutos JSONB;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS usuario_creacion UUID;
ALTER TABLE mortgages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mortgages_referencia_catastral ON mortgages(referencia_catastral) WHERE referencia_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mortgages_estado ON mortgages(estado);

-- ============================================================================
-- TABLA documents (campos hot por tipo)
-- ============================================================================

-- Universales (auditoría + extraer todo)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS texto_completo TEXT;
COMMENT ON COLUMN documents.texto_completo IS 'OCR íntegro del documento, sin filtrar.';
-- datos_brutos ya existe en documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS usuario_creacion UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS usuario_modificacion UUID;

-- Hot fields para escrituras
ALTER TABLE documents ADD COLUMN IF NOT EXISTS notario_nombre TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS notario_nif TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS protocolo_numero TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS registro_propiedad TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS finca_registral TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS idufir TEXT;
COMMENT ON COLUMN documents.idufir IS 'Identificador Único de Finca Registral 14 dígitos';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS referencia_catastral TEXT;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_ref_catastral_format;
ALTER TABLE documents ADD CONSTRAINT documents_ref_catastral_format
  CHECK (referencia_catastral IS NULL OR LENGTH(referencia_catastral) = 20);

-- Hot fields para licencias urbanísticas
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expediente_municipal TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ayuntamiento TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS distrito TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tipo_licencia TEXT;
COMMENT ON COLUMN documents.tipo_licencia IS 'obra_mayor | obra_menor | declaracion_responsable | comunicacion_previa | primera_ocupacion | actividad | cambio_uso';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fecha_solicitud_licencia DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fecha_concesion_licencia DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS icio_importe NUMERIC(14,2);
COMMENT ON COLUMN documents.icio_importe IS 'Impuesto Construcciones Instalaciones Obras';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tasa_urbanistica_importe NUMERIC(14,2);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pem_importe NUMERIC(14,2);
COMMENT ON COLUMN documents.pem_importe IS 'Presupuesto Ejecución Material declarado';

-- Hot fields para certificados (CEE, fin obra, primera ocupación, instalaciones)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tecnico_nif TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tecnico_nombre TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tecnico_colegiado_numero TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS numero_registro_autonomico TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tipo_certificado TEXT;
COMMENT ON COLUMN documents.tipo_certificado IS 'cee | fin_obra | primera_ocupacion | instalacion_electrica | instalacion_gas | instalacion_agua | rite | ripci | habitabilidad | otros';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS calificacion_energetica CHAR(1);
COMMENT ON COLUMN documents.calificacion_energetica IS 'A-G según CEE';
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_calif_energ_check;
ALTER TABLE documents ADD CONSTRAINT documents_calif_energ_check
  CHECK (calificacion_energetica IS NULL OR calificacion_energetica IN ('A','B','C','D','E','F','G'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS emision_kgco2_m2 NUMERIC(8,2);

-- Hot fields para seguros
ALTER TABLE documents ADD COLUMN IF NOT EXISTS aseguradora TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS poliza_numero TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS suma_asegurada NUMERIC(14,2);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS prima_anual NUMERIC(14,2);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vigencia_inicio DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vigencia_fin DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tipo_seguro TEXT;
COMMENT ON COLUMN documents.tipo_seguro IS 'decenal_loe | rc_profesional | rc_empresa | trc | hogar | comunidad | vida | salud | otros';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS beneficiario TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS franquicia NUMERIC(14,2);

-- Hot fields para contratos privados
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contrato_tipo TEXT;
COMMENT ON COLUMN documents.contrato_tipo IS 'compraventa_privada | arras | señal | arrendamiento | prestacion_servicios | subcontrata | mandato | exclusividad | otros';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contrato_partes JSONB;
COMMENT ON COLUMN documents.contrato_partes IS 'jsonb [{rol, nif, nombre, %_participacion}]';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contrato_importe_principal NUMERIC(14,2);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS contrato_arras_tipo TEXT;
COMMENT ON COLUMN documents.contrato_arras_tipo IS 'penitenciales | confirmatorias | penales | señal';

-- Plazo conservación obligatorio
ALTER TABLE documents ADD COLUMN IF NOT EXISTS conservacion_hasta DATE;
COMMENT ON COLUMN documents.conservacion_hasta IS 'Fecha hasta la cual el documento debe conservarse legalmente. Calculable según tipo: 4y fiscal, 6y CCom, 10y LOE, 25y cédula, etc.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_documents_referencia_catastral ON documents(referencia_catastral) WHERE referencia_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_finca_registral ON documents(finca_registral) WHERE finca_registral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_protocolo_numero ON documents(protocolo_numero) WHERE protocolo_numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_expediente_municipal ON documents(expediente_municipal) WHERE expediente_municipal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_poliza_numero ON documents(poliza_numero) WHERE poliza_numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_vigencia_fin ON documents(vigencia_fin) WHERE vigencia_fin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tipo_certificado ON documents(tipo_certificado) WHERE tipo_certificado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tipo_licencia ON documents(tipo_licencia) WHERE tipo_licencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tipo_seguro ON documents(tipo_seguro) WHERE tipo_seguro IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_texto_completo_fts
  ON documents USING GIN (to_tsvector('spanish', COALESCE(texto_completo, '')));

NOTIFY pgrst, 'reload schema';
