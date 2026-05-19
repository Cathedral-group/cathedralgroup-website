-- ============================================================================
-- Migración: Multi-doc_type schema Cathedral Group
-- Fecha: 2026-05-20
-- Sesión: Diseño schema completo 19 doc_types pipeline n8n
--
-- POR QUÉ ESTA MIGRACIÓN EXISTE
--   El pipeline n8n procesa 19 doc_types (factura, nomina, contrato, nota_simple,
--   escritura, licencia, certificacion_obra, certificado, informe, seguro,
--   modelo_fiscal, justificante_pago, albaran, presupuesto, ticket, proforma,
--   rectificativa, abono, otro) pero la BD sólo tiene una tabla destino:
--   `invoices`. Resultado: nóminas, escrituras, contratos, notas simples...
--   todos caen como invoices con 80 % de campos NULL. Pérdida de información
--   estructural + queries imposibles ("dame todas las notas simples del Q1").
--
--   Esta migración crea las tablas faltantes con campos específicos por
--   doc_type, manteniendo el contrato multi-empresa (company_id NOT NULL +
--   RLS+FORCE) y el patrón Verifactu (file_hash SHA-256 dedup + audit chain).
--
-- TABLAS YA EXISTENTES (no se tocan, se enriquecen vía documents_registry)
--   - invoices         → factura/proforma/rectificativa/abono/ticket (refinada)
--   - payrolls         → nomina (ya con 80+ campos en migración 20260426190000)
--   - employees, projects, parties, suppliers/clients (refs FK)
--   - companies, audit_log_chain (Bloque 0 F1)
--
-- TABLAS NUEVAS (13 principales + 7 children 1:N)
--   1. contratos                 + contrato_partes
--   2. notas_simples             + nota_simple_titulares + nota_simple_cargas
--   3. escrituras                + escritura_otorgantes
--   4. licencias                 + licencia_condiciones
--   5. certificaciones_obra      (con retención 5% LOE)
--   6. certificados              (registral/energético/habitabilidad/técnico)
--   7. informes                  (tasación/pericial/valoración)
--   8. seguros                   (póliza decenal/RC/hogar)
--   9. modelos_fiscales          + modelo_fiscal_contrapartes (347)
--  10. justificantes_pago
--  11. albaranes                 + albaran_lineas
--  12. presupuestos              + presupuesto_lineas
--  13. documentos_otros          (fallback genérico)
--
--   + documents_registry        (vista materializada cross-doc-type)
--
-- DECISIONES DE DISEÑO
--   - Tabla por doc_type (no JSONB único) → permite indexes específicos
--     + reporting fiscal + constraints reales (CHECK, FK) + UI tipo-aware.
--   - documents_registry = vista materializada para búsqueda global, no
--     tabla puente con FK polimórficas (las polimórficas no soportan FK).
--   - Children 1:N en tablas separadas (no JSONB) para queries como
--     "dame todos los titulares de notas simples con NIF X".
--   - file_hash UNIQUE per company (no global) — la misma factura puede ser
--     compartida entre dos SLs del grupo legítimamente.
--   - Triggers reaprovechan bloque0_set_updated_at() ya existente (F1).
--   - ai_data JSONB preserva extracción cruda del LLM por reprocesado.
--   - review_status ENUM-like con CHECK (no ENUM real para flexibilidad).
--
-- ORDEN DE CREACIÓN
--   1. Tipos auxiliares / dominios (ninguno aquí, usamos CHECK)
--   2. Tablas padre (sin FK entre nuevas tablas)
--   3. Tablas hijas (FK a sus padres)
--   4. Indexes
--   5. RLS + policies
--   6. Triggers updated_at
--   7. GRANT / REVOKE
--   8. documents_registry vista materializada + refresh fn
--   9. COMMENT ON
--
-- POSTDEPLOY CHECKLIST (al final del archivo)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. HELPERS
-- ============================================================================
-- Verificamos que las funciones esperadas existen (no recreamos).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'bloque0_set_updated_at'
  ) THEN
    RAISE EXCEPTION 'Falta función bloque0_set_updated_at(). Aplicar primero la migración 20260510140000_bloque_0_f1_multiempresa_schema.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'companies'
  ) THEN
    RAISE EXCEPTION 'Falta tabla companies. Aplicar primero Bloque 0 F1.';
  END IF;
END $$;

-- Cathedral SL UUID fijo (para defaults durante backfill)
-- '00000000-0000-0000-0000-cca7ed1a1000'

