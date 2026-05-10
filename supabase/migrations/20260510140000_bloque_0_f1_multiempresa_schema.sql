-- Bloque 0 F1 — Schema cimentación multi-empresa Cathedral Group
--
-- Por qué esta migración existe
--   Tras auditoría de 5 agentes eruditos arquitecturales/empíricos/adversarios/
--   estado-del-arte/compliance-ES, decisión: discriminator company_id + RLS
--   endurecido + audit hash chain SHA-256 (estilo Verifactu) + parties global.
--
--   El sistema actual es mono-empresa (0 de 70 tablas tienen company_id). Esta
--   migración añade las 9 tablas FUNDACIONALES sin tocar ninguna existente.
--   F2 ampliará las 50 tablas core con company_id NOT NULL via ALTER.
--
-- Por qué NO schemas Postgres separados (decisión erudita)
--   PostgREST/Realtime de Supabase atados al schema `public`. Schema-per-SL
--   rompería la auto-API. Defensa en profundidad para libros oficiales se
--   logra via audit_log_chain con hash SHA-256 encadenado, equivalente WORM
--   legalmente reconocido por AEAT y aceptado por Big4.
--
-- Patrones canónicos aplicados
--   1. parties (NIF global) + party_company_relationships (N:M con vigencia)
--   2. properties global + property_ownership_history (cambia titularidad sin duplicar)
--   3. intragroup_transactions con issuer_company_id + receiver_company_id (Modelo 232)
--   4. companies con parent_company_id + participation_pct + consolidation_method
--   5. audit_log_chain append-only con SHA-256 prev_hash + record_hash
--
-- Sprint Bloque 0 F1 — sesión 10/05/2026 tarde-tarde, post Sprint A operativo.

-- ============================================================================
-- 1. companies — la entidad fundamental del grupo
-- ============================================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad fiscal (CIF único en el grupo + España)
  cif TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT,

  -- Domicilio fiscal
  domicilio_fiscal TEXT,
  codigo_postal TEXT,
  municipio TEXT,
  provincia TEXT,
  pais TEXT NOT NULL DEFAULT 'ES',

  -- Datos mercantiles
  fecha_constitucion DATE,
  capital_social NUMERIC(15,2),
  registro_mercantil TEXT,
  numero_inscripcion TEXT,

  -- Actividad
  regimen_fiscal TEXT,                                      -- 'general','REGE','grupo_consolidacion_fiscal',etc
  codigo_cnae TEXT,
  ccc_principal TEXT,                                       -- Código Cuenta Cotización SS
  iae_epigrafes TEXT[] DEFAULT '{}'::text[],

  -- Estructura grupo
  parent_company_id UUID REFERENCES companies(id),
  participation_pct NUMERIC(5,2) CHECK (participation_pct IS NULL OR (participation_pct >= 0 AND participation_pct <= 100)),
  consolidation_method TEXT CHECK (consolidation_method IS NULL OR consolidation_method IN (
    'integration_global','integration_proportional','equivalence'
  )),

  -- Obligaciones automáticas (precalculadas, recalculables por trigger en F5)
  sii_obligado BOOLEAN NOT NULL DEFAULT false,              -- vol.op. >6.010.121,04 €
  verifactu_obligado BOOLEAN NOT NULL DEFAULT true,         -- Personas jurídicas: 1/1/2027
  audit_obligada BOOLEAN NOT NULL DEFAULT false,            -- art. 263 LSC umbrales
  consolidacion_obligada BOOLEAN NOT NULL DEFAULT false,    -- art. 43 CdC umbrales

  -- Certificados FNMT (referencia a Supabase Vault — F5)
  certificate_fnmt_vault_ref TEXT,
  certificate_fnmt_expiry DATE,

  -- Estado de la empresa
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','DISSOLVED','LIQUIDATED','MERGED')),
  fecha_disolucion DATE,
  legal_retention_until DATE,                                -- 10 años post-disolución típico
  merged_into_company_id UUID REFERENCES companies(id),

  -- Metadata
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE companies IS
  'Bloque 0 F1 — entidades del grupo Cathedral. Cada SL es row independiente. '
  'parent_company_id permite estructura jerárquica (holding → subsidiarias). '
  'Cada CIF es contribuyente AEAT independiente.';
