-- Bloque 0 F2 — ALTER 55 tablas existentes con company_id NOT NULL DEFAULT Cathedral UUID
-- Postgres 17.6: ADD COLUMN ... NOT NULL DEFAULT con valor literal NO reescribe tabla
-- (metadata-only optimization). FK con NOT VALID + VALIDATE separado para no bloquear.
-- Sprint Bloque 0 F2 — sesión 10/05/2026 tarde-tarde, post F1 OK.

BEGIN;

-- agency_commissions
ALTER TABLE agency_commissions
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE agency_commissions
  ADD CONSTRAINT agency_commissions_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE agency_commissions VALIDATE CONSTRAINT agency_commissions_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_agency_commissions_company_id ON agency_commissions(company_id);
ALTER TABLE agency_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_commissions FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN agency_commissions.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- arras_contracts
ALTER TABLE arras_contracts
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE arras_contracts
  ADD CONSTRAINT arras_contracts_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE arras_contracts VALIDATE CONSTRAINT arras_contracts_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_arras_contracts_company_id ON arras_contracts(company_id);
ALTER TABLE arras_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE arras_contracts FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN arras_contracts.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- bank_accounts
ALTER TABLE bank_accounts
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE bank_accounts
  ADD CONSTRAINT bank_accounts_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE bank_accounts VALIDATE CONSTRAINT bank_accounts_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON bank_accounts(company_id);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN bank_accounts.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- bank_movements
ALTER TABLE bank_movements
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE bank_movements
  ADD CONSTRAINT bank_movements_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE bank_movements VALIDATE CONSTRAINT bank_movements_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_bank_movements_company_id ON bank_movements(company_id);
ALTER TABLE bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_movements FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN bank_movements.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- bank_reconciliations
ALTER TABLE bank_reconciliations
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE bank_reconciliations
  ADD CONSTRAINT bank_reconciliations_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE bank_reconciliations VALIDATE CONSTRAINT bank_reconciliations_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_company_id ON bank_reconciliations(company_id);
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN bank_reconciliations.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- bank_statements
ALTER TABLE bank_statements
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE bank_statements
  ADD CONSTRAINT bank_statements_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE bank_statements VALIDATE CONSTRAINT bank_statements_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_bank_statements_company_id ON bank_statements(company_id);
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN bank_statements.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- clients
ALTER TABLE clients
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE clients
  ADD CONSTRAINT clients_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE clients VALIDATE CONSTRAINT clients_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN clients.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- communications
ALTER TABLE communications
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE communications
  ADD CONSTRAINT communications_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE communications VALIDATE CONSTRAINT communications_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_communications_company_id ON communications(company_id);
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN communications.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- corporate_documents
ALTER TABLE corporate_documents
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE corporate_documents
  ADD CONSTRAINT corporate_documents_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE corporate_documents VALIDATE CONSTRAINT corporate_documents_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_corporate_documents_company_id ON corporate_documents(company_id);
ALTER TABLE corporate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_documents FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN corporate_documents.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- documents
ALTER TABLE documents
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE documents
  ADD CONSTRAINT documents_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE documents VALIDATE CONSTRAINT documents_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN documents.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- employee_contracts
ALTER TABLE employee_contracts
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE employee_contracts
  ADD CONSTRAINT employee_contracts_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE employee_contracts VALIDATE CONSTRAINT employee_contracts_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_id ON employee_contracts(company_id);
ALTER TABLE employee_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_contracts FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN employee_contracts.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- employee_dependents
ALTER TABLE employee_dependents
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE employee_dependents
  ADD CONSTRAINT employee_dependents_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE employee_dependents VALIDATE CONSTRAINT employee_dependents_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_employee_dependents_company_id ON employee_dependents(company_id);
ALTER TABLE employee_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_dependents FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN employee_dependents.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- employee_family_situation_history
ALTER TABLE employee_family_situation_history
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE employee_family_situation_history
  ADD CONSTRAINT employee_family_situation_history_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE employee_family_situation_history VALIDATE CONSTRAINT employee_family_situation_history_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_employee_family_situation_history_company_id ON employee_family_situation_history(company_id);
ALTER TABLE employee_family_situation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_family_situation_history FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN employee_family_situation_history.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- employees
ALTER TABLE employees
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE employees
  ADD CONSTRAINT employees_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE employees VALIDATE CONSTRAINT employees_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN employees.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- equality_pay_register
