-- Roadmap libro de horas — Fase 2 (captura tickets/facturas/albaranes desde móvil)
--
-- Tabla worker_attachments: el trabajador sube fotos de tickets/albaranes/facturas
-- desde el portal. Se almacenan en Supabase Storage bucket 'worker-receipts' y
-- quedan referenciadas aquí. El admin las procesa después (pipeline OCR existente
-- o entrada manual). Los datos extraídos van a invoices/documents.
--
-- Multi-empresa: company_id NOT NULL + RLS+FORCE.

CREATE TABLE IF NOT EXISTS worker_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Asociación opcional con proyecto (el trabajador lo selecciona si sabe)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Storage (Supabase Storage bucket 'worker-receipts')
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'worker-receipts',
  mime_type TEXT,
  size_bytes BIGINT,
  original_filename TEXT,

  -- Tipo declarado por el trabajador
  doc_type TEXT NOT NULL DEFAULT 'ticket'
    CHECK (doc_type IN ('ticket', 'albaran', 'factura', 'foto_obra', 'otro')),

  -- Estado del procesamiento
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'extracted', 'confirmed', 'ignored', 'error')),

  -- Datos extraídos (cuando OCR procese — Fase 2.5)
  extracted_data JSONB,
  extracted_at TIMESTAMPTZ,
  extraction_provider TEXT, -- gemini-flash | gpt-4o | mistral-ocr | manual

  -- Vinculación con destino final tras procesar
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Notas del trabajador al subir ("ticket Leroy Merlin obra Aguacate 28")
  worker_notas TEXT,

  -- Metadata móvil
  device_geo_lat NUMERIC(10,7),  -- lat foto si trabajador da consentimiento
  device_geo_lng NUMERIC(10,7),
  device_geo_accuracy_m INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Audit admin
  reviewed_at TIMESTAMPTZ,
  reviewed_by_email TEXT,
  reviewer_action TEXT  -- 'confirmed' | 'ignored' | 'edited'
);

CREATE INDEX IF NOT EXISTS idx_worker_attachments_employee
  ON worker_attachments (employee_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_worker_attachments_project
  ON worker_attachments (project_id, created_at DESC) WHERE deleted_at IS NULL AND project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_worker_attachments_status
  ON worker_attachments (status, created_at DESC) WHERE deleted_at IS NULL AND status IN ('uploaded','processing','extracted');
CREATE INDEX IF NOT EXISTS idx_worker_attachments_company
  ON worker_attachments (company_id, status, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE worker_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_attachments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE worker_attachments IS
  'Roadmap libro_horas Fase 2 — fotos de tickets/albaranes/facturas/obra que el '
  'trabajador sube desde el portal. Storage en bucket worker-receipts. status pasa '
  'de uploaded → extracted (OCR fase 2.5) → confirmed (insert en invoices/documents). '
  'Multi-empresa con RLS+FORCE patrón F2.';

COMMENT ON COLUMN worker_attachments.storage_path IS
  'Path en Supabase Storage. Formato: {company_id}/{employee_id}/{yyyy-mm}/{uuid}.{ext}';

COMMENT ON COLUMN worker_attachments.extracted_data IS
  'JSONB con datos extraídos por OCR: { nif, importe, fecha, proveedor, project_code, ... }. '
  'NULL hasta que el pipeline OCR (Fase 2.5) o el admin lo rellenen manualmente.';