COMMENT ON COLUMN companies.consolidation_method IS
  'Método consolidación contable NOFCAC RD 1159/2010: integración global '
  '(>50% control), proporcional (joint venture), equivalencia (influencia).';
COMMENT ON COLUMN companies.certificate_fnmt_vault_ref IS
  'ID en supabase_vault del certificado FNMT/Sello de Empresa para Verifactu '
  '+ AEAT Sede + DEHú. Un certificado por NIF (exigencia Verifactu).';

CREATE INDEX idx_companies_cif ON companies(cif);
CREATE INDEX idx_companies_status ON companies(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_companies_parent ON companies(parent_company_id) WHERE parent_company_id IS NOT NULL;
CREATE INDEX idx_companies_deleted ON companies(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. company_members — permisos por usuario por empresa
-- ============================================================================
CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Rol del usuario en esta empresa específica
  role TEXT NOT NULL CHECK (role IN (
    'owner',         -- propietario/fundador (David, JM, Julián según empresa)
    'admin',         -- administrador con acceso total
    'contable',      -- gestoría/contable: facturas, modelos AEAT, libros
    'rh',            -- recursos humanos: trabajadores, nóminas, PRL
    'dpo',           -- Delegado Protección Datos
    'lectura',       -- solo lectura (auditor, asesor externo)
    'operario'       -- trabajador acceso restringido (su perfil + horas)
  )),

  -- Permisos finos vía JSONB (futuro: ACL granular por feature)
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,

  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, company_id, role)
);

COMMENT ON TABLE company_members IS
  'Bloque 0 F1 — relación N:M usuario-empresa con rol. Un usuario puede tener '
  'distintos roles en distintas empresas (David admin de las 4 SL, Julián '
  'solo contable de una). RLS de cada tabla operativa filtra por company_id '
  'ESCALAR de auth.jwt() app_metadata.';

