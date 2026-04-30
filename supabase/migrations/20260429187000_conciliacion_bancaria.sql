-- ============================================================================
-- Migración: Conciliación bancaria · Fase 1.F
-- Fecha: 2026-04-29
-- Tablas:
--   - bank_accounts (cuentas Cathedral — Bankinter, Eurocaja, Sabadell, etc.)
--   - bank_statements (extractos PDF mensuales)
--   - bank_movements (ampliada con campos profesionales)
--   - bank_reconciliations (matching movimiento ↔ entidad)
-- ============================================================================

-- ============================================================================
-- bank_accounts (cuentas bancarias Cathedral)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación
  iban TEXT NOT NULL UNIQUE,
  bic_swift TEXT,
  bank_name TEXT NOT NULL,
  -- Bankinter, Eurocaja, Sabadell, BBVA, Santander, etc.
  bank_branch TEXT,
  account_alias TEXT,
  -- Nombre interno: "Cuenta operativa Bankinter", "Cuenta hipotecas", etc.
  account_holder_nif TEXT DEFAULT 'B19761915',
  account_holder_nombre TEXT DEFAULT 'Cathedral House Investment SL',

  -- Tipo
  account_type TEXT,
  -- corriente | ahorro | nomina | inversion | hipoteca | depósito | tarjeta_credito_asociada
  currency TEXT DEFAULT 'EUR',

  -- Cofiabilidad
  saldo_actual NUMERIC(14,2),
  saldo_actual_fecha DATE,

  -- Operativa
  fecha_apertura DATE,
  fecha_cancelacion DATE,
  status TEXT DEFAULT 'activa'
    CHECK (status IN ('activa','cancelada','bloqueada','suspendida')),

  -- Vinculaciones
  associated_loan_id UUID,
  -- FK preparada (ej. mortgages.id) si la cuenta está vinculada a un préstamo

  -- Comisiones esperadas
  comisiones_esperadas JSONB,
  -- jsonb [{tipo: mantenimiento_anual/transferencia/etc, importe, periodicidad}]

  -- Documentos
  contrato_apertura_url TEXT,
  drive_folder_url TEXT,

  -- Auditoría
  notes TEXT,
  usuario_creacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bank_acc_status ON bank_accounts(status);

COMMENT ON TABLE bank_accounts IS
  'Cuentas bancarias Cathedral. IBAN único. Vincula movimientos, hipotecas, domiciliaciones, dietas, alquileres.';

-- ============================================================================
-- bank_statements (extractos PDF/CSV mensuales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,

  -- Periodo
  periodo_year INTEGER NOT NULL,
  periodo_month INTEGER NOT NULL CHECK (periodo_month BETWEEN 1 AND 12),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,

  -- Saldos
  saldo_inicial NUMERIC(14,2),
  saldo_final NUMERIC(14,2),
  total_ingresos NUMERIC(14,2),
  total_gastos NUMERIC(14,2),
  num_movimientos INTEGER,

  -- Documentos
  drive_url TEXT,
  drive_file_id TEXT,
  original_filename TEXT,
  file_hash TEXT,
  formato TEXT,
  -- pdf | csv | norma43 | xml

  -- Estado conciliación
  conciliacion_estado TEXT DEFAULT 'pendiente'
    CHECK (conciliacion_estado IN ('pendiente','en_proceso','conciliado','con_discrepancias')),
  movimientos_no_conciliados INTEGER,

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
  notes TEXT,
  usuario_creacion UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE (bank_account_id, periodo_year, periodo_month)
);
CREATE INDEX IF NOT EXISTS idx_bank_stm_account ON bank_statements(bank_account_id, periodo_year DESC, periodo_month DESC);
CREATE INDEX IF NOT EXISTS idx_bank_stm_pendientes ON bank_statements(conciliacion_estado) WHERE conciliacion_estado<>'conciliado';

-- ============================================================================
-- bank_movements (ampliación de la tabla existente)
-- ============================================================================

-- Identificación de cuenta (FK)
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Vincular con extracto
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS bank_statement_id UUID REFERENCES bank_statements(id) ON DELETE SET NULL;

-- Fechas adicionales
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS fecha_valor DATE;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS fecha_operacion TIMESTAMPTZ;
COMMENT ON COLUMN bank_movements.fecha_valor IS 'Fecha valor (cuándo se contabiliza para intereses).';
COMMENT ON COLUMN bank_movements.fecha_operacion IS 'Fecha real de la operación cuando difiere de movement_date.';

-- Importes detallados
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS amount_abs NUMERIC(14,2);
COMMENT ON COLUMN bank_movements.amount_abs IS 'Valor absoluto del importe (siempre positivo). El signo va en `direction`.';
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2);
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,6);

-- Tipo movimiento
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS movement_type TEXT;
COMMENT ON COLUMN bank_movements.movement_type IS
  'transferencia_emitida | transferencia_recibida | recibo_domiciliado | nomina | tarjeta_credito | tarjeta_debito | bizum | comision | interes | devolucion | ingreso_efectivo | reintegro_efectivo | impuestos | hipoteca_cuota | otro';