ALTER TABLE equality_pay_register
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE equality_pay_register
  ADD CONSTRAINT equality_pay_register_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE equality_pay_register VALIDATE CONSTRAINT equality_pay_register_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_equality_pay_register_company_id ON equality_pay_register(company_id);
ALTER TABLE equality_pay_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE equality_pay_register FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN equality_pay_register.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- exceptions_log
ALTER TABLE exceptions_log
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE exceptions_log
  ADD CONSTRAINT exceptions_log_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE exceptions_log VALIDATE CONSTRAINT exceptions_log_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_exceptions_log_company_id ON exceptions_log(company_id);
ALTER TABLE exceptions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions_log FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN exceptions_log.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- factura_forensic
ALTER TABLE factura_forensic
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE factura_forensic
  ADD CONSTRAINT factura_forensic_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE factura_forensic VALIDATE CONSTRAINT factura_forensic_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_factura_forensic_company_id ON factura_forensic(company_id);
ALTER TABLE factura_forensic ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_forensic FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN factura_forensic.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- finiquitos
ALTER TABLE finiquitos
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE finiquitos
  ADD CONSTRAINT finiquitos_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE finiquitos VALIDATE CONSTRAINT finiquitos_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_finiquitos_company_id ON finiquitos(company_id);
ALTER TABLE finiquitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finiquitos FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN finiquitos.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- flipping_operations
ALTER TABLE flipping_operations
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE flipping_operations
  ADD CONSTRAINT flipping_operations_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE flipping_operations VALIDATE CONSTRAINT flipping_operations_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_flipping_operations_company_id ON flipping_operations(company_id);
ALTER TABLE flipping_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flipping_operations FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN flipping_operations.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- fuel_card_transactions
ALTER TABLE fuel_card_transactions
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE fuel_card_transactions
  ADD CONSTRAINT fuel_card_transactions_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE fuel_card_transactions VALIDATE CONSTRAINT fuel_card_transactions_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_fuel_card_transactions_company_id ON fuel_card_transactions(company_id);
ALTER TABLE fuel_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_card_transactions FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN fuel_card_transactions.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- fuel_cards
ALTER TABLE fuel_cards
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE fuel_cards
  ADD CONSTRAINT fuel_cards_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE fuel_cards VALIDATE CONSTRAINT fuel_cards_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_fuel_cards_company_id ON fuel_cards(company_id);
ALTER TABLE fuel_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_cards FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN fuel_cards.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- invoices
ALTER TABLE invoices
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE invoices VALIDATE CONSTRAINT invoices_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN invoices.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- it_leaves
ALTER TABLE it_leaves
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE it_leaves
  ADD CONSTRAINT it_leaves_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE it_leaves VALIDATE CONSTRAINT it_leaves_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_it_leaves_company_id ON it_leaves(company_id);
ALTER TABLE it_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_leaves FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN it_leaves.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- kyc_documents
ALTER TABLE kyc_documents
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE kyc_documents
  ADD CONSTRAINT kyc_documents_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE kyc_documents VALIDATE CONSTRAINT kyc_documents_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_kyc_documents_company_id ON kyc_documents(company_id);
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN kyc_documents.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- leads
ALTER TABLE leads
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE leads
  ADD CONSTRAINT leads_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE leads VALIDATE CONSTRAINT leads_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN leads.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- leave_permits
ALTER TABLE leave_permits
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE leave_permits
  ADD CONSTRAINT leave_permits_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE leave_permits VALIDATE CONSTRAINT leave_permits_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_leave_permits_company_id ON leave_permits(company_id);
ALTER TABLE leave_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_permits FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN leave_permits.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- legal_proceedings
ALTER TABLE legal_proceedings
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE legal_proceedings
  ADD CONSTRAINT legal_proceedings_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE legal_proceedings VALIDATE CONSTRAINT legal_proceedings_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_legal_proceedings_company_id ON legal_proceedings(company_id);
ALTER TABLE legal_proceedings ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_proceedings FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN legal_proceedings.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- mileage_dietas
ALTER TABLE mileage_dietas
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE mileage_dietas
  ADD CONSTRAINT mileage_dietas_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE mileage_dietas VALIDATE CONSTRAINT mileage_dietas_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_mileage_dietas_company_id ON mileage_dietas(company_id);
