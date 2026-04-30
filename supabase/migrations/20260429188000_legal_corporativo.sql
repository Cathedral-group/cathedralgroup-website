-- ============================================================================
-- Migración: Legal y Corporativo · Fase 1.G
-- Fecha: 2026-04-29
-- Tablas:
--   - corporate_documents (Cathedral: escrituras, actas, poderes, estatutos)
--   - legal_proceedings (demandas, sentencias, recursos, requerimientos)
--   - notarial_acts (actas notariales operativas: requerimientos, presencias)
-- ============================================================================

-- ============================================================================
-- corporate_documents (documentación de la propia sociedad Cathedral)
-- ============================================================================
CREATE TABLE IF NOT EXISTS corporate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'escritura_constitucion','estatutos','modificacion_estatutos','escritura_ampliacion_capital',
    'escritura_reduccion_capital','escritura_disolucion','escritura_fusion','escritura_escision',
    'modelo_036','modelo_037','inscripcion_registro_mercantil',
    'cuentas_anuales','informe_auditoria','memoria',
    'acta_junta_general','acta_consejo_administracion','acta_administrador_unico',
    'poder_notarial','revocacion_poder','nombramiento_administrador','cese_administrador',
    'certificado_corriente_aeat','certificado_corriente_ss','certificado_iae',
    'pacto_socios','pacto_parasocial','contrato_socios',
    'libro_actas','libro_diario','libro_mayor','libro_socios','libro_acciones_nominativas',
    'modelo_prevencion_penal','plan_igualdad','politica_blanqueo','protocolo_lopd',
    'whistleblowing_canal_designacion','dpd_designacion',
    'otros'
  )),

  -- Identificación
  titulo TEXT NOT NULL,
  numero_documento TEXT,
  -- Número de protocolo, modelo, certificado, etc.
  fecha_documento DATE NOT NULL,
  fecha_inscripcion DATE,
  -- Fecha inscripción Registro Mercantil si aplica
  fecha_efectos DATE,
  fecha_vigencia_hasta DATE,

  -- Notario / Registro (si aplica)
  notario_nombre TEXT,
  notario_nif TEXT,
  protocolo_numero TEXT,
  protocolo_year INTEGER,
  registro_mercantil TEXT,
  hoja_registral TEXT,
  inscripcion_numero TEXT,
  tomo TEXT,
  folio TEXT,

  -- Datos económicos (si aplica: capital, ampliación, etc.)
  importe_principal NUMERIC(14,2),
  capital_social NUMERIC(14,2),
  num_socios INTEGER,
  socios_detalle JSONB,
  -- jsonb [{nif, nombre, %_capital, num_acciones}]

  -- Para actas
  asistentes JSONB,
  -- jsonb [{nif, nombre, rol: presidente|secretario|administrador|socio, %_voto}]
  acuerdos_aprobados JSONB,
  -- jsonb [{texto, votos_favor, votos_contra, abstenciones}]
  presidente_nif TEXT,
  secretario_nif TEXT,

  -- Para poderes
  apoderado_nif TEXT,
  apoderado_nombre TEXT,
  facultades JSONB,
  -- jsonb [texto1, texto2, ...]
  fecha_revocacion DATE,

  -- Para certificados
  emitido_por TEXT,
  csv_verificacion TEXT,

  -- Documento físico
  drive_url TEXT,
  drive_file_id TEXT,
  original_filename TEXT,
  file_hash TEXT,

  -- Conservación obligatoria
  conservacion_hasta DATE,
  -- Cuentas anuales/libros: 6 años (CCom 30)
  -- Escrituras: indefinido (notario las conserva 25 años + Archivo General Notariado)
  -- Modelo prevención penal: indefinido mientras vigente
  permanente BOOLEAN DEFAULT FALSE,

  -- Origen
  source TEXT DEFAULT 'manual',
  email_message_id TEXT,
  email_account TEXT,

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,
  ai_confidence NUMERIC(4,2),
  needs_review BOOLEAN DEFAULT FALSE,

  -- Auditoría
  estado TEXT DEFAULT 'vigente'
    CHECK (estado IN ('borrador','firmado','vigente','superado','revocado','archivado')),
  notes TEXT,
  usuario_creacion UUID,
  usuario_modificacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_corp_doc_type ON corporate_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_corp_doc_estado ON corporate_documents(estado);
CREATE INDEX IF NOT EXISTS idx_corp_doc_fecha ON corporate_documents(fecha_documento DESC);
CREATE INDEX IF NOT EXISTS idx_corp_doc_apoderado ON corporate_documents(apoderado_nif) WHERE apoderado_nif IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corp_doc_protocolo ON corporate_documents(protocolo_numero, protocolo_year);
CREATE INDEX IF NOT EXISTS idx_corp_doc_texto_fts
  ON corporate_documents USING GIN (to_tsvector('spanish', COALESCE(texto_completo, '')));

COMMENT ON TABLE corporate_documents IS
  'Documentación corporativa de Cathedral House Investment SL: escrituras, estatutos, actas, poderes, cuentas anuales, certificados al corriente, etc.';

