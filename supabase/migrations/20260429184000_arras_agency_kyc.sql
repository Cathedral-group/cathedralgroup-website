-- ============================================================================
-- Migración: Inmobiliario operativo · Fase 1.C
-- Fecha: 2026-04-29
-- Tablas nuevas:
--   - arras_contracts (contratos de arras / señal pre-escritura)
--   - agency_commissions (comisiones agencias inmobiliarias pagadas/cobradas)
--   - kyc_documents (Ley 10/2010 prevención blanqueo, KYC compradores)
-- ============================================================================

-- ============================================================================
-- arras_contracts (CC art. 1454 + 1124)
-- ============================================================================
CREATE TABLE IF NOT EXISTS arras_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo
  tipo TEXT NOT NULL CHECK (tipo IN ('penitenciales','confirmatorias','penales','señal')),

  -- Partes
  comprador_party_type TEXT,
  comprador_nif TEXT,
  comprador_nombre TEXT,
  vendedor_party_type TEXT,
  vendedor_nif TEXT,
  vendedor_nombre TEXT,
  intermediario_agencia TEXT,

  -- Inmueble
  inmueble_direccion TEXT,
  inmueble_municipio TEXT,
  inmueble_provincia TEXT,
  inmueble_codigo_postal TEXT,
  referencia_catastral TEXT,
  finca_registral TEXT,
  registro_propiedad TEXT,

  -- Económico
  importe_operacion_total NUMERIC(14,2) NOT NULL,
  importe_arras NUMERIC(14,2) NOT NULL,
  porcentaje_sobre_operacion NUMERIC(5,2),
  forma_pago_codigo TEXT CHECK (forma_pago_codigo IS NULL OR forma_pago_codigo IN ('01','02','03','04','05','06','07','08')),
  iban_destino TEXT,
  iban_origen TEXT,

  -- Fechas
  fecha_firma DATE NOT NULL,
  fecha_pago_arras DATE,
  fecha_limite_escritura DATE,
  fecha_efectiva_escritura DATE,

  -- Estado
  estado TEXT DEFAULT 'vigente'
    CHECK (estado IN ('vigente','cumplido','rescindido_comprador','rescindido_vendedor','prorrogado','vencido')),
  causa_rescision TEXT,
  importe_devuelto NUMERIC(14,2),
  importe_doblado NUMERIC(14,2),
  -- En arras penitenciales: si comprador desiste, pierde arras (importe_doblado=0);
  -- si vendedor desiste, devuelve duplicado (importe_doblado=2x importe_arras).

  -- Vinculaciones
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  flipping_operation_id UUID REFERENCES flipping_operations(id) ON DELETE SET NULL,
  escritura_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Documento original
  drive_url TEXT,
  drive_file_id TEXT,
  original_filename TEXT,
  file_hash TEXT,

  -- Origen email automatico
  source TEXT DEFAULT 'manual',
  email_message_id TEXT,
  email_account TEXT,

  -- Extracción IA
  ai_confidence NUMERIC(4,2),
  ai_razones TEXT[],
  needs_review BOOLEAN DEFAULT FALSE,
  review_status TEXT DEFAULT 'pendiente',

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  usuario_modificacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_arras_estado ON arras_contracts(estado);
CREATE INDEX IF NOT EXISTS idx_arras_fecha_limite ON arras_contracts(fecha_limite_escritura) WHERE estado='vigente';
CREATE INDEX IF NOT EXISTS idx_arras_referencia_catastral ON arras_contracts(referencia_catastral) WHERE referencia_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arras_project_id ON arras_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_arras_flipping_op ON arras_contracts(flipping_operation_id);

COMMENT ON TABLE arras_contracts IS
  'Contratos de arras/señal pre-escritura. CC art. 1454 (penitenciales: pueden desistirse perdiendo arras / duplicándolas), art. 1124 (confirmatorias: ejecutables forzosamente). Imprescindibles para flipping y promoción.';