ALTER TABLE mileage_dietas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_dietas FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN mileage_dietas.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- mortgages
ALTER TABLE mortgages
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE mortgages
  ADD CONSTRAINT mortgages_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE mortgages VALIDATE CONSTRAINT mortgages_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_mortgages_company_id ON mortgages(company_id);
ALTER TABLE mortgages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mortgages FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN mortgages.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- notarial_acts
ALTER TABLE notarial_acts
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE notarial_acts
  ADD CONSTRAINT notarial_acts_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE notarial_acts VALIDATE CONSTRAINT notarial_acts_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_notarial_acts_company_id ON notarial_acts(company_id);
ALTER TABLE notarial_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notarial_acts FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN notarial_acts.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- operation_costs
ALTER TABLE operation_costs
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE operation_costs
  ADD CONSTRAINT operation_costs_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE operation_costs VALIDATE CONSTRAINT operation_costs_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_operation_costs_company_id ON operation_costs(company_id);
ALTER TABLE operation_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_costs FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN operation_costs.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- overtime_records
ALTER TABLE overtime_records
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE overtime_records
  ADD CONSTRAINT overtime_records_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE overtime_records VALIDATE CONSTRAINT overtime_records_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_overtime_records_company_id ON overtime_records(company_id);
ALTER TABLE overtime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_records FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN overtime_records.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- payroll_payments
ALTER TABLE payroll_payments
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE payroll_payments
  ADD CONSTRAINT payroll_payments_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE payroll_payments VALIDATE CONSTRAINT payroll_payments_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_payroll_payments_company_id ON payroll_payments(company_id);
ALTER TABLE payroll_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_payments FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN payroll_payments.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- payroll_summaries
ALTER TABLE payroll_summaries
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE payroll_summaries
  ADD CONSTRAINT payroll_summaries_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE payroll_summaries VALIDATE CONSTRAINT payroll_summaries_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_payroll_summaries_company_id ON payroll_summaries(company_id);
ALTER TABLE payroll_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_summaries FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN payroll_summaries.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- payrolls
ALTER TABLE payrolls
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE payrolls
  ADD CONSTRAINT payrolls_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE payrolls VALIDATE CONSTRAINT payrolls_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_payrolls_company_id ON payrolls(company_id);
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN payrolls.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- prl_documents
ALTER TABLE prl_documents
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE prl_documents
  ADD CONSTRAINT prl_documents_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE prl_documents VALIDATE CONSTRAINT prl_documents_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_prl_documents_company_id ON prl_documents(company_id);
ALTER TABLE prl_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE prl_documents FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN prl_documents.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- project_phases
ALTER TABLE project_phases
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE project_phases
  ADD CONSTRAINT project_phases_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE project_phases VALIDATE CONSTRAINT project_phases_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_project_phases_company_id ON project_phases(company_id);
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN project_phases.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- projects
ALTER TABLE projects
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE projects
  ADD CONSTRAINT projects_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE projects VALIDATE CONSTRAINT projects_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN projects.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- quotes
ALTER TABLE quotes
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE quotes
  ADD CONSTRAINT quotes_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE quotes VALIDATE CONSTRAINT quotes_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN quotes.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- rea_status
ALTER TABLE rea_status
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE rea_status
  ADD CONSTRAINT rea_status_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE rea_status VALIDATE CONSTRAINT rea_status_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_rea_status_company_id ON rea_status(company_id);
ALTER TABLE rea_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE rea_status FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN rea_status.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- rental_contracts
ALTER TABLE rental_contracts
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE rental_contracts
  ADD CONSTRAINT rental_contracts_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE rental_contracts VALIDATE CONSTRAINT rental_contracts_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_rental_contracts_company_id ON rental_contracts(company_id);
ALTER TABLE rental_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_contracts FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN rental_contracts.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- rental_indexations
ALTER TABLE rental_indexations
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE rental_indexations
  ADD CONSTRAINT rental_indexations_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE rental_indexations VALIDATE CONSTRAINT rental_indexations_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_rental_indexations_company_id ON rental_indexations(company_id);