ALTER TABLE bank_movements DROP CONSTRAINT IF EXISTS bank_movements_type_check;
ALTER TABLE bank_movements ADD CONSTRAINT bank_movements_type_check
  CHECK (movement_type IS NULL OR movement_type IN
    ('transferencia_emitida','transferencia_recibida','recibo_domiciliado','nomina',
     'tarjeta_credito','tarjeta_debito','bizum','comision','interes','devolucion',
     'ingreso_efectivo','reintegro_efectivo','impuestos','hipoteca_cuota','seguro_recibo','otro'));

-- Contraparte detallada
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS counterpart_iban TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS counterpart_bic TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS counterpart_nif TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS counterpart_country TEXT;

-- Referencias bancarias
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS reference_internal TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS reference_external TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS reference_remesa TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS reference_terminal TEXT;

-- Categorización
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS categoria_gasto TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS subcategoria_gasto TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS cost_center_id UUID;

-- Vinculaciones múltiples (un movimiento puede ligarse a distintos entities)
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_payroll_id UUID REFERENCES payrolls(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_rental_payment_id UUID REFERENCES rental_payments(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_mortgage_id UUID REFERENCES mortgages(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_agency_commission_id UUID REFERENCES agency_commissions(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_arras_id UUID REFERENCES arras_contracts(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_tax_filing_id UUID REFERENCES tax_filings(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_ss_filing_id UUID REFERENCES ss_filings(id) ON DELETE SET NULL;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS matched_fuel_transaction_id UUID REFERENCES fuel_card_transactions(id) ON DELETE SET NULL;

-- Match status mejorado
ALTER TABLE bank_movements DROP CONSTRAINT IF EXISTS bank_movements_match_status_check;
ALTER TABLE bank_movements ADD CONSTRAINT bank_movements_match_status_check
  CHECK (match_status IS NULL OR match_status IN
    ('sin_conciliar','sugerido_auto','confirmado','manual','ignorado','dudoso','duplicado'));

-- Capa "extraer todo"
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS texto_completo TEXT;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS datos_brutos JSONB;
COMMENT ON COLUMN bank_movements.datos_brutos IS
  'Línea original del extracto (norma 43, CSV, OCR del PDF). Permite re-procesar si cambia el algoritmo de matching.';

-- Auditoría
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS usuario_creacion UUID;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS usuario_modificacion UUID;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS conciliado_at TIMESTAMPTZ;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS conciliado_by_user_id UUID;
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE bank_movements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Índices
CREATE INDEX IF NOT EXISTS idx_bank_mov_account ON bank_movements(bank_account_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_mov_statement ON bank_movements(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_mov_match_status ON bank_movements(match_status) WHERE match_status<>'confirmado';
CREATE INDEX IF NOT EXISTS idx_bank_mov_movement_type ON bank_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_bank_mov_counterpart_nif ON bank_movements(counterpart_nif);
CREATE INDEX IF NOT EXISTS idx_bank_mov_invoice ON bank_movements(matched_invoice_id) WHERE matched_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_mov_payroll ON bank_movements(matched_payroll_id) WHERE matched_payroll_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_mov_rental ON bank_movements(matched_rental_payment_id) WHERE matched_rental_payment_id IS NOT NULL;

-- ============================================================================
-- bank_reconciliations (log detallado de matching)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_movement_id UUID NOT NULL REFERENCES bank_movements(id) ON DELETE CASCADE,

  -- Tipo de match
  matched_entity_type TEXT NOT NULL,
  -- invoice | quote | payroll | rental_payment | mortgage | agency_commission |
  -- arras | tax_filing | ss_filing | fuel_transaction | manual_entry
  matched_entity_id UUID NOT NULL,

  -- Algoritmo de match
  match_method TEXT,
  -- exact_amount_date | fuzzy_amount_window | manual | auto_recurrent | nif_match | importe_concepto
  match_score NUMERIC(5,2),
  -- 0-100, score del matching automático
  match_confidence TEXT,
  -- alta | media | baja

  -- Discrepancias
  amount_difference NUMERIC(14,2),
  -- Diferencia entre amount del movimiento y amount esperado en la entidad
  date_difference_days INTEGER,
  -- Días entre fecha movimiento y fecha entidad

  -- Resolución
  status TEXT DEFAULT 'sugerido'
    CHECK (status IN ('sugerido','confirmado','rechazado','revisado','manual')),
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_recon_movement ON bank_reconciliations(bank_movement_id);
CREATE INDEX IF NOT EXISTS idx_recon_entity ON bank_reconciliations(matched_entity_type, matched_entity_id);
CREATE INDEX IF NOT EXISTS idx_recon_status ON bank_reconciliations(status);

NOTIFY pgrst, 'reload schema';