-- ============================================================================
-- agency_commissions (comisiones agencias inmobiliarias)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dirección
  direccion TEXT NOT NULL CHECK (direccion IN ('pagada','cobrada')),
  -- pagada = Cathedral paga a una agencia (típico: comisión por venta de piso)
  -- cobrada = Cathedral cobra (intermedia entre vendedor y comprador)

  -- Agencia
  agencia_nif TEXT,
  agencia_nombre TEXT NOT NULL,
  agencia_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  agencia_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  agente_responsable TEXT,
  agente_telefono TEXT,
  agente_email TEXT,

  -- Inmueble objeto
  inmueble_direccion TEXT,
  referencia_catastral TEXT,
  finca_registral TEXT,

  -- Operación
  comprador_nif TEXT,
  comprador_nombre TEXT,
  vendedor_nif TEXT,
  vendedor_nombre TEXT,
  importe_operacion NUMERIC(14,2),

  -- Comisión económica
  porcentaje_comision NUMERIC(5,3),
  importe_neto NUMERIC(14,2) NOT NULL,
  iva_pct NUMERIC(4,2) DEFAULT 21.00,
  iva_importe NUMERIC(14,2),
  importe_total NUMERIC(14,2),

  -- Fechas
  fecha_devengo DATE,
  fecha_factura DATE,
  fecha_pago DATE,

  -- Vinculaciones
  factura_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  contrato_exclusividad_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  arras_id UUID REFERENCES arras_contracts(id) ON DELETE SET NULL,
  flipping_operation_id UUID REFERENCES flipping_operations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Tipo de operación
  tipo_operacion TEXT,
  -- venta | alquiler | gestion | tasacion | otros
  exclusividad BOOLEAN DEFAULT FALSE,
  duracion_exclusividad_dias INTEGER,
  -- Modelo 347 trigger
  computa_347 BOOLEAN DEFAULT TRUE,

  -- Documento
  drive_url TEXT,
  file_hash TEXT,
  source TEXT DEFAULT 'manual',
  email_message_id TEXT,

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,
  ai_confidence NUMERIC(4,2),
  needs_review BOOLEAN DEFAULT FALSE,

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agency_comm_direccion ON agency_commissions(direccion);
CREATE INDEX IF NOT EXISTS idx_agency_comm_agencia_nif ON agency_commissions(agencia_nif);
CREATE INDEX IF NOT EXISTS idx_agency_comm_factura_id ON agency_commissions(factura_id);
CREATE INDEX IF NOT EXISTS idx_agency_comm_referencia_catastral ON agency_commissions(referencia_catastral);

COMMENT ON TABLE agency_commissions IS
  'Comisiones de agencias inmobiliarias (Engel & Völkers, Lucas Fox, Idealista, particulares). Pagadas o cobradas. Vinculadas a la operación + factura.';

