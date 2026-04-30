-- ============================================================================
-- Migración: Alquileres · Fase 1.D
-- Fecha: 2026-04-29
-- Tablas:
--   - rental_contracts_in   (Cathedral arrendataria — oficina, almacén)
--   - rental_contracts_out  (Cathedral arrendadora — inversión inmobiliaria)
--   - rental_payments       (recibos/facturas mensuales, ambos sentidos)
--   - rental_indexations    (revisiones IPC/IRAV/IGC)
-- Normativa: LAU 29/1994, RD 7/2019, Ley 12/2023 vivienda, LIVA, LIRPF
-- ============================================================================

-- ============================================================================
-- rental_contracts (tabla unificada con campo `cathedral_role`)
-- ============================================================================
-- Decisión: usar UNA tabla con `cathedral_role` IN ('arrendador','arrendatario')
-- en lugar de dos tablas idénticas. Más simple de mantener.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rental_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_code TEXT,

  -- Rol Cathedral
  cathedral_role TEXT NOT NULL CHECK (cathedral_role IN ('arrendador','arrendatario')),

  -- Tipo de arrendamiento (LAU)
  contract_type TEXT NOT NULL CHECK (contract_type IN
    ('vivienda_habitual','vivienda_temporal','vivienda_turistica','local_negocio',
     'oficina','garaje','trastero','nave_industrial','coworking','espacio_vending','mixto','otro')),
  lau_regime TEXT,
    -- LAU_1994_post_2019 | LAU_post_2023_zona_tensionada | LAU_uso_distinto_vivienda

  -- Arrendador
  landlord_nif TEXT,
  landlord_nombre TEXT,
  landlord_es_empresa BOOLEAN DEFAULT FALSE,
  landlord_iban TEXT,
  landlord_iae_epigrafe TEXT,
  landlord_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  landlord_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Arrendatario
  tenant_nif TEXT,
  tenant_nombre TEXT,
  tenant_es_empresa BOOLEAN DEFAULT FALSE,
  co_tenants JSONB,
  -- jsonb [{nif, nombre, %_responsabilidad, solidaria}]
  guarantor_nif TEXT,
  guarantor_nombre TEXT,
  bank_guarantee JSONB,
  -- jsonb {bank, importe, vigencia, doc_url}

  -- Inmueble
  property_address_full TEXT,
  property_via_publica TEXT,
  property_numero TEXT,
  property_resto_direccion TEXT,
  property_codigo_postal TEXT,
  property_municipio TEXT,
  property_provincia TEXT,
  property_codigo_pais TEXT DEFAULT 'ES',
  referencia_catastral TEXT,
  finca_registral TEXT,
  registro_propiedad TEXT,
  usable_m2 NUMERIC(10,2),
  built_m2 NUMERIC(10,2),
  num_habitaciones INTEGER,
  num_banos INTEGER,
  annexes JSONB,
  -- jsonb [{tipo: garaje|trastero, ref_catastral, m2}]

  -- Fechas
  signing_date DATE NOT NULL,
  start_date DATE NOT NULL,
  expected_end_date DATE,
  forced_extension_end DATE,
  voluntary_extension_end DATE,
  actual_end_date DATE,

  -- Renta
  monthly_rent_base NUMERIC(10,2) NOT NULL,
  payment_periodicity TEXT DEFAULT 'mensual'
    CHECK (payment_periodicity IN ('mensual','trimestral','semestral','anual')),
  payment_day INTEGER CHECK (payment_day IS NULL OR (payment_day BETWEEN 1 AND 31)),
  payment_method TEXT,
  -- transferencia | recibo_SEPA | efectivo | confirming
  iban_cobro TEXT,
  iban_pago TEXT,

  -- Indexación (revisión anual)
  indexation_index TEXT
    CHECK (indexation_index IS NULL OR indexation_index IN ('IPC','IGC','IRAV','ninguno','otro')),
  indexation_cap_pct NUMERIC(5,3),
  -- Tope: 2% (2023) | 3% (2024) | IRAV (2025+) en zona tensionada
  indexation_anniversary_month INTEGER,

  -- Fianza (LAU art. 36)
  deposit_amount NUMERIC(10,2),
  deposit_ivima_resolution TEXT,
  -- Decreto CAM 181/1996 — depósito IVIMA obligatorio
  deposit_ivima_date DATE,
  deposit_returned_date DATE,
  additional_guarantee_amount NUMERIC(10,2),
  -- Garantía adicional (aval, depósito extra) max 2 mens. (LAU 36.5)

  -- Gastos repercutibles
  expenses_breakdown JSONB,
  -- jsonb {ibi_pct_tenant, comunidad, basuras, conservacion, suministros}

  -- Cláusulas
  improvements_clause TEXT,
  subrogation_clause BOOLEAN DEFAULT TRUE,
  assignment_subletting_allowed BOOLEAN DEFAULT FALSE,
  resolutory_clause TEXT,
  covenants JSONB,
  -- jsonb [{tipo: mascotas/fumadores/uso, valor: BOOLEAN/TEXT}]

  -- Mobiliario / inventario
  inventory_attached BOOLEAN DEFAULT FALSE,
  inventory_url TEXT,
  amueblada BOOLEAN DEFAULT FALSE,

  -- Documentos energéticos / habitabilidad
  cee_url TEXT,
  cee_letter CHAR(1) CHECK (cee_letter IS NULL OR cee_letter IN ('A','B','C','D','E','F','G')),
  cee_emission_kgco2_m2 NUMERIC(8,2),
  cedula_habitabilidad_url TEXT,
  initial_state_photos_urls TEXT[],

  -- Suministros
  utilities_holder JSONB,
  -- jsonb {agua: arrendador|arrendatario, luz, gas, internet}

  -- Régimen IVA / IRPF
  vat_regime TEXT,
  -- exento_vivienda | sujeto_21 | sujeto_10_temporal_servicios | exento_garaje_anejo
  vat_pct NUMERIC(4,2),
  vat_renounced BOOLEAN DEFAULT FALSE,
  irpf_withholding_required BOOLEAN DEFAULT FALSE,
  irpf_withholding_pct NUMERIC(4,2),
  irpf_withholding_exemption_reason TEXT,
  -- epigrafe_iae_8612 | vivienda_no_actividad | no_aplica
  landlord_taxation_regime TEXT,
  -- RCI_persona_fisica | IS_sociedad | atribucion_rentas
  irpf_reduction_pct NUMERIC(5,2),
  -- LIRPF art. 23.2: 60/90/70/50% según Ley vivienda 2023

  -- Modelos AEAT que aplican
  model_115_quarterly BOOLEAN DEFAULT FALSE,
  model_180_annual BOOLEAN DEFAULT FALSE,
  model_184_obligation BOOLEAN DEFAULT FALSE,
  model_347_threshold_exceeded BOOLEAN DEFAULT FALSE,
  non_resident_landlord BOOLEAN DEFAULT FALSE,

  -- Vinculación interna
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  cost_center TEXT,
  internal_responsible_user_id UUID,
  accounting_account TEXT,
  -- 621 (gastos arrendamiento) o 705/752 (ingresos)

  -- Estado
  status TEXT DEFAULT 'borrador'
    CHECK (status IN ('borrador','firmado','vigente','prorrogado','vencido','resuelto','archivado')),
  termination_reason TEXT,
  eviction_in_progress BOOLEAN DEFAULT FALSE,
  eviction_court_case_ref TEXT,

  -- Documento original
  drive_folder_url TEXT,
  contract_pdf_url TEXT,
  file_hash TEXT,
  source TEXT DEFAULT 'manual',
  email_message_id TEXT,
  email_account TEXT,

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,
  ai_confidence NUMERIC(4,2),
  needs_review BOOLEAN DEFAULT FALSE,
  ai_razones TEXT[],

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  usuario_modificacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rental_role ON rental_contracts(cathedral_role);
CREATE INDEX IF NOT EXISTS idx_rental_status ON rental_contracts(status);
CREATE INDEX IF NOT EXISTS idx_rental_referencia_catastral ON rental_contracts(referencia_catastral) WHERE referencia_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_project_id ON rental_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_rental_expected_end ON rental_contracts(expected_end_date) WHERE status='vigente';
CREATE INDEX IF NOT EXISTS idx_rental_landlord_nif ON rental_contracts(landlord_nif);
CREATE INDEX IF NOT EXISTS idx_rental_tenant_nif ON rental_contracts(tenant_nif);

