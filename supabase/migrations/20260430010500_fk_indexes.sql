-- Performance: índices para foreign keys sin soporte de índice
-- Sesión 30, 30/04/2026 Madrid
--
-- Auditoría performance Supabase post-Bloque 1 detectó 58 FKs sin índice.
-- Sin índice en columna FK:
--   - DELETE en tabla parent → seq scan completo del child para verificar FK
--   - JOINs (admin panel hace muchos) → seq scan
--
-- Tablas nuevas del Bloque 1 están vacías → CREATE INDEX instantáneo.
-- Tablas con datos (invoices ~691, documents ~71, quotes ~114) → CREATE INDEX
-- toma <100ms en estos volúmenes.
--
-- Patrón: índice b-tree sobre la columna FK con WHERE NOT NULL para FKs nullable
-- que solo se llenan en una fracción de filas (reduce tamaño del índice).

-- agency_commissions (6 FKs)
CREATE INDEX IF NOT EXISTS idx_agency_commissions_agencia_client_id        ON public.agency_commissions(agencia_client_id)        WHERE agencia_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agency_commissions_agencia_supplier_id      ON public.agency_commissions(agencia_supplier_id)      WHERE agencia_supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agency_commissions_arras_id                 ON public.agency_commissions(arras_id)                 WHERE arras_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agency_commissions_contrato_exclusividad_id ON public.agency_commissions(contrato_exclusividad_id) WHERE contrato_exclusividad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agency_commissions_flipping_operation_id    ON public.agency_commissions(flipping_operation_id)    WHERE flipping_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agency_commissions_project_id               ON public.agency_commissions(project_id)               WHERE project_id IS NOT NULL;

-- arras_contracts
CREATE INDEX IF NOT EXISTS idx_arras_contracts_escritura_document_id ON public.arras_contracts(escritura_document_id) WHERE escritura_document_id IS NOT NULL;

-- bank_movements (8 FKs)
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_agency_commission_id ON public.bank_movements(matched_agency_commission_id) WHERE matched_agency_commission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_arras_id             ON public.bank_movements(matched_arras_id)             WHERE matched_arras_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_fuel_transaction_id  ON public.bank_movements(matched_fuel_transaction_id)  WHERE matched_fuel_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_mortgage_id          ON public.bank_movements(matched_mortgage_id)          WHERE matched_mortgage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_quote_id             ON public.bank_movements(matched_quote_id)             WHERE matched_quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_ss_filing_id         ON public.bank_movements(matched_ss_filing_id)         WHERE matched_ss_filing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_matched_tax_filing_id        ON public.bank_movements(matched_tax_filing_id)        WHERE matched_tax_filing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_movements_project_id                   ON public.bank_movements(project_id)                   WHERE project_id IS NOT NULL;

-- communications
CREATE INDEX IF NOT EXISTS idx_communications_lead_id     ON public.communications(lead_id)     WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_supplier_id ON public.communications(supplier_id) WHERE supplier_id IS NOT NULL;

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_client_id   ON public.documents(client_id)   WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_supplier_id ON public.documents(supplier_id) WHERE supplier_id IS NOT NULL;

-- employee_contracts
CREATE INDEX IF NOT EXISTS idx_employee_contracts_prorroga_de ON public.employee_contracts(prorroga_de) WHERE prorroga_de IS NOT NULL;

-- finiquitos
CREATE INDEX IF NOT EXISTS idx_finiquitos_contract_id ON public.finiquitos(contract_id) WHERE contract_id IS NOT NULL;

-- flipping_operations
CREATE INDEX IF NOT EXISTS idx_flipping_operations_project_id ON public.flipping_operations(project_id) WHERE project_id IS NOT NULL;

-- fuel_card_transactions
CREATE INDEX IF NOT EXISTS idx_fuel_card_transactions_driver_employee_id ON public.fuel_card_transactions(driver_employee_id) WHERE driver_employee_id IS NOT NULL;

-- fuel_cards
CREATE INDEX IF NOT EXISTS idx_fuel_cards_assigned_vehicle_id ON public.fuel_cards(assigned_vehicle_id) WHERE assigned_vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_cards_holder_employee_id  ON public.fuel_cards(holder_employee_id)  WHERE holder_employee_id IS NOT NULL;

-- invoices (6 FKs — tabla con 691 filas activas, índices toman ~50ms)
CREATE INDEX IF NOT EXISTS idx_invoices_client_id            ON public.invoices(client_id)            WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_factura_principal_id ON public.invoices(factura_principal_id) WHERE factura_principal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_linked_doc_id        ON public.invoices(linked_doc_id)        WHERE linked_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_linked_invoice_id    ON public.invoices(linked_invoice_id)    WHERE linked_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_operation_id         ON public.invoices(operation_id)         WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id          ON public.invoices(supplier_id)          WHERE supplier_id IS NOT NULL;