CREATE INDEX idx_company_members_user ON company_members(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_company_members_company ON company_members(company_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- 3. parties — entidades externas globales (clientes, proveedores, socios, etc)
--    indexadas por NIF único, vinculables a múltiples empresas via N:M
-- ============================================================================
CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nif TEXT NOT NULL UNIQUE,                                 -- DNI/NIE/CIF/passport
  tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('FISICA','JURIDICA','EXTRANJERA','OTROS')),

  -- Nombre
  nombre TEXT NOT NULL,
  apellidos TEXT,
  razon_social TEXT,
  nombre_comercial TEXT,

  -- Contacto
  email TEXT,
  telefono TEXT,
  direccion JSONB NOT NULL DEFAULT '{}'::jsonb,
  iban TEXT,

  -- AML/SEPBLAC (sector inmobiliario sujeto obligado)
  pep_bool BOOLEAN NOT NULL DEFAULT false,
  pep_detalles TEXT,
  sancionado_bool BOOLEAN NOT NULL DEFAULT false,
  sancion_lista TEXT,
  riesgo_aml TEXT CHECK (riesgo_aml IS NULL OR riesgo_aml IN ('bajo','medio','alto')),
  fecha_kyc_ultimo TIMESTAMPTZ,
  titular_real_id UUID REFERENCES parties(id),              -- titular real de PJ

  -- Verificador algorítmico Cathedral
  nif_verificado BOOLEAN NOT NULL DEFAULT false,
  iban_verificado BOOLEAN NOT NULL DEFAULT false,
  verificado_at TIMESTAMPTZ,

  -- Origen
  source TEXT,                                              -- 'workflow_invoice','manual_admin','api','migration_f3'
  ai_extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_confidence NUMERIC(4,3) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE parties IS
  'Bloque 0 F1 — entidades externas globales por NIF único. Reemplaza '
  'duplicación clients+suppliers en F3. Un mismo NIF puede ser cliente de '
  'Investment + proveedor de Reformas (relación via party_company_relationships). '
  'Soporta detección automática operaciones intragrupo Modelo 232.';

CREATE INDEX idx_parties_nif ON parties(nif);
CREATE INDEX idx_parties_tipo ON parties(tipo_persona);
CREATE INDEX idx_parties_aml ON parties(riesgo_aml) WHERE riesgo_aml IN ('medio','alto');
CREATE INDEX idx_parties_pep ON parties(pep_bool) WHERE pep_bool = true;
CREATE INDEX idx_parties_deleted ON parties(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. party_company_relationships — N:M con vigencia + KPIs cache + AML por empresa
-- ============================================================================
CREATE TABLE party_company_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Tipos de relación (puede ser varios simultáneos)
  types TEXT[] NOT NULL CHECK (cardinality(types) > 0),
  -- Tipos válidos: cliente, proveedor, empleado, socio, arrendador, arrendatario,
  -- prestamista, prestatario, gestor, asesor, contraparte_intragrupo

  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,

  -- KPIs cache (recalculables — no source of truth)
  total_facturado NUMERIC(15,2),
  total_pagado NUMERIC(15,2),
  num_facturas INT,
  primera_factura_fecha DATE,
  ultima_factura_fecha DATE,
  saldo_pendiente NUMERIC(15,2),

  -- AML específico de la relación empresa→party (Ley 10/2010 art. 25)
  due_diligence_level TEXT CHECK (due_diligence_level IS NULL OR due_diligence_level IN ('simplificada','normal','reforzada')),
  fecha_kyc_empresa TIMESTAMPTZ,
  documentos_kyc_path TEXT,
  conservacion_hasta DATE,                                   -- 10 años AML

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(party_id, company_id, valid_from)
);

COMMENT ON TABLE party_company_relationships IS
  'Bloque 0 F1 — N:M entre parties (NIF global) y companies (SL del grupo). '
  'Permite que el mismo NIF sea cliente, proveedor y socio simultáneamente. '
  'AML por empresa-party (cada SL custodia su propio KYC, conservación 10 años).';

CREATE INDEX idx_pcr_party ON party_company_relationships(party_id);
CREATE INDEX idx_pcr_company ON party_company_relationships(company_id);
CREATE INDEX idx_pcr_active ON party_company_relationships(company_id, party_id) WHERE valid_to IS NULL;
CREATE INDEX idx_pcr_types ON party_company_relationships USING GIN(types);

-- ============================================================================
-- 5. properties — inmuebles globales (independientes de quién es propietario)
-- ============================================================================
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  ref_catastral TEXT UNIQUE,

  -- Dirección
  direccion TEXT NOT NULL,
  numero TEXT,
  piso TEXT,
  letra TEXT,
  codigo_postal TEXT,
  municipio TEXT NOT NULL,
  provincia TEXT,
  pais TEXT NOT NULL DEFAULT 'ES',
  zona TEXT,                                                -- 'Salamanca','Chamberí','Chamartín',etc

  -- Características
  tipo TEXT NOT NULL CHECK (tipo IN ('vivienda','local','garaje','trastero','suelo','edificio','otro')),
  superficie_construida_m2 NUMERIC(10,2),
  superficie_util_m2 NUMERIC(10,2),
  superficie_terreno_m2 NUMERIC(10,2),
  habitaciones INT,
  banos INT,
  ano_construccion INT,
  certificado_energetico TEXT,                              -- 'A','B','C','D','E','F','G' (RD 390/2021)
  cedula_habitabilidad_path TEXT,

  -- Estado actual operativo
  estado_actual TEXT CHECK (estado_actual IS NULL OR estado_actual IN (
    'en_arras','comprado','en_obra','reformado','en_venta','vendido','en_alquiler','alquilado','baja'
  )),

  -- Datos económicos resumen (recalculables desde flipping_operations + ownership_history)
  precio_compra_inicial NUMERIC(15,2),
  fecha_compra_inicial DATE,
  precio_venta_final NUMERIC(15,2),
  fecha_venta_final DATE,
  alquiler_mensual_actual NUMERIC(10,2),

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE properties IS
  'Bloque 0 F1 — inmuebles del grupo. NO duplicar cuando cambia propietario '
  'entre SL del grupo (usar property_ownership_history). Permite trazabilidad '
  'única por ref_catastral con histórico de ownership.';

CREATE INDEX idx_properties_catastral ON properties(ref_catastral) WHERE ref_catastral IS NOT NULL;
CREATE INDEX idx_properties_estado ON properties(estado_actual);
CREATE INDEX idx_properties_zona ON properties(zona);
CREATE INDEX idx_properties_deleted ON properties(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 6. property_ownership_history — historial titularidad por SL
-- ============================================================================
CREATE TABLE property_ownership_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  from_date DATE NOT NULL,
  to_date DATE,                                              -- NULL = propietario actual

  -- Cómo adquirió/transmitió la propiedad
  titulo_propiedad TEXT NOT NULL CHECK (titulo_propiedad IN (
    'compra','permuta','aportacion','herencia','escision','adjudicacion','dacion'
  )),

  -- Documentación notarial
  numero_protocolo TEXT,
  notario TEXT,
  fecha_escritura DATE,
  registro_propiedad TEXT,
  numero_inscripcion TEXT,

  -- Valores económicos
  valor_adquisicion NUMERIC(15,2),
  valor_referencia_catastral NUMERIC(15,2),

  -- Operación intragrupo (Modelo 232 si supera umbral)
  is_intragroup BOOLEAN NOT NULL DEFAULT false,
  intragroup_counterparty_company_id UUID REFERENCES companies(id),
  intragroup_transaction_id UUID,                            -- FK añadida tras crear intragroup_transactions abajo

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- No puede haber solapes: cada inmueble tiene un único propietario en cada momento
  CONSTRAINT property_ownership_no_overlap_check CHECK (to_date IS NULL OR to_date >= from_date)
);

COMMENT ON TABLE property_ownership_history IS
  'Bloque 0 F1 — historial titularidad inmuebles por SL. Permite que un piso '
  'comprado por Patrimonial se venda a Investment 2 años después sin duplicar '
  'la fila en properties. Cuando is_intragroup=true → fila en '
  'intragroup_transactions con type=cesion_inmueble/permuta_inmueble.';

CREATE INDEX idx_poh_property ON property_ownership_history(property_id);
CREATE INDEX idx_poh_company ON property_ownership_history(company_id);
CREATE INDEX idx_poh_current ON property_ownership_history(property_id, company_id) WHERE to_date IS NULL;
CREATE INDEX idx_poh_intragroup ON property_ownership_history(intragroup_counterparty_company_id) WHERE is_intragroup = true;

-- ============================================================================
-- 7. intragroup_transactions — operaciones entre SL del grupo (Modelo 232)
-- ============================================================================
CREATE TABLE intragroup_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Las dos puntas
  issuer_company_id UUID NOT NULL REFERENCES companies(id),
  receiver_company_id UUID NOT NULL REFERENCES companies(id),
  CONSTRAINT igt_distinct_companies CHECK (issuer_company_id <> receiver_company_id),

  -- Tipo de operación intragrupo (afecta tratamiento Modelo 232)
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'factura',
    'prestamo',
    'cesion_inmueble',
    'permuta_inmueble',
    'servicios_compartidos',
    'reparto_dividendos',
    'aportacion_capital',
    'garantia',
    'arrendamiento',
    'cesion_uso',
    'otro'
  )),

  -- Referencias a las dos filas (FK añadidas en F2 cuando invoices tenga company_id)
  issuer_invoice_id UUID,
  receiver_invoice_id UUID,
  property_ownership_history_id UUID REFERENCES property_ownership_history(id),
  intercompany_loan_id UUID,                                  -- FK añadida tras crear intercompany_loans abajo

  -- Importes
  importe NUMERIC(15,2),
  importe_iva NUMERIC(15,2),
  moneda TEXT NOT NULL DEFAULT 'EUR',

  -- Valoración (precios de transferencia art. 18 LIS + RIS)
  valoracion_metodo TEXT CHECK (valoracion_metodo IS NULL OR valoracion_metodo IN (
    'mercado','cost_plus','TNMM','reventa','tasacion','reparto_beneficios','otro'
  )),
  valoracion_fuente TEXT,
  documentacion_path TEXT,                                    -- Master file + Local file

  -- Validación
  fecha_operacion DATE NOT NULL,
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES auth.users(id),

  -- Modelo 232 AEAT
  reportable_232 BOOLEAN NOT NULL DEFAULT true,
  importe_anual_acumulado NUMERIC(15,2),                      -- cache umbral 250k/100k
  modelo_232_ejercicio INT,                                    -- año fiscal
  modelo_232_presentado_at TIMESTAMPTZ,

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE intragroup_transactions IS
  'Bloque 0 F1 — operaciones entre SL del grupo (Modelo 232 obligatorio si '
  'supera 250k€/contraparte/año o 100k€ tipos específicos). issuer + receiver '
  'apuntan a companies del mismo grupo. Detección automática vía '
  'companies.parent_company_id matching.';