COMMENT ON TABLE rental_contracts IS
  'Contratos de arrendamiento (LAU 29/1994 + Ley 12/2023). Cathedral_role distingue si Cathedral es arrendadora o arrendataria. Una sola tabla evita duplicación.';

-- ============================================================================
-- rental_payments (recibos/facturas mensuales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rental_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,

  -- Periodo
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  due_date DATE NOT NULL,

  -- Importes
  base_amount NUMERIC(10,2) NOT NULL,
  vat_amount NUMERIC(10,2) DEFAULT 0,
  vat_pct NUMERIC(4,2) DEFAULT 0,
  irpf_withholding_amount NUMERIC(10,2) DEFAULT 0,
  irpf_withholding_pct NUMERIC(4,2) DEFAULT 0,
  expenses_passthrough JSONB,
  -- jsonb [{concepto: ibi/comunidad/basuras/luz, importe}]
  discount_amount NUMERIC(10,2) DEFAULT 0,
  total_billed NUMERIC(10,2),
  total_received NUMERIC(10,2),
  payment_date DATE,
  payment_method TEXT,
  bank_movement_id UUID,
  -- FK preparada para conciliación bancaria (Fase 1.F)

  -- Recibo / factura
  invoice_number TEXT,
  invoice_series TEXT,
  invoice_pdf_url TEXT,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Verifactu
  verifactu_qr_url TEXT,
  verifactu_hash TEXT,

  -- Modelos AEAT
  model_303_period TEXT,
  model_115_period TEXT,
  model_347_included BOOLEAN DEFAULT FALSE,

  -- Impagos
  unpaid BOOLEAN DEFAULT FALSE,
  unpaid_action TEXT,
  -- requerimiento | burofax | monitorio | desahucio | condonado | incobrable
  dudoso_cobro BOOLEAN DEFAULT FALSE,
  -- LIS art. 13.1: deducible 6 meses (gran emp.) / 3 meses (PYME)

  -- Auditoría
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (contract_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_rental_pay_contract ON rental_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_rental_pay_unpaid ON rental_payments(unpaid) WHERE unpaid=TRUE;
CREATE INDEX IF NOT EXISTS idx_rental_pay_period ON rental_payments(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_rental_pay_due_date ON rental_payments(due_date) WHERE total_received IS NULL;

-- ============================================================================
-- rental_indexations (revisiones IPC/IRAV anuales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rental_indexations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  index_type TEXT NOT NULL,
  -- IPC | IRAV | IGC | otro
  index_base_value NUMERIC(10,4),
  index_current_value NUMERIC(10,4),
  pct_applied NUMERIC(5,3),
  cap_applied_pct NUMERIC(5,3),
  -- Tope normativo aplicado (2/3/IRAV)
  previous_rent NUMERIC(10,2),
  new_rent NUMERIC(10,2),
  notification_date DATE,
  notification_method TEXT,
  -- burofax | email_certificado | carta | in_person
  notification_doc_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_rental_idx_contract ON rental_indexations(contract_id, effective_date DESC);

NOTIFY pgrst, 'reload schema';