-- kyc_documents
CREATE INDEX IF NOT EXISTS idx_kyc_documents_client_id            ON public.kyc_documents(client_id)            WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kyc_documents_flipping_operation_id ON public.kyc_documents(flipping_operation_id) WHERE flipping_operation_id IS NOT NULL;

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_converted_client_id ON public.leads(converted_client_id) WHERE converted_client_id IS NOT NULL;

-- legal_proceedings (3 FKs)
CREATE INDEX IF NOT EXISTS idx_legal_proceedings_flipping_operation_id ON public.legal_proceedings(flipping_operation_id) WHERE flipping_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_proceedings_recurso_proceeding_id ON public.legal_proceedings(recurso_proceeding_id) WHERE recurso_proceeding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_proceedings_rental_contract_id    ON public.legal_proceedings(rental_contract_id)    WHERE rental_contract_id IS NOT NULL;

-- mortgages
CREATE INDEX IF NOT EXISTS idx_mortgages_operation_id ON public.mortgages(operation_id) WHERE operation_id IS NOT NULL;

-- notarial_acts (3 FKs)
CREATE INDEX IF NOT EXISTS idx_notarial_acts_arras_id              ON public.notarial_acts(arras_id)              WHERE arras_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notarial_acts_legal_proceeding_id   ON public.notarial_acts(legal_proceeding_id)   WHERE legal_proceeding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notarial_acts_rental_contract_id    ON public.notarial_acts(rental_contract_id)    WHERE rental_contract_id IS NOT NULL;

-- operation_costs
CREATE INDEX IF NOT EXISTS idx_operation_costs_operation_id ON public.operation_costs(operation_id) WHERE operation_id IS NOT NULL;

-- payrolls
CREATE INDEX IF NOT EXISTS idx_payrolls_invoice_id ON public.payrolls(invoice_id) WHERE invoice_id IS NOT NULL;

-- project_phases
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON public.project_phases(project_id) WHERE project_id IS NOT NULL;

-- quotes (2 FKs)
CREATE INDEX IF NOT EXISTS idx_quotes_client_id  ON public.quotes(client_id)  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_project_id ON public.quotes(project_id) WHERE project_id IS NOT NULL;

-- rental_contracts (2 FKs)
CREATE INDEX IF NOT EXISTS idx_rental_contracts_landlord_client_id   ON public.rental_contracts(landlord_client_id)   WHERE landlord_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_contracts_landlord_supplier_id ON public.rental_contracts(landlord_supplier_id) WHERE landlord_supplier_id IS NOT NULL;

-- rental_payments
CREATE INDEX IF NOT EXISTS idx_rental_payments_invoice_id ON public.rental_payments(invoice_id) WHERE invoice_id IS NOT NULL;

-- vehicle_fines
CREATE INDEX IF NOT EXISTS idx_vehicle_fines_driver_at_time_employee_id ON public.vehicle_fines(driver_at_time_employee_id) WHERE driver_at_time_employee_id IS NOT NULL;

-- vehicle_fleet (2 FKs)
CREATE INDEX IF NOT EXISTS idx_vehicle_fleet_acquisition_invoice_id ON public.vehicle_fleet(acquisition_invoice_id) WHERE acquisition_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_fleet_project_id             ON public.vehicle_fleet(project_id)             WHERE project_id IS NOT NULL;

-- vehicle_insurance
CREATE INDEX IF NOT EXISTS idx_vehicle_insurance_insurer_supplier_id ON public.vehicle_insurance(insurer_supplier_id) WHERE insurer_supplier_id IS NOT NULL;

-- vehicle_itv
CREATE INDEX IF NOT EXISTS idx_vehicle_itv_invoice_id ON public.vehicle_itv(invoice_id) WHERE invoice_id IS NOT NULL;

-- vehicle_maintenance (2 FKs)
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_invoice_id          ON public.vehicle_maintenance(invoice_id)          WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_provider_supplier_id ON public.vehicle_maintenance(provider_supplier_id) WHERE provider_supplier_id IS NOT NULL;

-- vehicle_rentings (3 FKs)
CREATE INDEX IF NOT EXISTS idx_vehicle_rentings_assigned_employee_id   ON public.vehicle_rentings(assigned_employee_id)   WHERE assigned_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_rentings_project_id             ON public.vehicle_rentings(project_id)             WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_rentings_provider_supplier_id   ON public.vehicle_rentings(provider_supplier_id)   WHERE provider_supplier_id IS NOT NULL;