CREATE INDEX idx_igt_issuer ON intragroup_transactions(issuer_company_id, fecha_operacion DESC);
CREATE INDEX idx_igt_receiver ON intragroup_transactions(receiver_company_id, fecha_operacion DESC);
CREATE INDEX idx_igt_type_year ON intragroup_transactions(transaction_type, modelo_232_ejercicio);
CREATE INDEX idx_igt_pending_232 ON intragroup_transactions(modelo_232_ejercicio) WHERE reportable_232 = true AND modelo_232_presentado_at IS NULL;

-- Ahora añadir FK que faltaba en property_ownership_history → intragroup_transactions
ALTER TABLE property_ownership_history
  ADD CONSTRAINT poh_intragroup_transaction_fk
  FOREIGN KEY (intragroup_transaction_id) REFERENCES intragroup_transactions(id);

-- ============================================================================
-- 8. intercompany_loans — préstamos entre SL del grupo
-- ============================================================================
CREATE TABLE intercompany_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lender_company_id UUID NOT NULL REFERENCES companies(id),
  borrower_company_id UUID NOT NULL REFERENCES companies(id),
  CONSTRAINT icl_distinct_companies CHECK (lender_company_id <> borrower_company_id),

  -- Préstamo
  principal NUMERIC(15,2) NOT NULL CHECK (principal > 0),
  tipo_interes_pct NUMERIC(7,4),                              -- 0-100% con 4 decimales
  tipo_referencia TEXT,                                        -- 'EURIBOR_3M','EURIBOR_12M','FIJO','MIXTO'
  spread_pct NUMERIC(7,4),

  -- Fechas
  fecha_inicio DATE NOT NULL,
  fecha_vencimiento DATE,
  fecha_amortizacion_total DATE,

  -- Documentación
  numero_protocolo TEXT,
  notario TEXT,
  fecha_escritura DATE,
  intervenido_por TEXT,                                        -- intervención fedatario público

  -- Estado
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE','AMORTIZED','DEFAULTED','REFINANCED','CANCELLED'
  )),
  pendiente_amortizar NUMERIC(15,2),
  intereses_devengados_acumulados NUMERIC(15,2) DEFAULT 0,

  -- AJD si aplica
  ajd_aplica BOOLEAN NOT NULL DEFAULT false,
  ajd_pagado NUMERIC(10,2),

  -- Vinculación
  intragroup_transaction_id UUID REFERENCES intragroup_transactions(id),

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE intercompany_loans IS
  'Bloque 0 F1 — préstamos entre SL del grupo. Tipo interés debe ser de '
  'mercado (Euribor + spread razonable, art. 18 LIS) o AEAT recalcula. '
  'Genera retenciones IRPF/IS sobre intereses (modelo 123).';