-- ============================================================================
-- 1. CONTRATOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación del contrato
  tipo_contrato TEXT NOT NULL CHECK (tipo_contrato IN (
    'arrendamiento_local','arrendamiento_vivienda','arrendamiento_garaje',
    'compraventa','obra','servicios','laboral','suministro',
    'confidencialidad','prestamo','factoring','renting','leasing','otro'
  )),
  numero_contrato TEXT,                         -- Referencia interna o externa
  objeto TEXT,                                  -- Resumen libre del objeto

  -- Fechas clave
  fecha_firma DATE,
  fecha_inicio DATE,
  fecha_fin DATE,                               -- NULL = indefinido
  duracion_meses INT,
  preaviso_dias INT,
  prorroga_automatica BOOLEAN DEFAULT false,
  fecha_proxima_revision DATE,

  -- Económicos
  importe_total NUMERIC(15,2),
  importe_periodico NUMERIC(15,2),
  periodicidad TEXT CHECK (periodicidad IN ('mensual','trimestral','semestral','anual','unico','otro') OR periodicidad IS NULL),
  moneda TEXT NOT NULL DEFAULT 'EUR',
  fianza NUMERIC(15,2),
  iva_pct NUMERIC(5,2),

  -- Vinculaciones
  property_id UUID,                             -- properties(id) si es arrendamiento/compraventa
  project_id UUID,                              -- projects(id) si es contrato de obra
  party_id UUID REFERENCES parties(id),         -- contraparte principal

  -- Cláusulas especiales (texto plano + flags rápidos)
  clausula_indexacion BOOLEAN DEFAULT false,    -- IPC o similar
  indice_referencia TEXT,                       -- 'IPC','IPC_VIVIENDA','EURIBOR','otro'
  clausula_penalizacion BOOLEAN DEFAULT false,
  clausula_renuncia_iva BOOLEAN DEFAULT false,  -- arrendamientos exentos

  -- Estado
  estado TEXT NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('borrador','vigente','suspendido','resuelto','vencido','cancelado')),

  -- Común OCR / AI
  ai_provider TEXT,                              -- 'gemini','openai','mistral','manual'
  ai_confidence NUMERIC(4,3),                    -- 0.000..1.000
  ai_data JSONB,                                 -- extracción cruda
  file_hash TEXT,                                -- SHA-256 del original
  original_filename TEXT,
  storage_path TEXT,                             -- Supabase Storage path
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  -- Auditoría temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS contrato_partes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Rol en el contrato
  rol TEXT NOT NULL CHECK (rol IN (
    'arrendador','arrendatario','comprador','vendedor','prestamista',
    'prestatario','contratista','contratante','fiador','avalista','testigo','otro'
  )),

  -- Identificación (la party_id es preferida, pero permitimos extracción cruda)
  party_id UUID REFERENCES parties(id),
  nombre TEXT NOT NULL,
  nif TEXT,
  domicilio TEXT,
  representado_por TEXT,                          -- si firma un apoderado

  porcentaje NUMERIC(5,2),                        -- co-titularidades
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. NOTAS SIMPLES (Registro de la Propiedad)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notas_simples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación registral
  registro_propiedad TEXT,                       -- 'Madrid nº 30'
  numero_finca TEXT,                              -- 'Finca 12345'
  tomo TEXT,
  libro TEXT,
  folio TEXT,
  idufir TEXT,                                    -- Identificador Único de Finca Registral
  referencia_catastral TEXT,

  -- Finca
  descripcion_finca TEXT,
  tipo_finca TEXT CHECK (tipo_finca IN (
    'urbana','rustica','solar','edificio','vivienda','local','garaje',
    'trastero','oficina','nave_industrial','otro'
  ) OR tipo_finca IS NULL),
  superficie_construida_m2 NUMERIC(10,2),
  superficie_util_m2 NUMERIC(10,2),
  superficie_parcela_m2 NUMERIC(10,2),
  cuota_participacion NUMERIC(7,4),               -- coeficiente en horizontal

  -- Dirección
  direccion_completa TEXT,
  codigo_postal TEXT,
  municipio TEXT,
  provincia TEXT,
  pais TEXT DEFAULT 'ES',

  -- Datos de la nota
  fecha_expedicion DATE,
  fecha_vigencia DATE,                            -- referencia temporal de la situación registral
  registrador TEXT,
  cuotas_pendientes_registro NUMERIC(15,2),

  -- Vinculaciones
  property_id UUID,                               -- properties(id)
  party_principal_id UUID REFERENCES parties(id), -- titular dominante si aplica

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS nota_simple_titulares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_simple_id UUID NOT NULL REFERENCES notas_simples(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  party_id UUID REFERENCES parties(id),
  nombre TEXT NOT NULL,
  nif TEXT,
  estado_civil TEXT,
  regimen_economico TEXT,                         -- 'gananciales','separacion_bienes',etc

  porcentaje_titularidad NUMERIC(7,4),            -- 100.0000 = pleno dominio total
  tipo_titularidad TEXT CHECK (tipo_titularidad IN (
    'pleno_dominio','nuda_propiedad','usufructo','derecho_uso','otro'
  ) OR tipo_titularidad IS NULL),
  titulo_adquisicion TEXT,                        -- 'compraventa','herencia',etc
  fecha_inscripcion DATE,
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nota_simple_cargas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_simple_id UUID NOT NULL REFERENCES notas_simples(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  tipo_carga TEXT NOT NULL CHECK (tipo_carga IN (
    'hipoteca','embargo','servidumbre','afeccion_fiscal','condicion_resolutoria',
    'arrendamiento','censo','prohibicion_disponer','anotacion_preventiva','otro'
  )),
  descripcion TEXT,
  acreedor TEXT,                                  -- entidad bancaria, AEAT, etc.
  importe NUMERIC(15,2),
  saldo_pendiente NUMERIC(15,2),
  fecha_constitucion DATE,
  fecha_vencimiento DATE,
  cancelada BOOLEAN NOT NULL DEFAULT false,
  fecha_cancelacion DATE,
  asiento TEXT,                                   -- número de asiento registral
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. ESCRITURAS (notariales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS escrituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación notarial
  numero_protocolo TEXT,
  notario_nombre TEXT,
  notario_nif TEXT,
  notaria_municipio TEXT,
  fecha_otorgamiento DATE,

  -- Naturaleza
  tipo_escritura TEXT NOT NULL CHECK (tipo_escritura IN (
    'compraventa','hipoteca','novacion','cancelacion_hipoteca','prestamo',
    'poder','revocacion_poder','constitucion_sociedad','ampliacion_capital',
    'reduccion_capital','disolucion','fusion','escision','herencia',
    'donacion','aceptacion_herencia','testamento','obra_nueva','division_horizontal',
    'segregacion','agrupacion','permuta','aportacion_no_dineraria','otro'
  )),

  -- Económicos
  importe_principal NUMERIC(15,2),
  base_imponible NUMERIC(15,2),
  itp_pct NUMERIC(5,2),
  itp_importe NUMERIC(15,2),
  ajd_pct NUMERIC(5,2),
  ajd_importe NUMERIC(15,2),
  iva_pct NUMERIC(5,2),
  iva_importe NUMERIC(15,2),
  honorarios_notario NUMERIC(15,2),
  honorarios_registro NUMERIC(15,2),
  total_gastos NUMERIC(15,2),

  -- Hipoteca (si aplica)
  hipoteca_acreedor TEXT,
  hipoteca_capital NUMERIC(15,2),
  hipoteca_tipo_interes NUMERIC(7,4),
  hipoteca_plazo_meses INT,
  hipoteca_cuota NUMERIC(15,2),

  -- Inmueble objeto (si aplica)
  property_id UUID,
  referencia_catastral TEXT,
  finca_registral TEXT,
  registro_propiedad TEXT,

  -- Inscripción
  fecha_inscripcion_registro DATE,
  inscripcion_asiento TEXT,

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS escritura_otorgantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escritura_id UUID NOT NULL REFERENCES escrituras(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  rol TEXT NOT NULL CHECK (rol IN (
    'comprador','vendedor','hipotecante','acreedor_hipotecario',
    'donante','donatario','heredero','causante','testador','poderdante',
    'apoderado','socio_constituyente','liquidador','administrador','testigo','otro'
  )),
  party_id UUID REFERENCES parties(id),
  nombre TEXT NOT NULL,
  nif TEXT,
  estado_civil TEXT,
  regimen_economico TEXT,
  representado_por TEXT,
  porcentaje NUMERIC(5,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. LICENCIAS (administrativas urbanísticas / actividad / obra)
-- ============================================================================
CREATE TABLE IF NOT EXISTS licencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación administrativa
  organismo_emisor TEXT,                          -- 'Ayto. Madrid', 'CCAA Madrid'
  numero_expediente TEXT,
  numero_licencia TEXT,
  fecha_solicitud DATE,
  fecha_concesion DATE,
  fecha_inicio_validez DATE,
  fecha_caducidad DATE,

  -- Tipo
  tipo_licencia TEXT NOT NULL CHECK (tipo_licencia IN (
    'obra_mayor','obra_menor','derribo','primera_ocupacion','actividad',
    'apertura','funcionamiento','urbanistica','segregacion','parcelacion',
    'declaracion_responsable','comunicacion_previa','medio_ambiente','otro'
  )),

  -- Económicos
  importe_tasa NUMERIC(15,2),
  importe_icio NUMERIC(15,2),                     -- Impuesto Construcciones Instalaciones Obras
  total_pagado NUMERIC(15,2),

  -- Vinculaciones
  property_id UUID,
  project_id UUID,                                -- projects(id)

  -- Descripción
  objeto TEXT,
  superficie_intervencion_m2 NUMERIC(10,2),

  -- Estado
  estado TEXT NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('solicitada','concedida','vigente','denegada','caducada','revocada','renovada')),

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS licencia_condiciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licencia_id UUID NOT NULL REFERENCES licencias(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  tipo_condicion TEXT,                            -- 'plazo','tecnica','economica','urbanistica','otra'
  descripcion TEXT NOT NULL,
  cumplida BOOLEAN NOT NULL DEFAULT false,
  fecha_cumplimiento DATE,
  responsable_cumplimiento TEXT,
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. CERTIFICACIONES DE OBRA (LOE con retención 5 %)
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificaciones_obra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Vínculo a la obra (obligatorio en la práctica)
  project_id UUID,                                -- projects(id)

  -- Identificación de la certificación
  numero_certificacion TEXT,                      -- "Certificación nº 5"
  fecha_certificacion DATE NOT NULL,
  periodo_desde DATE,
  periodo_hasta DATE,

  -- Económicos
  importe_origen NUMERIC(15,2),                   -- ejecutado a origen
  importe_anterior NUMERIC(15,2),                 -- ya certificado en periodos previos
  importe_actual NUMERIC(15,2),                   -- de este periodo (= origen - anterior)
  base_imponible NUMERIC(15,2),                   -- importe_actual antes IVA
  iva_pct NUMERIC(5,2),
  iva_importe NUMERIC(15,2),

  -- Retención LOE (5% típico)
  retencion_pct NUMERIC(5,2) DEFAULT 5.0,
  retencion_importe NUMERIC(15,2),
  retencion_acumulada NUMERIC(15,2),
  retencion_liberada NUMERIC(15,2),
  fecha_liberacion_retencion DATE,

  total_a_pagar NUMERIC(15,2),                    -- (base + iva) - retencion
  pct_ejecucion NUMERIC(5,2),                     -- % obra ejecutada acumulado

  -- Vínculos administrativos
  contrato_id UUID REFERENCES contratos(id),
  party_contratista_id UUID REFERENCES parties(id),
  party_promotor_id UUID REFERENCES parties(id),
  director_obra TEXT,
  director_ejecucion TEXT,

  -- Factura asociada (cuando se factura la certificación)
  invoice_id UUID REFERENCES invoices(id),

  estado TEXT NOT NULL DEFAULT 'pendiente_aprobar'
    CHECK (estado IN ('pendiente_aprobar','aprobada','facturada','pagada','rechazada')),

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 6. CERTIFICADOS (registral / energético / habitabilidad / técnico)
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  tipo_certificado TEXT NOT NULL CHECK (tipo_certificado IN (
    'energetico','habitabilidad','primera_ocupacion','tecnico_estructura',
    'instalaciones_electricas','instalaciones_termicas','gas','agua','ascensores',
    'antiincendios','accesibilidad','aislamiento_acustico','registral',
    'urbanistico','final_obra','direccion_obra','itip','itin','itse','otro'
  )),

  -- Identificación
  numero_certificado TEXT,
  organismo_o_tecnico TEXT,                       -- nombre técnico / colegio profesional / registro
  tecnico_nif TEXT,
  colegiado_numero TEXT,
  colegio_profesional TEXT,
  fecha_emision DATE,
  fecha_caducidad DATE,

  -- Resultado / calificación (depende del tipo, libre)
  resultado TEXT,                                 -- 'A','APTO','CON_DEFICIENCIAS','NO_APTO',etc
  calificacion_energetica TEXT,                   -- A..G si energético
  consumo_kwh_m2_anio NUMERIC(10,2),
  emisiones_kg_co2_m2_anio NUMERIC(10,2),

  -- Vinculaciones
  property_id UUID,
  project_id UUID,

  -- Económicos
  importe NUMERIC(15,2),

  observaciones TEXT,

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 7. INFORMES (tasación / pericial / valoración)
-- ============================================================================
CREATE TABLE IF NOT EXISTS informes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  tipo_informe TEXT NOT NULL CHECK (tipo_informe IN (
    'tasacion_eco_805','tasacion_iva','valoracion_libre','pericial_judicial',
    'pericial_seguro','due_diligence','informe_tecnico','informe_arquitectonico',
    'informe_estructural','informe_patologias','informe_inversion','otro'
  )),

  -- Identificación
  numero_informe TEXT,
  emisor TEXT,                                    -- 'Tinsa','Tecnitasa','perito X'
  emisor_nif TEXT,
  tecnico_nombre TEXT,
  tecnico_colegiado TEXT,
  fecha_emision DATE,
  fecha_visita DATE,
  fecha_vigencia DATE,                            -- las tasaciones ECO/805 → 6 meses

  -- Valoraciones (la tasación tiene un valor principal claro)
  valor_mercado NUMERIC(15,2),
  valor_hipotecario NUMERIC(15,2),
  valor_construccion NUMERIC(15,2),
  valor_suelo NUMERIC(15,2),
  valor_reposicion NUMERIC(15,2),
  metodo_valoracion TEXT,                         -- 'comparacion','coste','renta','residual'

  -- Vinculaciones
  property_id UUID,
  project_id UUID,
  party_solicitante_id UUID REFERENCES parties(id),

  -- Conclusiones libres
  conclusiones TEXT,

  -- Económicos del propio informe
  honorarios NUMERIC(15,2),
  iva_pct NUMERIC(5,2),
  total_informe NUMERIC(15,2),

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 8. SEGUROS (póliza decenal / RC / hogar / multirriesgo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS seguros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación
  numero_poliza TEXT NOT NULL,
  aseguradora TEXT,
  aseguradora_nif TEXT,
  mediador_corredor TEXT,
  mediador_nif TEXT,

  -- Tipo
  tipo_seguro TEXT NOT NULL CHECK (tipo_seguro IN (
    'decenal_loe','todo_riesgo_construccion','rc_general','rc_profesional',
    'multirriesgo_hogar','multirriesgo_comercio','multirriesgo_industrial',
    'comunidades','vida','salud','accidentes','automovil','flota',
    'transporte','credito','caucion','impago_alquileres','otro'
  )),

  -- Vigencia
  fecha_emision DATE,
  fecha_efecto DATE,
  fecha_vencimiento DATE,
  prorroga_automatica BOOLEAN DEFAULT true,

  -- Económicos
  prima_neta NUMERIC(15,2),
  recargos NUMERIC(15,2),
  impuestos NUMERIC(15,2),
  prima_total NUMERIC(15,2),
  forma_pago TEXT,                                -- 'anual','semestral','trimestral','mensual'
  capital_asegurado NUMERIC(15,2),
  franquicia NUMERIC(15,2),

  -- Vinculaciones
  property_id UUID,
  project_id UUID,
  party_tomador_id UUID REFERENCES parties(id),
  party_asegurado_id UUID REFERENCES parties(id),
  party_beneficiario_id UUID REFERENCES parties(id),

  -- Coberturas (lista simplificada como JSONB; detalle en ai_data)
  coberturas JSONB,                                -- {robo: 5000, incendio: ..., agua: ...}

  estado TEXT NOT NULL DEFAULT 'vigente'
    CHECK (estado IN ('vigente','suspendida','vencida','anulada','siniestro_abierto')),

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 9. MODELOS FISCALES (303 / 111 / 347 / 349 / 390 / 190 / 200 / 232)
-- ============================================================================
CREATE TABLE IF NOT EXISTS modelos_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación AEAT
  modelo TEXT NOT NULL CHECK (modelo IN (
    '303','111','115','130','131','180','190','193','200','202',
    '232','303C','347','349','368','369','390','714','720','D6'
  )),
  ejercicio INT NOT NULL,                          -- 2026
  periodo TEXT,                                    -- '1T','2T','3T','4T','01'..'12','0A' anual
  fecha_presentacion DATE,
  fecha_devengo DATE,
  numero_justificante TEXT,                        -- "11150000123456" AEAT
  numero_referencia TEXT,                          -- NRC banco si pagado
  csv_aeat TEXT,                                   -- Código Seguro Verificación

  -- Estado
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','presentado','rectificativa','sustitutiva','rechazado')),
  resultado_signo TEXT CHECK (resultado_signo IN ('I','D','C','N') OR resultado_signo IS NULL),
    -- I=Ingresar, D=Devolver, C=Compensar, N=Negativo a 0
  importe_resultado NUMERIC(15,2),
  importe_pagado NUMERIC(15,2),
  cuenta_cargo_iban TEXT,

  -- Sustitutivas / complementarias
  rectifica_modelo_id UUID REFERENCES modelos_fiscales(id),
  motivo_rectificacion TEXT,

  -- Detalle estructurado (cada modelo tiene su propio esquema → JSONB)
  detalle JSONB,                                   -- e.g. casillas 303 {01:..., 03:..., 64:...}

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS modelo_fiscal_contrapartes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_fiscal_id UUID NOT NULL REFERENCES modelos_fiscales(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación de la contraparte (cliente o proveedor del 347, retenido del 190, etc.)
  party_id UUID REFERENCES parties(id),
  nif TEXT NOT NULL,
  nombre TEXT NOT NULL,
  pais_codigo TEXT,                                -- ISO 3166-1 alpha-2 (para 349 IVA UE)
  vat_number_ue TEXT,                              -- 349

  -- Importes (los significativos dependen del modelo)
  importe_total NUMERIC(15,2),
  importe_q1 NUMERIC(15,2),
  importe_q2 NUMERIC(15,2),
  importe_q3 NUMERIC(15,2),
  importe_q4 NUMERIC(15,2),
  base_retencion NUMERIC(15,2),
  importe_retenido NUMERIC(15,2),
  clave TEXT,                                      -- clave de operación (A,B,F,G... según modelo)
  subclave TEXT,
  tipo_operacion TEXT,

  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. JUSTIFICANTES DE PAGO (transferencia / recibo / domiciliación)
-- ============================================================================
CREATE TABLE IF NOT EXISTS justificantes_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Tipo
  tipo_justificante TEXT NOT NULL CHECK (tipo_justificante IN (
    'transferencia','recibo_domiciliado','adeudo_sepa','pagare','cheque',
    'efectivo','tarjeta','bizum','ingreso_caja','aeat_nrc','otro'
  )),

  -- Identificación bancaria
  banco_emisor TEXT,
  iban_ordenante TEXT,
  iban_beneficiario TEXT,
  beneficiario_nombre TEXT,
  beneficiario_nif TEXT,
  ordenante_nombre TEXT,
  ordenante_nif TEXT,
  referencia_operacion TEXT,                       -- núm. transferencia / NRC
  concepto TEXT,

  -- Fechas
  fecha_operacion DATE NOT NULL,
  fecha_valor DATE,

  -- Económicos
  importe NUMERIC(15,2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'EUR',
  comision NUMERIC(15,2),

  -- Vínculo a documento referenciado (la clave)
  invoice_id UUID REFERENCES invoices(id),         -- factura pagada
  modelo_fiscal_id UUID REFERENCES modelos_fiscales(id),  -- pago AEAT
  contrato_id UUID REFERENCES contratos(id),       -- alquiler, etc.
  payroll_id UUID REFERENCES payrolls(id),         -- nómina pagada
  seguro_id UUID REFERENCES seguros(id),           -- prima
  -- Referencia textual cuando no podemos enlazar
  documento_referenciado_texto TEXT,

  -- Estado conciliación
  conciliado BOOLEAN NOT NULL DEFAULT false,
  fecha_conciliacion DATE,
  conciliado_por UUID REFERENCES auth.users(id),

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 11. ALBARANES (listado de materiales sin total / sin IVA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS albaranes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación
  numero_albaran TEXT NOT NULL,
  fecha_albaran DATE NOT NULL,
  fecha_entrega DATE,

  -- Partes
  proveedor_nif TEXT,
  proveedor_nombre TEXT,
  party_proveedor_id UUID REFERENCES parties(id),
  cliente_nif TEXT,
  cliente_nombre TEXT,

  -- Vínculos operativos
  project_id UUID,                                 -- obra a la que va destinado
  property_id UUID,
  direccion_entrega TEXT,

  -- Factura a la que se asocia (cuando se factura)
  invoice_id UUID REFERENCES invoices(id),
  facturado BOOLEAN NOT NULL DEFAULT false,
  fecha_facturacion DATE,

  -- Subtotal informativo (los albaranes no llevan IVA pero a veces tienen precios)
  subtotal_sin_iva NUMERIC(15,2),
  num_lineas INT,

  observaciones TEXT,

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS albaran_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  albaran_id UUID NOT NULL REFERENCES albaranes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  linea_orden INT,
  descripcion TEXT NOT NULL,
  codigo_articulo TEXT,
  cantidad NUMERIC(12,3),
  unidad TEXT,                                    -- 'ud','m','m2','m3','kg','h'
  precio_unitario NUMERIC(15,4),
  importe_linea NUMERIC(15,2),
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 12. PRESUPUESTOS (oferta económica)
-- ============================================================================
CREATE TABLE IF NOT EXISTS presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Identificación
  numero_presupuesto TEXT NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_validez DATE,

  -- Partes
  emisor_nif TEXT,
  emisor_nombre TEXT,
  party_emisor_id UUID REFERENCES parties(id),
  destinatario_nif TEXT,
  destinatario_nombre TEXT,
  party_destinatario_id UUID REFERENCES parties(id),

  -- Vínculos
  project_id UUID,
  property_id UUID,
  contrato_id UUID REFERENCES contratos(id),

  -- Totales
  subtotal NUMERIC(15,2),
  descuento_pct NUMERIC(5,2),
  descuento_importe NUMERIC(15,2),
  base_imponible NUMERIC(15,2),
  iva_pct NUMERIC(5,2),
  iva_importe NUMERIC(15,2),
  total NUMERIC(15,2),
  moneda TEXT NOT NULL DEFAULT 'EUR',

  -- Términos
  forma_pago TEXT,
  plazo_ejecucion_dias INT,
  condiciones TEXT,

  -- Estado
  estado TEXT NOT NULL DEFAULT 'enviado'
    CHECK (estado IN ('borrador','enviado','aceptado','rechazado','caducado','adjudicado')),
  fecha_aceptacion DATE,
  invoice_id UUID REFERENCES invoices(id),         -- factura cuando se factura

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS presupuesto_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  linea_orden INT,
  capitulo TEXT,                                  -- '01 Demoliciones', '02 Albañilería'
  descripcion TEXT NOT NULL,
  codigo_articulo TEXT,
  cantidad NUMERIC(12,3),
  unidad TEXT,
  precio_unitario NUMERIC(15,4),
  importe_linea NUMERIC(15,2),
  iva_pct_linea NUMERIC(5,2),
  notas TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. DOCUMENTOS OTROS (fallback)
-- ============================================================================
CREATE TABLE IF NOT EXISTS documentos_otros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Clasificación
  doc_type_detectado TEXT,                        -- lo que el LLM propuso ("burofax","email","carta")
  asunto TEXT,
  resumen TEXT,                                   -- 1-3 frases generadas por el LLM
  partes_mencionadas TEXT[],                      -- nombres detectados
  importes_mencionados NUMERIC[],                 -- importes detectados
  fecha_relevante DATE,
  fecha_emision DATE,

  -- Vínculos opcionales
  property_id UUID,
  project_id UUID,
  invoice_id UUID REFERENCES invoices(id),

  -- Común OCR / AI
  ai_provider TEXT,
  ai_confidence NUMERIC(4,3),
  ai_data JSONB,
  file_hash TEXT,
  original_filename TEXT,
  storage_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (review_status IN ('pendiente','revisado','error','reprocesar','reclasificar')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  -- Si tras revisión se reclasifica a un doc_type concreto
  reclasificado_a_tabla TEXT,                     -- 'contratos','escrituras',...
  reclasificado_a_id UUID,
  reclasificado_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Patrón: (company_id, deleted_at) para listados; file_hash UNIQUE per company
-- para dedup; (created_at DESC) para feeds; (review_status) filtrado parcial.

-- contratos
CREATE INDEX IF NOT EXISTS idx_contratos_company_deleted ON contratos(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_created_at ON contratos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contratos_review ON contratos(review_status) WHERE review_status = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_contratos_party ON contratos(party_id);
CREATE INDEX IF NOT EXISTS idx_contratos_fecha_fin ON contratos(fecha_fin) WHERE fecha_fin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contratos_file_hash_company ON contratos(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- contrato_partes
CREATE INDEX IF NOT EXISTS idx_contrato_partes_contrato ON contrato_partes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_partes_party ON contrato_partes(party_id);

-- notas_simples
CREATE INDEX IF NOT EXISTS idx_notas_simples_company_deleted ON notas_simples(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notas_simples_created_at ON notas_simples(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notas_simples_review ON notas_simples(review_status) WHERE review_status = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_notas_simples_idufir ON notas_simples(idufir);
CREATE INDEX IF NOT EXISTS idx_notas_simples_ref_catastral ON notas_simples(referencia_catastral);
CREATE INDEX IF NOT EXISTS idx_notas_simples_property ON notas_simples(property_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_simples_file_hash_company ON notas_simples(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_nota_simple_titulares_nota ON nota_simple_titulares(nota_simple_id);
CREATE INDEX IF NOT EXISTS idx_nota_simple_titulares_party ON nota_simple_titulares(party_id);
CREATE INDEX IF NOT EXISTS idx_nota_simple_titulares_nif ON nota_simple_titulares(nif);
CREATE INDEX IF NOT EXISTS idx_nota_simple_cargas_nota ON nota_simple_cargas(nota_simple_id);
CREATE INDEX IF NOT EXISTS idx_nota_simple_cargas_activas ON nota_simple_cargas(nota_simple_id) WHERE cancelada = false;

-- escrituras
CREATE INDEX IF NOT EXISTS idx_escrituras_company_deleted ON escrituras(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escrituras_created_at ON escrituras(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escrituras_review ON escrituras(review_status) WHERE review_status = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_escrituras_protocolo ON escrituras(numero_protocolo);
CREATE INDEX IF NOT EXISTS idx_escrituras_fecha ON escrituras(fecha_otorgamiento);
CREATE INDEX IF NOT EXISTS idx_escrituras_property ON escrituras(property_id);
CREATE INDEX IF NOT EXISTS idx_escrituras_tipo ON escrituras(tipo_escritura);
CREATE UNIQUE INDEX IF NOT EXISTS uq_escrituras_file_hash_company ON escrituras(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escritura_otorgantes_escritura ON escritura_otorgantes(escritura_id);
CREATE INDEX IF NOT EXISTS idx_escritura_otorgantes_party ON escritura_otorgantes(party_id);
CREATE INDEX IF NOT EXISTS idx_escritura_otorgantes_nif ON escritura_otorgantes(nif);

-- licencias
CREATE INDEX IF NOT EXISTS idx_licencias_company_deleted ON licencias(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_licencias_review ON licencias(review_status) WHERE review_status = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_licencias_caducidad ON licencias(fecha_caducidad) WHERE fecha_caducidad IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_licencias_project ON licencias(project_id);
CREATE INDEX IF NOT EXISTS idx_licencias_property ON licencias(property_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_licencias_file_hash_company ON licencias(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_licencia_condiciones_licencia ON licencia_condiciones(licencia_id);
CREATE INDEX IF NOT EXISTS idx_licencia_condiciones_pendientes ON licencia_condiciones(licencia_id) WHERE cumplida = false;

-- certificaciones_obra
CREATE INDEX IF NOT EXISTS idx_certificaciones_obra_company_deleted ON certificaciones_obra(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificaciones_obra_project ON certificaciones_obra(project_id);
CREATE INDEX IF NOT EXISTS idx_certificaciones_obra_fecha ON certificaciones_obra(fecha_certificacion DESC);
CREATE INDEX IF NOT EXISTS idx_certificaciones_obra_estado ON certificaciones_obra(estado);
CREATE INDEX IF NOT EXISTS idx_certificaciones_obra_invoice ON certificaciones_obra(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificaciones_obra_file_hash_company ON certificaciones_obra(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- certificados
CREATE INDEX IF NOT EXISTS idx_certificados_company_deleted ON certificados(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certificados_tipo ON certificados(tipo_certificado);
CREATE INDEX IF NOT EXISTS idx_certificados_property ON certificados(property_id);
CREATE INDEX IF NOT EXISTS idx_certificados_caducidad ON certificados(fecha_caducidad) WHERE fecha_caducidad IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificados_file_hash_company ON certificados(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- informes
CREATE INDEX IF NOT EXISTS idx_informes_company_deleted ON informes(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_informes_tipo ON informes(tipo_informe);
CREATE INDEX IF NOT EXISTS idx_informes_property ON informes(property_id);
CREATE INDEX IF NOT EXISTS idx_informes_vigencia ON informes(fecha_vigencia) WHERE fecha_vigencia IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_informes_file_hash_company ON informes(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- seguros
CREATE INDEX IF NOT EXISTS idx_seguros_company_deleted ON seguros(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_seguros_tipo ON seguros(tipo_seguro);
CREATE INDEX IF NOT EXISTS idx_seguros_vencimiento ON seguros(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_seguros_estado ON seguros(estado);
CREATE INDEX IF NOT EXISTS idx_seguros_property ON seguros(property_id);
CREATE INDEX IF NOT EXISTS idx_seguros_numero_poliza ON seguros(numero_poliza);
CREATE UNIQUE INDEX IF NOT EXISTS uq_seguros_file_hash_company ON seguros(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- modelos_fiscales
CREATE INDEX IF NOT EXISTS idx_modelos_fiscales_company_deleted ON modelos_fiscales(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modelos_fiscales_modelo_ej ON modelos_fiscales(modelo, ejercicio, periodo);
CREATE INDEX IF NOT EXISTS idx_modelos_fiscales_estado ON modelos_fiscales(estado);
CREATE INDEX IF NOT EXISTS idx_modelos_fiscales_presentacion ON modelos_fiscales(fecha_presentacion DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_fiscales_file_hash_company ON modelos_fiscales(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
-- Único un borrador "abierto" por (company, modelo, ejercicio, periodo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_fiscales_borrador_unico
  ON modelos_fiscales(company_id, modelo, ejercicio, periodo)
  WHERE estado = 'borrador' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mf_contrapartes_modelo ON modelo_fiscal_contrapartes(modelo_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_mf_contrapartes_nif ON modelo_fiscal_contrapartes(nif);

-- justificantes_pago
CREATE INDEX IF NOT EXISTS idx_jp_company_deleted ON justificantes_pago(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jp_fecha ON justificantes_pago(fecha_operacion DESC);
CREATE INDEX IF NOT EXISTS idx_jp_invoice ON justificantes_pago(invoice_id);
CREATE INDEX IF NOT EXISTS idx_jp_contrato ON justificantes_pago(contrato_id);
CREATE INDEX IF NOT EXISTS idx_jp_payroll ON justificantes_pago(payroll_id);
CREATE INDEX IF NOT EXISTS idx_jp_modelo_fiscal ON justificantes_pago(modelo_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_jp_seguro ON justificantes_pago(seguro_id);
CREATE INDEX IF NOT EXISTS idx_jp_referencia ON justificantes_pago(referencia_operacion);
CREATE INDEX IF NOT EXISTS idx_jp_no_conciliados ON justificantes_pago(company_id) WHERE conciliado = false AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_jp_file_hash_company ON justificantes_pago(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- albaranes
CREATE INDEX IF NOT EXISTS idx_albaranes_company_deleted ON albaranes(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_albaranes_fecha ON albaranes(fecha_albaran DESC);
CREATE INDEX IF NOT EXISTS idx_albaranes_proveedor ON albaranes(party_proveedor_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_project ON albaranes(project_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_invoice ON albaranes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_albaranes_no_facturados ON albaranes(company_id) WHERE facturado = false AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_albaranes_file_hash_company ON albaranes(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_albaran_lineas_albaran ON albaran_lineas(albaran_id);

-- presupuestos
CREATE INDEX IF NOT EXISTS idx_presupuestos_company_deleted ON presupuestos(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_presupuestos_fecha ON presupuestos(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_presupuestos_estado ON presupuestos(estado);
CREATE INDEX IF NOT EXISTS idx_presupuestos_project ON presupuestos(project_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_destinatario ON presupuestos(party_destinatario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuestos_file_hash_company ON presupuestos(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_presupuesto_lineas_presupuesto ON presupuesto_lineas(presupuesto_id);

-- documentos_otros
CREATE INDEX IF NOT EXISTS idx_documentos_otros_company_deleted ON documentos_otros(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_otros_pendientes ON documentos_otros(review_status) WHERE review_status IN ('pendiente','reclasificar');
CREATE INDEX IF NOT EXISTS idx_documentos_otros_fecha ON documentos_otros(fecha_relevante);
CREATE UNIQUE INDEX IF NOT EXISTS uq_documentos_otros_file_hash_company ON documentos_otros(company_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- TRIGGERS updated_at (reaprovecha función bloque0_set_updated_at)
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'contratos','contrato_partes',
    'notas_simples','nota_simple_titulares','nota_simple_cargas',
    'escrituras','escritura_otorgantes',
    'licencias','licencia_condiciones',
    'certificaciones_obra','certificados','informes','seguros',
    'modelos_fiscales','modelo_fiscal_contrapartes',
    'justificantes_pago',
    'albaranes','albaran_lineas',
    'presupuestos','presupuesto_lineas',
    'documentos_otros'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; '
      'CREATE TRIGGER %I BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();',
      t || '_updated_at_trg', t, t || '_updated_at_trg', t
    );
  END LOOP;
END $$;

-- ============================================================================
-- RLS — habilitar + FORCE en todas las nuevas tablas
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'contratos','contrato_partes',
    'notas_simples','nota_simple_titulares','nota_simple_cargas',
    'escrituras','escritura_otorgantes',
    'licencias','licencia_condiciones',
    'certificaciones_obra','certificados','informes','seguros',
    'modelos_fiscales','modelo_fiscal_contrapartes',
    'justificantes_pago',
    'albaranes','albaran_lineas',
    'presupuestos','presupuesto_lineas',
    'documentos_otros'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ============================================================================
-- POLICIES — patrón canónico del proyecto:
--   service_role: bypass via Supabase (no necesita policy explícita pero la dejamos)
--   authenticated: solo admins allow-list cathedralgroup.es ven todo
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'contratos','contrato_partes',
    'notas_simples','nota_simple_titulares','nota_simple_cargas',
    'escrituras','escritura_otorgantes',
    'licencias','licencia_condiciones',
    'certificaciones_obra','certificados','informes','seguros',
    'modelos_fiscales','modelo_fiscal_contrapartes',
    'justificantes_pago',
    'albaranes','albaran_lineas',
    'presupuestos','presupuesto_lineas',
    'documentos_otros'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "admin_authenticated_or_service_role" ON %I;',
      t
    );
    EXECUTE format($pol$
      CREATE POLICY "admin_authenticated_or_service_role" ON %I
      FOR ALL
      TO authenticated, service_role
      USING (
        (auth.jwt() ->> 'email') IN (
          'd.vieco@cathedralgroup.es',
          'jm.lozano@cathedralgroup.es',
          'j.rivera@cathedralgroup.es'
        )
        OR (auth.jwt() ->> 'role') = 'service_role'
      )
      WITH CHECK (
        (auth.jwt() ->> 'email') IN (
          'd.vieco@cathedralgroup.es',
          'jm.lozano@cathedralgroup.es',
          'j.rivera@cathedralgroup.es'
        )
        OR (auth.jwt() ->> 'role') = 'service_role'
      );
    $pol$, t);
  END LOOP;
END $$;

-- ============================================================================
-- GRANT / REVOKE — Supabase advisor 0028
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'contratos','contrato_partes',
    'notas_simples','nota_simple_titulares','nota_simple_cargas',
    'escrituras','escritura_otorgantes',
    'licencias','licencia_condiciones',
    'certificaciones_obra','certificados','informes','seguros',
    'modelos_fiscales','modelo_fiscal_contrapartes',
    'justificantes_pago',
    'albaranes','albaran_lineas',
    'presupuestos','presupuesto_lineas',
    'documentos_otros'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC;', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON %I TO service_role;', t);
  END LOOP;
END $$;

-- ============================================================================
-- DOCUMENTS_REGISTRY — vista materializada cross-doc-type
--
-- Por qué vista materializada y no tabla puente con FK polimórfica:
--   - Postgres no soporta FK polimórficas — habría que validar con triggers
--     y la consistencia entre tablas siempre se podría romper.
--   - La vista materializada se refresca on-demand (o por cron 5 min) y
--     tiene CERO riesgo de descincronización con la verdad: las tablas hijas.
--   - Para búsqueda global cross-doc-type es perfecta: 1 índice (search_vec)
--     y a buscar.
--
-- Columnas comunes mínimas viables. Detalle específico va en source_table+id.
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS documents_registry CASCADE;

CREATE MATERIALIZED VIEW documents_registry AS
-- INVOICES (ya existente)
SELECT
  'invoices'::TEXT AS source_table,
  i.id AS source_id,
  i.company_id,
  CASE
    WHEN i.doc_type = 'rectificativa' THEN 'rectificativa'
    WHEN i.doc_type = 'abono' THEN 'abono'
    WHEN i.doc_type = 'proforma' THEN 'proforma'
    WHEN i.doc_type = 'ticket' THEN 'ticket'
    ELSE 'factura'
  END AS doc_type,
  i.issue_date AS fecha_relevante,
  i.amount_total AS importe_principal,
  COALESCE(i.empresa, i.nombre_receptor) AS contraparte_principal,
  COALESCE(i.supplier_nif, i.nif_receptor) AS contraparte_nif,
  i.file_hash,
  i.ai_confidence,
  i.review_status,
  i.created_at,
  i.deleted_at,
  i.original_filename,
  i.drive_url
FROM invoices i
UNION ALL
-- PAYROLLS
SELECT
  'payrolls', p.id, p.company_id, 'nomina',
  p.periodo_hasta::date AS fecha_relevante,
  p.liquido_a_percibir AS importe_principal,
  p.trabajador_nombre, p.trabajador_nif,
  p.file_hash, p.ai_confidence, p.review_status, p.created_at, p.deleted_at,
  p.original_filename, p.drive_url
FROM payrolls p
UNION ALL
-- CONTRATOS
SELECT
  'contratos', c.id, c.company_id, 'contrato',
  COALESCE(c.fecha_firma, c.fecha_inicio),
  COALESCE(c.importe_total, c.importe_periodico),
  NULL::TEXT, NULL::TEXT,
  c.file_hash, c.ai_confidence, c.review_status, c.created_at, c.deleted_at,
  c.original_filename, c.storage_path
FROM contratos c
UNION ALL
-- NOTAS SIMPLES
SELECT
  'notas_simples', n.id, n.company_id, 'nota_simple',
  n.fecha_expedicion,
  NULL::NUMERIC,
  n.descripcion_finca, NULL::TEXT,
  n.file_hash, n.ai_confidence, n.review_status, n.created_at, n.deleted_at,
  n.original_filename, n.storage_path
FROM notas_simples n
UNION ALL
-- ESCRITURAS
SELECT
  'escrituras', e.id, e.company_id, 'escritura',
  e.fecha_otorgamiento,
  e.importe_principal,
  e.notario_nombre, e.notario_nif,
  e.file_hash, e.ai_confidence, e.review_status, e.created_at, e.deleted_at,
  e.original_filename, e.storage_path
FROM escrituras e
UNION ALL
-- LICENCIAS
SELECT
  'licencias', l.id, l.company_id, 'licencia',
  COALESCE(l.fecha_concesion, l.fecha_solicitud),
  l.total_pagado,
  l.organismo_emisor, NULL::TEXT,
  l.file_hash, l.ai_confidence, l.review_status, l.created_at, l.deleted_at,
  l.original_filename, l.storage_path
FROM licencias l
UNION ALL
-- CERTIFICACIONES OBRA
SELECT
  'certificaciones_obra', co.id, co.company_id, 'certificacion_obra',
  co.fecha_certificacion,
  co.total_a_pagar,
  NULL::TEXT, NULL::TEXT,
  co.file_hash, co.ai_confidence, co.review_status, co.created_at, co.deleted_at,
  co.original_filename, co.storage_path
FROM certificaciones_obra co
UNION ALL
-- CERTIFICADOS
SELECT
  'certificados', ce.id, ce.company_id, 'certificado',
  ce.fecha_emision,
  ce.importe,
  ce.organismo_o_tecnico, ce.tecnico_nif,
  ce.file_hash, ce.ai_confidence, ce.review_status, ce.created_at, ce.deleted_at,
  ce.original_filename, ce.storage_path
FROM certificados ce
UNION ALL
-- INFORMES
SELECT
  'informes', inf.id, inf.company_id, 'informe',
  inf.fecha_emision,
  COALESCE(inf.total_informe, inf.valor_mercado),
  inf.emisor, inf.emisor_nif,
  inf.file_hash, inf.ai_confidence, inf.review_status, inf.created_at, inf.deleted_at,
  inf.original_filename, inf.storage_path
FROM informes inf
UNION ALL
-- SEGUROS
SELECT
  'seguros', s.id, s.company_id, 'seguro',
  s.fecha_efecto,
  s.prima_total,
  s.aseguradora, s.aseguradora_nif,
  s.file_hash, s.ai_confidence, s.review_status, s.created_at, s.deleted_at,
  s.original_filename, s.storage_path
FROM seguros s
UNION ALL
-- MODELOS FISCALES
SELECT
  'modelos_fiscales', mf.id, mf.company_id, 'modelo_fiscal',
  mf.fecha_presentacion,
  mf.importe_resultado,
  'AEAT', NULL::TEXT,
  mf.file_hash, mf.ai_confidence, mf.review_status, mf.created_at, mf.deleted_at,
  mf.original_filename, mf.storage_path
FROM modelos_fiscales mf
UNION ALL
-- JUSTIFICANTES PAGO
SELECT
  'justificantes_pago', jp.id, jp.company_id, 'justificante_pago',
  jp.fecha_operacion,
  jp.importe,
  jp.beneficiario_nombre, jp.beneficiario_nif,
  jp.file_hash, jp.ai_confidence, jp.review_status, jp.created_at, jp.deleted_at,
  jp.original_filename, jp.storage_path
FROM justificantes_pago jp
UNION ALL
-- ALBARANES
SELECT
  'albaranes', a.id, a.company_id, 'albaran',
  a.fecha_albaran,
  a.subtotal_sin_iva,
  a.proveedor_nombre, a.proveedor_nif,
  a.file_hash, a.ai_confidence, a.review_status, a.created_at, a.deleted_at,
  a.original_filename, a.storage_path
FROM albaranes a
UNION ALL
-- PRESUPUESTOS
SELECT
  'presupuestos', pr.id, pr.company_id, 'presupuesto',
  pr.fecha_emision,
  pr.total,
  pr.destinatario_nombre, pr.destinatario_nif,
  pr.file_hash, pr.ai_confidence, pr.review_status, pr.created_at, pr.deleted_at,
  pr.original_filename, pr.storage_path
FROM presupuestos pr
UNION ALL
-- DOCUMENTOS OTROS
SELECT
  'documentos_otros', do_.id, do_.company_id, 'otro',
  COALESCE(do_.fecha_relevante, do_.fecha_emision),
  (SELECT MAX(v) FROM unnest(do_.importes_mencionados) v),
  array_to_string(do_.partes_mencionadas, ' / '), NULL::TEXT,
  do_.file_hash, do_.ai_confidence, do_.review_status, do_.created_at, do_.deleted_at,
  do_.original_filename, do_.storage_path
FROM documentos_otros do_;

-- Indexes sobre la vista materializada
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_registry_source ON documents_registry(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_documents_registry_company ON documents_registry(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_registry_doc_type ON documents_registry(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_registry_fecha ON documents_registry(fecha_relevante DESC);
CREATE INDEX IF NOT EXISTS idx_documents_registry_review ON documents_registry(review_status);
CREATE INDEX IF NOT EXISTS idx_documents_registry_contraparte_nif ON documents_registry(contraparte_nif);
CREATE INDEX IF NOT EXISTS idx_documents_registry_file_hash ON documents_registry(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_registry_created ON documents_registry(created_at DESC);

-- Función de refresco (llamable desde cron / n8n)
CREATE OR REPLACE FUNCTION refresh_documents_registry()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY documents_registry;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_documents_registry() TO authenticated, service_role;

-- Programable vía pg_cron (NO se programa aquí — el operador decide):
--   SELECT cron.schedule('refresh_documents_registry', '*/5 * * * *',
--     $$SELECT refresh_documents_registry();$$);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE contratos IS 'Contratos genéricos del grupo (arrendamiento, obra, servicios, laboral, etc.). Partes en contrato_partes (1:N).';
COMMENT ON TABLE contrato_partes IS 'Partes implicadas en un contrato (1:N respecto a contratos). Rol distingue arrendador/arrendatario/comprador/vendedor/etc.';
COMMENT ON TABLE notas_simples IS 'Notas simples del Registro de la Propiedad. Titulares y cargas en tablas hijas.';
COMMENT ON TABLE nota_simple_titulares IS 'Titulares de la finca según la nota simple (pleno dominio, usufructo, nuda propiedad).';
COMMENT ON TABLE nota_simple_cargas IS 'Cargas registrales: hipotecas, embargos, servidumbres, afecciones fiscales.';
COMMENT ON TABLE escrituras IS 'Escrituras notariales (compraventa, hipoteca, poder, herencia, etc.). Otorgantes en escritura_otorgantes.';
COMMENT ON TABLE escritura_otorgantes IS 'Partes otorgantes de la escritura (comprador, vendedor, hipotecante, donante, etc.).';
COMMENT ON TABLE licencias IS 'Licencias administrativas urbanísticas, de actividad u obra. Condiciones en licencia_condiciones.';
COMMENT ON TABLE licencia_condiciones IS 'Condiciones impuestas por la licencia (1:N). Permite seguimiento de cumplimiento.';
COMMENT ON TABLE certificaciones_obra IS 'Certificaciones LOE con retención 5%. Acumulado por proyecto (project_id) + liberación al final de la obra.';
COMMENT ON TABLE certificados IS 'Certificados técnicos / registrales (energético, habitabilidad, instalaciones, etc.). Tipo_certificado discrimina.';
COMMENT ON TABLE informes IS 'Informes técnicos / tasaciones / valoraciones / due diligence.';
COMMENT ON TABLE seguros IS 'Pólizas de seguro (decenal, RC, hogar, comunidades, etc.). coberturas JSONB para detalle libre.';
COMMENT ON TABLE modelos_fiscales IS 'Modelos AEAT (303, 111, 347, etc.) tanto borradores como presentados. detalle JSONB con casillas.';
COMMENT ON TABLE modelo_fiscal_contrapartes IS 'Contrapartes referenciadas en el modelo (clientes/proveedores del 347, retenidos del 190, intracomunitarios del 349).';
COMMENT ON TABLE justificantes_pago IS 'Justificantes de pago: transferencias, recibos domiciliados, NRC AEAT, etc. Vinculan a invoice/payroll/modelo_fiscal/contrato/seguro.';
COMMENT ON TABLE albaranes IS 'Albaranes de entrega (sin IVA). Líneas en albaran_lineas. invoice_id se rellena al facturar.';
COMMENT ON TABLE albaran_lineas IS 'Líneas de detalle del albarán (materiales, cantidades, unidades).';
COMMENT ON TABLE presupuestos IS 'Presupuestos / ofertas económicas. Líneas en presupuesto_lineas. invoice_id se rellena al facturar.';
COMMENT ON TABLE presupuesto_lineas IS 'Líneas de detalle del presupuesto, agrupables por capítulo.';
COMMENT ON TABLE documentos_otros IS 'Fallback genérico para doc_type=otro o no clasificado. Reclasificable a tabla específica vía reclasificado_a_tabla/_id.';
COMMENT ON MATERIALIZED VIEW documents_registry IS 'Vista materializada cross-doc-type para búsqueda global. Refrescar con SELECT refresh_documents_registry().';

COMMIT;

-- ============================================================================
-- POSTDEPLOY CHECKLIST — ejecutar manualmente tras aplicar la migración
-- ============================================================================
--
-- 1. VERIFICAR todas las tablas creadas (debería devolver 21 filas):
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN (
--        'contratos','contrato_partes','notas_simples','nota_simple_titulares',
--        'nota_simple_cargas','escrituras','escritura_otorgantes','licencias',
--        'licencia_condiciones','certificaciones_obra','certificados','informes',
--        'seguros','modelos_fiscales','modelo_fiscal_contrapartes',
--        'justificantes_pago','albaranes','albaran_lineas','presupuestos',
--        'presupuesto_lineas','documentos_otros'
--      )
--    ORDER BY table_name;
--
-- 2. VERIFICAR RLS activo y FORCE en todas (forcerowsecurity = true):
--    SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables
--    WHERE schemaname='public' AND tablename IN ([21 tablas]);
--
-- 3. VERIFICAR policies (debería haber 21 'admin_authenticated_or_service_role'):
--    SELECT tablename, policyname FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ([21 tablas])
--    ORDER BY tablename;
--
-- 4. VERIFICAR triggers updated_at (21 _updated_at_trg):
--    SELECT trigger_name, event_object_table FROM information_schema.triggers
--    WHERE trigger_name LIKE '%_updated_at_trg'
--      AND event_object_table IN ([21 tablas])
--    ORDER BY event_object_table;
--
-- 5. VERIFICAR vista materializada poblada:
--    REFRESH MATERIALIZED VIEW documents_registry;
--    SELECT doc_type, COUNT(*) FROM documents_registry GROUP BY 1 ORDER BY 1;
--
-- 6. VERIFICAR no hay grants a anon en las 21 tablas:
--    SELECT grantee, table_name FROM information_schema.role_table_grants
--    WHERE table_schema='public'
--      AND table_name IN ([21 tablas])
--      AND grantee = 'anon';
--    (Esperado: 0 filas)
--
-- 7. VERIFICAR Supabase advisor (vía MCP):
--    list_advisors → security_advisor
--    Esperado: 0 nuevos findings de tipo "rls_disabled_in_public" ni
--              "policy_exists_rls_disabled" sobre las 21 tablas nuevas.
--
-- 8. SMOKE TEST inserción con service_role:
--    INSERT INTO contratos (company_id, tipo_contrato, objeto, fecha_firma)
--    VALUES ('00000000-0000-0000-0000-cca7ed1a1000', 'servicios', 'TEST', NOW())
--    RETURNING id;
--    DELETE FROM contratos WHERE objeto = 'TEST';
--
-- 9. SIGUIENTE PASO (próxima migración / sprint):
--    - Extender el trigger dispatch_agent_webhook para los nuevos doc_types
--    - Actualizar n8n workflow general "Routing por doc_type" → inserta en la
--      tabla correcta (no en invoices) cuando doc_type != factura/etc.
--    - Crear vistas auxiliares por tipo en /admin para listados/edición:
--      /admin/contratos, /admin/notas-simples, /admin/escrituras, etc.
--    - Programar cron pg_cron de refresh_documents_registry cada 5 min
--      (o evento-driven on INSERT/UPDATE de las 13 tablas).
-- ============================================================================
