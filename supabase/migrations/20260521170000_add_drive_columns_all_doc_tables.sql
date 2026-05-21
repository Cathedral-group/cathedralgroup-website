-- ============================================================================
-- Cathedral Group — Schema unification 15 doc_type tables (2026-05-21 sesión 21/05 tarde)
--
-- Problema (descubierto tras bulk upload test 50 archivos):
--   Workflow general "Routing Doc Type V2" rutea documentos a 15 tablas
--   distintas según doc_type. Tras INSERT, nodo "PATCH Drive URL Supabase"
--   actualiza drive_url. PERO 10 tablas no tienen columnas drive_url /
--   drive_file_id → PATCH falla silente (HTTP 4xx con neverError: true).
--
--   Adicionalmente, 3 tablas tienen gaps en columnas OCR/IA estándar:
--     - documents: faltan storage_path + ai_data
--     - invoices:  falta  storage_path
--     - payrolls:  faltan storage_path + ai_data + ai_provider
--
-- Resultado actual producción: 35 docs creados con drive_url=NULL, ai_data=NULL,
-- file_hash=NULL, storage_path=NULL. UI muestra rows sin enlace ni info.
--
-- Esta migration añade las 28 columnas faltantes (15 tablas × ~1-3 cols cada una)
-- en una sola transacción atómica con lock_timeout corto para no bloquear.
-- ============================================================================

-- Lock timeout corto: si una tabla está en uso por query larga, abortar
-- en vez de colgar (mejor patrón Supabase docs).
SET lock_timeout = '3s';
SET statement_timeout = '60s';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 12 tablas: ADD drive_url + drive_file_id
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.albaranes              ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.albaranes              ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.certificaciones_obra   ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.certificaciones_obra   ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.certificados           ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.certificados           ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.contratos              ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.contratos              ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.escrituras             ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.escrituras             ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.informes               ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.informes               ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.justificantes_pago     ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.justificantes_pago     ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.licencias              ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.licencias              ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.modelos_fiscales       ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.modelos_fiscales       ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.notas_simples          ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.notas_simples          ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.presupuestos           ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.presupuestos           ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

ALTER TABLE public.seguros                ADD COLUMN IF NOT EXISTS drive_url     TEXT;
ALTER TABLE public.seguros                ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- Gaps OCR/IA estándar
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.documents              ADD COLUMN IF NOT EXISTS storage_path  TEXT;
ALTER TABLE public.documents              ADD COLUMN IF NOT EXISTS ai_data       JSONB;

ALTER TABLE public.invoices               ADD COLUMN IF NOT EXISTS storage_path  TEXT;

ALTER TABLE public.payrolls               ADD COLUMN IF NOT EXISTS storage_path  TEXT;
ALTER TABLE public.payrolls               ADD COLUMN IF NOT EXISTS ai_data       JSONB;
ALTER TABLE public.payrolls               ADD COLUMN IF NOT EXISTS ai_provider   TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- Comentarios para documentación viva
-- ─────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.albaranes.drive_url               IS 'URL pública Google Drive del archivo (poblada tras Subir a Drive)';
COMMENT ON COLUMN public.albaranes.drive_file_id           IS 'fileId Google Drive (para PATCH / move posterior)';
COMMENT ON COLUMN public.contratos.drive_url               IS 'URL pública Google Drive del archivo (poblada tras Subir a Drive)';
COMMENT ON COLUMN public.contratos.drive_file_id           IS 'fileId Google Drive';
COMMENT ON COLUMN public.documents.storage_path            IS 'Ruta bucket Supabase Storage (admin-uploads o gmail-attachments)';
COMMENT ON COLUMN public.documents.ai_data                 IS 'JSON completo extraction IA del workflow (preserva info no mapeada a cols)';
COMMENT ON COLUMN public.invoices.storage_path             IS 'Ruta bucket Supabase Storage (admin-uploads o gmail-attachments)';
COMMENT ON COLUMN public.payrolls.storage_path             IS 'Ruta bucket Supabase Storage (admin-uploads o gmail-attachments)';
COMMENT ON COLUMN public.payrolls.ai_data                  IS 'JSON completo extraction IA del workflow';
COMMENT ON COLUMN public.payrolls.ai_provider              IS 'Modelo IA que extrajo (gpt-4o-mini-text, gemini-2.5-pro, mistral-large)';

COMMIT;

-- PostgREST schema cache reload (evita 42703 "column does not exist" tras DDL)
NOTIFY pgrst, 'reload schema';