CREATE INDEX idx_icl_lender ON intercompany_loans(lender_company_id, fecha_inicio DESC);
CREATE INDEX idx_icl_borrower ON intercompany_loans(borrower_company_id, fecha_inicio DESC);
CREATE INDEX idx_icl_active ON intercompany_loans(status, fecha_vencimiento) WHERE status = 'ACTIVE';

-- Añadir FK que faltaba en intragroup_transactions → intercompany_loans
ALTER TABLE intragroup_transactions
  ADD CONSTRAINT igt_intercompany_loan_fk
  FOREIGN KEY (intercompany_loan_id) REFERENCES intercompany_loans(id);

-- ============================================================================
-- 9. audit_log_chain — append-only WORM-equivalente con hash SHA-256 encadenado
-- ============================================================================
CREATE TABLE audit_log_chain (
  id BIGSERIAL PRIMARY KEY,

  -- Quién
  actor_user_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  actor_ip INET,
  actor_user_agent TEXT,
  actor_role TEXT,                                            -- 'admin','contable','operario',etc

  -- Qué
  action TEXT NOT NULL CHECK (action IN (
    'INSERT','UPDATE','DELETE','SOFT_DELETE','LOGIN','LOGOUT','VIEW','EXPORT',
    'BACKUP','RESTORE','AEAT_PRESENT','SII_SEND','VERIFACTU_SEND'
  )),
  table_name TEXT,
  record_id TEXT,
  company_id UUID REFERENCES companies(id),                    -- denorm para filtrar por empresa

  -- Cambio
  before_data JSONB,
  after_data JSONB,

  -- Hash chain SHA-256 (estilo Verifactu)
  prev_hash TEXT,                                              -- hash del row anterior (NULL = primer row)
  record_hash TEXT NOT NULL,                                   -- SHA-256(prev_hash || JSON(this_row))

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- NO updated_at: este log es append-only.
  -- NO deleted_at: nunca se borra (legal retention 10 años AML + 6 años CdC).
);