-- ============================================================================
-- legal_proceedings (procedimientos jurídicos / contenciosos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_proceedings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación
  procedimiento_codigo TEXT,
  -- Numeración interna
  procedimiento_numero_externo TEXT,
  -- Número de procedimiento del juzgado / administración
  jurisdiccion TEXT,
  -- civil | penal | contencioso_administrativo | social | mercantil | constitucional | europeo
  organo TEXT,
  -- Juzgado, sala, tribunal concreto: "Juzgado de Primera Instancia nº 5 de Madrid"
  ciudad_juzgado TEXT,

  -- Tipo
  tipo_procedimiento TEXT,
  -- demanda | monitorio | desahucio | recurso_administrativo | recurso_judicial |
  -- denuncia_inspeccion | requerimiento | concursal | hereditario | embargo |
  -- procedimiento_urbanistico | reclamacion_plusvalia | reclamacion_ibi | otros

  -- Cathedral como parte
  cathedral_role TEXT NOT NULL CHECK (cathedral_role IN ('demandante','demandado','recurrente','recurrida','tercero_interesado','denunciante','denunciada')),

  -- Otra parte
  parte_contraria_nif TEXT,
  parte_contraria_nombre TEXT,
  parte_contraria_letrado TEXT,
  parte_contraria_procurador TEXT,

  -- Cathedral letrado
  letrado_propio_nombre TEXT,
  letrado_propio_nif TEXT,
  letrado_propio_colegiado_numero TEXT,
  procurador_propio_nombre TEXT,

  -- Económico
  cuantia_demandada NUMERIC(14,2),
  cuantia_resolucion NUMERIC(14,2),
  costas_estimadas NUMERIC(14,2),
  -- Provision a cubrir si pierde

  -- Inmueble objeto (si aplica)
  inmueble_referencia_catastral TEXT,
  inmueble_finca_registral TEXT,
  inmueble_direccion TEXT,

  -- Vinculaciones
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  flipping_operation_id UUID REFERENCES flipping_operations(id) ON DELETE SET NULL,
  rental_contract_id UUID REFERENCES rental_contracts(id) ON DELETE SET NULL,

  -- Fechas
  fecha_inicio DATE,
  fecha_admision DATE,
  fecha_vista DATE,
  fecha_sentencia DATE,
  fecha_firmeza DATE,
  fecha_ejecucion DATE,

  -- Resolución
  resultado TEXT,
  -- ganado | perdido | parcial | desistido | transado | archivado | recurrido
  recurrido BOOLEAN DEFAULT FALSE,
  recurso_proceeding_id UUID REFERENCES legal_proceedings(id) ON DELETE SET NULL,
  -- Auto-referencial: el procedimiento del recurso vincula al original

  -- Estado actual
  estado TEXT DEFAULT 'en_tramite'
    CHECK (estado IN ('preparacion','en_tramite','suspendido','resuelto_firme','resuelto_recurrido','archivado','desistido')),
  proxima_actuacion TEXT,
  proxima_actuacion_fecha DATE,

  -- Documentos
  documentos JSONB,
  -- jsonb [{tipo: demanda/contestacion/sentencia/recurso/auto, fecha, drive_url}]
  drive_folder_url TEXT,

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_legal_estado ON legal_proceedings(estado);
CREATE INDEX IF NOT EXISTS idx_legal_role ON legal_proceedings(cathedral_role);
CREATE INDEX IF NOT EXISTS idx_legal_proxima_actuacion ON legal_proceedings(proxima_actuacion_fecha) WHERE estado='en_tramite';
CREATE INDEX IF NOT EXISTS idx_legal_project_id ON legal_proceedings(project_id);
CREATE INDEX IF NOT EXISTS idx_legal_parte_contraria_nif ON legal_proceedings(parte_contraria_nif);

-- ============================================================================
-- notarial_acts (actas notariales operativas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notarial_acts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo de acta
  tipo_acta TEXT NOT NULL CHECK (tipo_acta IN (
    'requerimiento','presencia','notificacion','depósito','protocolización',
    'manifestación','referencia','exhibición_documental','remision_burofax',
    'subasta','otros'
  )),

  -- Notario
  notario_nombre TEXT,
  notario_nif TEXT,
  notario_localidad TEXT,
  protocolo_numero TEXT,
  protocolo_year INTEGER,
  fecha_acta DATE NOT NULL,

  -- Solicitante / requerido
  solicitante_nif TEXT,
  solicitante_nombre TEXT,
  requerido_nif TEXT,
  requerido_nombre TEXT,
  requerido_direccion TEXT,

  -- Objeto
  objeto_resumen TEXT,
  importe_relacionado NUMERIC(14,2),

  -- Vinculaciones
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  legal_proceeding_id UUID REFERENCES legal_proceedings(id) ON DELETE SET NULL,
  rental_contract_id UUID REFERENCES rental_contracts(id) ON DELETE SET NULL,
  arras_id UUID REFERENCES arras_contracts(id) ON DELETE SET NULL,

  -- Documento
  drive_url TEXT,
  drive_file_id TEXT,
  file_hash TEXT,

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
CREATE INDEX IF NOT EXISTS idx_notarial_tipo ON notarial_acts(tipo_acta);
CREATE INDEX IF NOT EXISTS idx_notarial_protocolo ON notarial_acts(protocolo_numero, protocolo_year);
CREATE INDEX IF NOT EXISTS idx_notarial_project_id ON notarial_acts(project_id);
CREATE INDEX IF NOT EXISTS idx_notarial_requerido_nif ON notarial_acts(requerido_nif);

NOTIFY pgrst, 'reload schema';
