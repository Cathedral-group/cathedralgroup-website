-- ============================================================================
-- Migración: Flota + Renting + Combustible + Dietas km · Fase 1.E
-- Fecha: 2026-04-29
-- Normativa: LTSV (RDL 6/2015), LIVA art. 95.Tres, LIRPF art. 42-43,
--            LIS DA 7ª (leasing), RD 920/2017 ITV, RD 1627/1997 obras
-- ============================================================================

-- ============================================================================
-- vehicle_fleet (flota propia + en renting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_fleet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación
  plate TEXT NOT NULL UNIQUE,
  vin CHAR(17),
  make TEXT,
  model TEXT,
  version TEXT,
  color TEXT,
  manufacture_year INTEGER,
  first_registration_date DATE,

  -- Categoría DGT
  category TEXT,
  -- M1_turismo | N1_furgoneta | N2 | M2 | L_moto
  fuel_type TEXT,
  -- gasolina | diesel | glp | gnc | glp_dual | electrico_bev | hibrido_hev | hibrido_phev | hidrogeno | otro
  co2_g_km_wltp NUMERIC(6,2),
  power_kw NUMERIC(6,2),
  power_cv NUMERIC(6,2),
  power_fiscal_cv NUMERIC(6,2),
  dgt_label TEXT,
  -- 0_AZUL | ECO | C_VERDE | B_AMARILLA | sin_etiqueta
  mass_max_kg INTEGER,
  seats INTEGER,

  -- Adquisición
  acquisition_method TEXT,
  -- compra | leasing_finalizado | renting | donacion | herencia
  acquisition_date DATE,
  acquisition_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  acquisition_cost_total NUMERIC(14,2),
  acquisition_vat_amount NUMERIC(14,2),
  acquisition_vat_deductible_pct NUMERIC(5,2),
  acquisition_vat_deduction_evidence TEXT[],
  acquisition_iedmt_amount NUMERIC(14,2),
  -- Impuesto Especial Determinados Medios Transporte (matriculación)

  -- Amortización
  current_book_value NUMERIC(14,2),
  amortization_pct_yearly NUMERIC(5,2) DEFAULT 16.00,
  -- 16% turismos LIS art. 12 + Anexo
  amortization_method TEXT DEFAULT 'lineal',
  -- lineal | degresivo
  min_amortization_years INTEGER DEFAULT 6,
  accelerated_amortization_applied BOOLEAN DEFAULT FALSE,

  -- Asignación / uso
  assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  usage_type TEXT,
  -- pool | asignado_directivo | asignado_obra | comercial | mixto
  business_use_pct NUMERIC(5,2),
  private_use_pct NUMERIC(5,2),
  in_kind_yearly_estimate NUMERIC(14,2),
  -- LIRPF 43.1.1.b: 20% × coste × %privado
  eco_label_reduction_pct NUMERIC(5,2),
  -- DA 49 LIRPF: 15/20/30% según etiqueta

  -- Permiso circulación
  permit_number TEXT,
  permit_holder_nif TEXT,
  permit_issue_date DATE,
  permit_pdf_url TEXT,
  technical_card_pdf_url TEXT,

  -- Estado
  current_km INTEGER,
  last_km_reading_date DATE,
  status TEXT DEFAULT 'activo'
    CHECK (status IN ('activo','baja_temporal','baja_definitiva','exportacion','desguace','vendido')),
  decommission_date DATE,
  desguace_certificate_url TEXT,

  -- Tarjetas / GPS
  gps_provider TEXT,
  gps_required_for_business_proof BOOLEAN DEFAULT FALSE,

  -- Contabilidad
  accounting_account_asset TEXT DEFAULT '218',
  cost_center_id UUID,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,

  -- Auditoría
  notes TEXT,
  drive_folder_url TEXT,
  usuario_creacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vehicle_status ON vehicle_fleet(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_assigned_employee ON vehicle_fleet(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_dgt_label ON vehicle_fleet(dgt_label);

-- ============================================================================
-- vehicle_rentings (contratos renting / leasing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_rentings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_code TEXT,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('renting_operativo','leasing_financiero','compra_plazos')),
  vehicle_id UUID REFERENCES vehicle_fleet(id) ON DELETE SET NULL,
  provider_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  provider_nif TEXT,
  provider_nombre TEXT,

  -- Fechas / duración
  start_date DATE NOT NULL,
  end_date DATE,
  duration_months INTEGER,

  -- Kilometraje
  contracted_km_total INTEGER,
  contracted_km_year INTEGER,
  extra_km_unit_cost NUMERIC(8,4),

  -- Económico
  monthly_fee_base NUMERIC(10,2) NOT NULL,
  vat_pct NUMERIC(4,2) DEFAULT 21.00,
  monthly_fee_total NUMERIC(10,2),
  vat_deduction_pct NUMERIC(5,2) DEFAULT 50.00,
  -- LIVA art. 95.Tres: 50% turismo (presunción), 100% si afectación 100% probada

  -- Servicios incluidos
  services_included JSONB,
  -- jsonb {mantenimiento, neumaticos, seguro_rc, seguro_todo_riesgo, itv, ivtm, asistencia, vehiculo_sustitucion, gestoria_multas}

  -- Penalizaciones
  early_termination_penalty TEXT,
  low_km_refund NUMERIC(10,2),

  -- Leasing financiero (LIS DA 7ª)
  purchase_option_amount NUMERIC(10,2),
  purchase_option_date DATE,
  residual_value NUMERIC(10,2),
  financial_principal NUMERIC(10,2),
  financial_interest_total NUMERIC(10,2),
  effective_interest_rate_tae NUMERIC(5,3),

  -- Pago
  iban_domiciliation TEXT,

  -- Asignación
  assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  usage_type TEXT,
  -- 100_empresa | mixto | 100_particular
  business_use_pct NUMERIC(5,2),
  private_use_pct NUMERIC(5,2),
  vehicle_acquisition_value_for_in_kind NUMERIC(14,2),
  market_value_used_for_renting NUMERIC(14,2),

  -- Vinculaciones
  cost_center_id UUID,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  bond_deposit NUMERIC(10,2),
  bond_returned_date DATE,

  -- Estado
  status TEXT DEFAULT 'activo'
    CHECK (status IN ('borrador','activo','rescatado','finalizado','renovado')),

  -- Capa "extraer todo"
  texto_completo TEXT,
  datos_brutos JSONB,
  datos_extraidos JSONB,
  drive_url TEXT,
  file_hash TEXT,
  source TEXT DEFAULT 'manual',
  email_message_id TEXT,

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_renting_vehicle ON vehicle_rentings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_renting_status ON vehicle_rentings(status);

-- ============================================================================
-- vehicle_itv (RD 920/2017 inspecciones)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_itv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicle_fleet(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  result TEXT CHECK (result IN ('favorable','desfavorable_leve','desfavorable_grave','negativa')),
  next_due_date DATE,
  inspection_station TEXT,
  inspection_fee NUMERIC(10,2),
  tarjeta_itv_pdf_url TEXT,
  defects JSONB,
  cost_center_id UUID,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itv_vehicle ON vehicle_itv(vehicle_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_itv_next_due ON vehicle_itv(next_due_date) WHERE result='favorable';

-- ============================================================================
-- vehicle_insurance (Ley 50/1980 + RDL 8/2004 LRCSCVM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicle_fleet(id) ON DELETE CASCADE,
  insurer_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  insurer_nombre TEXT,
  policy_number TEXT NOT NULL,
  coverage_type TEXT,
  -- rc_obligatorio | terceros | terceros_ampliado | todo_riesgo | todo_riesgo_franquicia
  start_date DATE,
  end_date DATE,
  premium_yearly NUMERIC(10,2),
  premium_periodicity TEXT,
  -- anual | semestral | trimestral | mensual
  franchise_amount NUMERIC(10,2),
  coverage_capital NUMERIC(14,2),
  additional_coverage JSONB,
  -- jsonb {lunas, robo, asistencia, conductor, accidentes_ocupantes}
  policy_pdf_url TEXT,
  iban_domiciliation TEXT,
  nominated_drivers JSONB,
  -- jsonb [{employee_id, dni, age}]
  unnamed_driver_clause BOOLEAN DEFAULT FALSE,
  young_driver_clause BOOLEAN DEFAULT FALSE,
  bonus_malus_class TEXT,
  status TEXT DEFAULT 'activa',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insurance_vehicle ON vehicle_insurance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_insurance_end_date ON vehicle_insurance(end_date) WHERE status='activa';

-- ============================================================================
-- vehicle_ivtm (Impuesto Vehículos Tracción Mecánica - municipal)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_ivtm (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicle_fleet(id) ON DELETE CASCADE,
  municipality TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  amount NUMERIC(10,2),
  paid_date DATE,
  receipt_pdf_url TEXT,
  bonification_pct NUMERIC(5,2),
  -- Bonificaciones eléctricos hasta 75% según ayuntamiento
  iban_domiciliation TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (vehicle_id, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_ivtm_vehicle ON vehicle_ivtm(vehicle_id, fiscal_year DESC);

-- ============================================================================
-- vehicle_fines (multas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicle_fleet(id) ON DELETE CASCADE,
  fine_reference TEXT NOT NULL,
  issuing_authority TEXT,
  -- DGT | Ayto Madrid | Guardia Civil | otro
  infraction_date DATE,
  infraction_location TEXT,
  infraction_type TEXT,
  fine_amount_full NUMERIC(10,2),
  early_payment_amount NUMERIC(10,2),
  points_subtracted INTEGER DEFAULT 0,
  driver_at_time_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  driver_identified_to_authority BOOLEAN DEFAULT FALSE,
  -- LTSV art. 11.1: titular debe identificar al conductor
  appealed BOOLEAN DEFAULT FALSE,
  appeal_status TEXT,
  paid_date DATE,
  non_deductible_in_corporate_tax BOOLEAN DEFAULT TRUE,
  -- LIS art. 15.c: multas NO deducibles
  notes TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fines_vehicle ON vehicle_fines(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fines_appealed ON vehicle_fines(appealed) WHERE appealed=TRUE;

-- ============================================================================
-- vehicle_maintenance (mantenimientos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicle_fleet(id) ON DELETE CASCADE,
  service_date DATE,
  service_type TEXT,
  -- revision_oficial | neumaticos | frenos | aceite | aire_acondicionado | electrica | carroceria | mecanica | lavado
  provider_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount_base NUMERIC(10,2),
  vat NUMERIC(10,2),
  total NUMERIC(10,2),
  current_km_at_service INTEGER,
  next_service_km INTEGER,
  parts_replaced JSONB,
  vat_deduction_pct NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maint_vehicle ON vehicle_maintenance(vehicle_id, service_date DESC);

-- ============================================================================
-- fuel_cards (tarjetas combustible)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fuel_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number_masked TEXT,
  -- Solo últimos 4 dígitos por GDPR
  issuer TEXT,
  -- Solred | Cepsa StarDirect | Galp Frota | BP_PlusCard | Shell_EuroShell | DKV | UTA
  holder_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  assigned_vehicle_id UUID REFERENCES vehicle_fleet(id) ON DELETE SET NULL,
  iban_domiciliation TEXT,
  monthly_limit NUMERIC(10,2),
  weekly_limit NUMERIC(10,2),
  pin_set BOOLEAN DEFAULT TRUE,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'activa'
    CHECK (status IN ('activa','bloqueada','cancelada')),
  allowed_products JSONB,
  geographic_restrictions TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- fuel_card_transactions (transacciones combustible)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fuel_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES fuel_cards(id) ON DELETE CASCADE,
  transaction_datetime TIMESTAMPTZ NOT NULL,
  station_name TEXT,
  station_address TEXT,
  station_nif TEXT,
  product_type TEXT,
  -- gasolina_95 | gasolina_98 | diesel_b7 | diesel_b10 | adblue | glp | gnc | kwh_recarga | hidrogeno | parking | peaje | lavado | otros
  quantity NUMERIC(10,3),
  unit_price NUMERIC(8,4),
  amount_base NUMERIC(10,2),
  vat_pct NUMERIC(4,2) DEFAULT 21.00,
  vat_amount NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  vehicle_id UUID REFERENCES vehicle_fleet(id) ON DELETE SET NULL,
  driver_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  odometer_km INTEGER,
  consumption_l_100km_calculated NUMERIC(6,2),
  is_anomalous BOOLEAN DEFAULT FALSE,
  simplified_invoice_url TEXT,
  full_invoice_required BOOLEAN DEFAULT TRUE,
  full_invoice_url TEXT,
  vat_deduction_pct_applied NUMERIC(5,2),
  model_303_period TEXT,
  model_347_supplier_threshold BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fuel_tx_card ON fuel_card_transactions(card_id, transaction_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_tx_vehicle ON fuel_card_transactions(vehicle_id, transaction_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_tx_anomalous ON fuel_card_transactions(is_anomalous) WHERE is_anomalous=TRUE;

-- ============================================================================
-- mileage_dietas (dietas km RIRPF art. 9.A.2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS mileage_dietas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expense_report_id UUID,
  trip_date DATE NOT NULL,
  trip_purpose TEXT NOT NULL,
  -- TS exige acreditar motivo (visita obra, reunión cliente, gestión administrativa)
  origin_address TEXT,
  destination_address TEXT,
  route_calculated_km NUMERIC(8,2),
  -- Calculado vía Google Maps API
  claimed_km NUMERIC(8,2) NOT NULL,
  vehicle_used_type TEXT NOT NULL CHECK (vehicle_used_type IN ('propio_empleado','empresa_propia','empresa_renting')),
  -- Solo "propio_empleado" tiene dieta km exenta IRPF
  employee_vehicle_plate TEXT,
  unit_amount_per_km NUMERIC(6,4) DEFAULT 0.26,
  -- BOE Orden HFP/792/2023: 0,26€/km exento desde 17/07/2023
  claimed_amount NUMERIC(10,2),
  tax_exempt_amount NUMERIC(10,2),
  tax_taxable_amount NUMERIC(10,2),
  parking_attached_amount NUMERIC(10,2),
  tolls_attached_amount NUMERIC(10,2),
  receipts_attached_urls TEXT[],
  corporate_event_link TEXT,
  approved_by_user_id UUID,
  approved_at TIMESTAMPTZ,
  paid_with_payroll_period TEXT,
  -- YYYY-MM
  payroll_id UUID REFERENCES payrolls(id) ON DELETE SET NULL,
  model_190_clave TEXT DEFAULT 'A',
  -- Si tributable: clave A renta del trabajo
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dietas_employee ON mileage_dietas(employee_id, trip_date DESC);
CREATE INDEX IF NOT EXISTS idx_dietas_payroll ON mileage_dietas(payroll_id);
CREATE INDEX IF NOT EXISTS idx_dietas_pending_payment ON mileage_dietas(employee_id) WHERE payroll_id IS NULL;

NOTIFY pgrst, 'reload schema';