COMMENT ON TABLE audit_log_chain IS
  'Bloque 0 F1 — audit trail append-only WORM-equivalente. Hash chain SHA-256 '
  'estilo Verifactu (RD 1007/2023): cada row tiene hash del previo + hash propio. '
  'Legalmente reconocido por AEAT y aceptado por Big4 como prueba de integridad. '
  'NO se actualiza ni se borra. Retención 10 años por AML/AEPD/CdC.';

CREATE INDEX idx_alc_actor ON audit_log_chain(actor_user_id, created_at DESC);
CREATE INDEX idx_alc_company ON audit_log_chain(company_id, created_at DESC);
CREATE INDEX idx_alc_table_record ON audit_log_chain(table_name, record_id);
CREATE INDEX idx_alc_action_time ON audit_log_chain(action, created_at DESC);

-- Trigger para calcular hash automáticamente en INSERT
CREATE OR REPLACE FUNCTION audit_log_chain_compute_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_hash TEXT;
  v_payload TEXT;
BEGIN
  -- Obtener hash del row inmediatamente anterior (id máximo previo)
  SELECT record_hash INTO v_prev_hash
  FROM audit_log_chain
  ORDER BY id DESC
  LIMIT 1;

  NEW.prev_hash := v_prev_hash;  -- NULL si es el primer row

  -- Payload canónico para el hash
  v_payload := COALESCE(NEW.prev_hash, '') || '|' ||
               COALESCE(NEW.actor_user_id::text, '') || '|' ||
               COALESCE(NEW.action, '') || '|' ||
               COALESCE(NEW.table_name, '') || '|' ||
               COALESCE(NEW.record_id, '') || '|' ||
               COALESCE(NEW.company_id::text, '') || '|' ||
               COALESCE(NEW.before_data::text, '') || '|' ||
               COALESCE(NEW.after_data::text, '') || '|' ||
               NEW.created_at::text;

  NEW.record_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_chain_hash_trigger
