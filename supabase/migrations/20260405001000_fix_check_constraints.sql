-- Fix CHECK constraints that were blocking INSERT/UPDATE from admin panel
-- documents.doc_type was restricted to 7 old types; code uses ~50 types
-- documents.source was restricted; manual creates have source=null (OK) but constraint was stale
-- invoices.doc_type was missing 'licencia' (used in RevisionView)

-- Drop overly restrictive CHECK constraints on documents
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_check;

-- Update invoices.doc_type to include 'licencia'
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_doc_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_doc_type_check CHECK (
  doc_type = ANY (ARRAY[
    'factura','ticket','proforma','certificado','rectificativa','abono',
    'nomina','modelo_fiscal','seguro','justificante_pago','albaran',
    'presupuesto','contrato','certificacion','otro','nota_simple',
    'escritura','informe','licencia'
  ])
);