-- ============================================================================
-- kyc_documents (Ley 10/2010 prevención blanqueo capitales)
-- ============================================================================
-- Cathedral, como sujeto obligado del art. 2 Ley 10/2010 (al ser inmobiliaria
-- + actividades >100k€), debe identificar y diligenciar a clientes en operaciones
-- de compraventa, alquiler temporal, etc. Conservación obligatoria 10 años.
-- ============================================================================
CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Persona objeto del KYC
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  party_nif TEXT NOT NULL,
  party_nombre TEXT NOT NULL,
  party_apellidos TEXT,
  party_es_persona_fisica BOOLEAN DEFAULT TRUE,
  party_fecha_nacimiento DATE,
  party_pais_nacimiento TEXT,
  party_pais_residencia_fiscal TEXT,
  party_nacionalidad TEXT,
  party_profesion TEXT,
  party_actividad_economica TEXT,

  -- Tipo de documento
  tipo_documento TEXT NOT NULL,
  -- dni | nie | pasaporte | vida_laboral | certificado_origen_fondos |
  -- declaracion_pep | declaracion_blanqueo | acta_notarial | escritura_apoderamiento
  numero_documento TEXT,
  fecha_expedicion DATE,
  fecha_caducidad DATE,
  pais_emision TEXT DEFAULT 'ES',
  entidad_emisora TEXT,

  -- Diligencia y verificación
  nivel_verificacion TEXT DEFAULT 'basica'
    CHECK (nivel_verificacion IN ('basica','simplificada','reforzada','no_aplica')),
  -- Reforzada (art. 11): PEPs, países alto riesgo, transacciones complejas, etc.
  -- Simplificada (art. 9): bajo riesgo
  pep BOOLEAN DEFAULT FALSE,
  -- Persona Expuesta Políticamente (art. 14)
  pep_motivo TEXT,
  pep_familiar_directo BOOLEAN DEFAULT FALSE,
  pep_allegado BOOLEAN DEFAULT FALSE,
  titular_real BOOLEAN DEFAULT TRUE,
  titular_real_nif TEXT,
  -- Si la persona es testaferro, NIF del verdadero titular
  titular_real_nombre TEXT,
  porcentaje_titularidad NUMERIC(5,2),

  -- Origen de fondos (Ley 10/2010 art. 10)
  origen_fondos TEXT,
  -- ahorros | venta_inmueble_anterior | hipoteca | herencia | actividad_empresarial | sueldo | otros
  procedencia_paises TEXT[],
  pais_alto_riesgo BOOLEAN DEFAULT FALSE,

  -- Operación a la que aplica
  operacion_tipo TEXT,
  -- compraventa | alquiler | gestion | otros
  importe_operacion NUMERIC(14,2),
  arras_id UUID REFERENCES arras_contracts(id) ON DELETE SET NULL,
  escritura_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  flipping_operation_id UUID REFERENCES flipping_operations(id) ON DELETE SET NULL,

  -- Verificación interna
  verificado_por_user_id UUID,
  fecha_verificacion DATE,
  resultado_diligencia TEXT
    CHECK (resultado_diligencia IS NULL OR resultado_diligencia IN ('aceptado','rechazado','requiere_info_adicional','en_revision','sospecha_blanqueo')),
  motivo_rechazo TEXT,
  comunicacion_sepblac BOOLEAN DEFAULT FALSE,
  -- SEPBLAC: Servicio Ejecutivo de la Comisión de Prevención del Blanqueo
  fecha_comunicacion_sepblac DATE,
  numero_comunicacion_sepblac TEXT,

  -- Documento físico
  drive_url TEXT,
  drive_file_id TEXT,
  file_hash TEXT,

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,
  ai_confidence NUMERIC(4,2),
  needs_review BOOLEAN DEFAULT FALSE,

  -- GDPR (estos datos son sensibles)
  consentimiento_gdpr_fecha TIMESTAMPTZ,
  consentimiento_finalidad TEXT DEFAULT 'KYC Ley 10/2010 prevención blanqueo',
  base_legitimacion TEXT DEFAULT 'obligacion_legal',

  -- Conservación obligatoria 10 años (Ley 10/2010 art. 25)
  conservacion_hasta DATE,

  -- Origen
  source TEXT DEFAULT 'manual',
  email_message_id TEXT,

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  usuario_modificacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kyc_party_nif ON kyc_documents(party_nif);
CREATE INDEX IF NOT EXISTS idx_kyc_pep ON kyc_documents(pep) WHERE pep=TRUE;
CREATE INDEX IF NOT EXISTS idx_kyc_pais_alto_riesgo ON kyc_documents(pais_alto_riesgo) WHERE pais_alto_riesgo=TRUE;
CREATE INDEX IF NOT EXISTS idx_kyc_resultado ON kyc_documents(resultado_diligencia);
CREATE INDEX IF NOT EXISTS idx_kyc_arras_id ON kyc_documents(arras_id);
CREATE INDEX IF NOT EXISTS idx_kyc_escritura_id ON kyc_documents(escritura_document_id);

COMMENT ON TABLE kyc_documents IS
  'KYC compradores/vendedores Ley 10/2010 prevención blanqueo. Sujetos obligados art. 2: inmobiliarias en operaciones >100k€. Conservación 10 años. Sanciones >3M€ por incumplimiento.';

NOTIFY pgrst, 'reload schema';