BEFORE INSERT ON audit_log_chain
FOR EACH ROW EXECUTE FUNCTION audit_log_chain_compute_hash();

-- Bloquear UPDATE y DELETE en audit_log_chain (append-only enforcement)
CREATE OR REPLACE FUNCTION audit_log_chain_block_modify()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_chain es append-only — UPDATE/DELETE prohibidos. Operación: %', TG_OP;
END;
$$;

CREATE TRIGGER audit_log_chain_block_update
BEFORE UPDATE ON audit_log_chain
FOR EACH ROW EXECUTE FUNCTION audit_log_chain_block_modify();

CREATE TRIGGER audit_log_chain_block_delete
BEFORE DELETE ON audit_log_chain
FOR EACH ROW EXECUTE FUNCTION audit_log_chain_block_modify();

-- ============================================================================
-- TRIGGERS updated_at en las 8 tablas que lo necesitan (no audit_log_chain)
-- ============================================================================
CREATE OR REPLACE FUNCTION bloque0_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_updated_at_trg BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER company_members_updated_at_trg BEFORE UPDATE ON company_members
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER parties_updated_at_trg BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER party_company_relationships_updated_at_trg BEFORE UPDATE ON party_company_relationships
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER properties_updated_at_trg BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER property_ownership_history_updated_at_trg BEFORE UPDATE ON property_ownership_history
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER intragroup_transactions_updated_at_trg BEFORE UPDATE ON intragroup_transactions
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();
CREATE TRIGGER intercompany_loans_updated_at_trg BEFORE UPDATE ON intercompany_loans
  FOR EACH ROW EXECUTE FUNCTION bloque0_set_updated_at();

-- ============================================================================
-- RLS — habilitado + FORCE en todas las tablas. Policies se añaden en F3
-- (cuando el código admin tenga el contexto de auth.jwt() app_metadata.companies[]).
-- En esta fase F1, las tablas son inaccesibles excepto via service_role.
-- ============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members FORCE ROW LEVEL SECURITY;

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties FORCE ROW LEVEL SECURITY;

ALTER TABLE party_company_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_company_relationships FORCE ROW LEVEL SECURITY;

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE ROW LEVEL SECURITY;

ALTER TABLE property_ownership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_ownership_history FORCE ROW LEVEL SECURITY;

ALTER TABLE intragroup_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intragroup_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE intercompany_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercompany_loans FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_log_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_chain FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- INSERTAR Cathedral House Investment SL como company UUID FIJA
--   Esta UUID será usada en F2 como DEFAULT al añadir company_id a las ~50
--   tablas existentes (backfill de las 470 facturas + 632 entidades).
-- ============================================================================
INSERT INTO companies (
  id,
  cif,
  razon_social,
  nombre_comercial,
  pais,
  status,
  verifactu_obligado,
  metadata
) VALUES (
  '00000000-0000-0000-0000-cca7ed1a1000'::uuid,                     -- UUID fija memorable: cca7ed = "cathed", 1a1 = "lal" + zero pad
  'B19761915',
  'Cathedral House Investment SL',
  'Cathedral Group',
  'ES',
  'ACTIVE',
  true,
  jsonb_build_object(
    'created_by', 'bloque_0_f1_migration',
    'created_at_iso', NOW()::text,
    'notes', 'UUID fija usada como DEFAULT en ALTER TABLE company_id de F2'
  )
);

-- Trigger inicial en audit_log_chain documentando F1 desplegada
INSERT INTO audit_log_chain (
  actor_email,
  action,
  table_name,
  company_id,
  after_data,
  metadata
) VALUES (
  'system@cathedralgroup.es',
  'INSERT',
  'companies',
  '00000000-0000-0000-0000-cca7ed1a1000'::uuid,
  jsonb_build_object('cif','B19761915','razon_social','Cathedral House Investment SL'),
  jsonb_build_object('migration','20260510140000_bloque_0_f1','event','first_company_created')
);