ALTER TABLE rental_indexations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_indexations FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN rental_indexations.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- rental_payments
ALTER TABLE rental_payments
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE rental_payments
  ADD CONSTRAINT rental_payments_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE rental_payments VALIDATE CONSTRAINT rental_payments_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_rental_payments_company_id ON rental_payments(company_id);
ALTER TABLE rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_payments FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN rental_payments.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- ss_filings
ALTER TABLE ss_filings
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE ss_filings
  ADD CONSTRAINT ss_filings_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE ss_filings VALIDATE CONSTRAINT ss_filings_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_ss_filings_company_id ON ss_filings(company_id);
ALTER TABLE ss_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_filings FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN ss_filings.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- suppliers
ALTER TABLE suppliers
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE suppliers VALIDATE CONSTRAINT suppliers_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN suppliers.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- tax_filings
ALTER TABLE tax_filings
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE tax_filings
  ADD CONSTRAINT tax_filings_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE tax_filings VALIDATE CONSTRAINT tax_filings_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_tax_filings_company_id ON tax_filings(company_id);
ALTER TABLE tax_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_filings FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN tax_filings.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- time_records
ALTER TABLE time_records
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE time_records
  ADD CONSTRAINT time_records_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE time_records VALIDATE CONSTRAINT time_records_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_time_records_company_id ON time_records(company_id);
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN time_records.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vacation_records
ALTER TABLE vacation_records
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vacation_records
  ADD CONSTRAINT vacation_records_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vacation_records VALIDATE CONSTRAINT vacation_records_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vacation_records_company_id ON vacation_records(company_id);
ALTER TABLE vacation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacation_records FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vacation_records.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_fines
ALTER TABLE vehicle_fines
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_fines
  ADD CONSTRAINT vehicle_fines_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_fines VALIDATE CONSTRAINT vehicle_fines_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_fines_company_id ON vehicle_fines(company_id);
ALTER TABLE vehicle_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_fines FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_fines.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_fleet
ALTER TABLE vehicle_fleet
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_fleet
  ADD CONSTRAINT vehicle_fleet_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_fleet VALIDATE CONSTRAINT vehicle_fleet_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_fleet_company_id ON vehicle_fleet(company_id);
ALTER TABLE vehicle_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_fleet FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_fleet.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_insurance
ALTER TABLE vehicle_insurance
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_insurance
  ADD CONSTRAINT vehicle_insurance_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_insurance VALIDATE CONSTRAINT vehicle_insurance_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_insurance_company_id ON vehicle_insurance(company_id);
ALTER TABLE vehicle_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_insurance FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_insurance.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_itv
ALTER TABLE vehicle_itv
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_itv
  ADD CONSTRAINT vehicle_itv_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_itv VALIDATE CONSTRAINT vehicle_itv_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_itv_company_id ON vehicle_itv(company_id);
ALTER TABLE vehicle_itv ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_itv FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_itv.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_ivtm
ALTER TABLE vehicle_ivtm
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_ivtm
  ADD CONSTRAINT vehicle_ivtm_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_ivtm VALIDATE CONSTRAINT vehicle_ivtm_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_ivtm_company_id ON vehicle_ivtm(company_id);
ALTER TABLE vehicle_ivtm ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_ivtm FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_ivtm.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_maintenance
ALTER TABLE vehicle_maintenance
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_maintenance
  ADD CONSTRAINT vehicle_maintenance_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_maintenance VALIDATE CONSTRAINT vehicle_maintenance_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_company_id ON vehicle_maintenance(company_id);
ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_maintenance FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_maintenance.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

-- vehicle_rentings
ALTER TABLE vehicle_rentings
  ADD COLUMN company_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-cca7ed1a1000'::uuid;
ALTER TABLE vehicle_rentings
  ADD CONSTRAINT vehicle_rentings_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
ALTER TABLE vehicle_rentings VALIDATE CONSTRAINT vehicle_rentings_company_id_fk;
CREATE INDEX IF NOT EXISTS idx_vehicle_rentings_company_id ON vehicle_rentings(company_id);
ALTER TABLE vehicle_rentings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_rentings FORCE ROW LEVEL SECURITY;
COMMENT ON COLUMN vehicle_rentings.company_id IS 'Bloque 0 F2 — discriminator multi-empresa. DEFAULT Cathedral SL para backfill automático.';

COMMIT;
