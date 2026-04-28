-- Etapa B del workflow clasificador (sesión 27, 28/04/2026)
-- B2: 14 columnas faltantes en invoices que GPT extrae pero la BD descarta
-- B3: drop columna huérfana invoices.vat_rate (se duplica con vat_pct)
-- B6: columnas IA + metadata email en quotes para que el workflow pueda
--     enrutar presupuestos a quotes (en vez de a invoices)
--
-- Reuso conceptual en quotes (NO duplicar):
--   workflow extracts lineas    → quotes.items     (existente)
--   workflow extracts amount_total → quotes.total  (existente)
--   workflow extracts amount_base  → quotes.subtotal (existente)
--   workflow extracts vat_amount   → quotes.vat_total (existente)
--   workflow extracts validez_hasta → quotes.valid_until (existente)
-- El mapping concreto vive en `Preparar Supabase` (n8n), no en BD.

-- ── B2: invoices, 14 columnas nuevas ──────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS nif_receptor TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS nombre_receptor TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS direccion_emisor TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS inversion_sujeto_pasivo BOOLEAN DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tipo_retencion TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS detalles_iva JSONB;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS codigo_verificacion TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS num_albaran TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS num_contrato TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS validez_hasta DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS idioma TEXT DEFAULT 'es';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS resumen_ia TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS proyecto_sugerido_code TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS proyecto_sugerido_razon TEXT;

COMMENT ON COLUMN public.invoices.nif_receptor IS 'NIF/CIF del receptor de la factura (Cathedral u otra empresa cuando emitimos a terceros)';
COMMENT ON COLUMN public.invoices.nombre_receptor IS 'Nombre legal del receptor';
COMMENT ON COLUMN public.invoices.direccion_emisor IS 'Dirección fiscal del emisor';
COMMENT ON COLUMN public.invoices.inversion_sujeto_pasivo IS 'true si la factura es ISP (IVA 0% por inversión sujeto pasivo)';
COMMENT ON COLUMN public.invoices.tipo_retencion IS 'profesional/agrario/etc — texto libre extraído por GPT';
COMMENT ON COLUMN public.invoices.detalles_iva IS 'jsonb con desglose IVA si hay múltiples tipos en la misma factura';
COMMENT ON COLUMN public.invoices.codigo_verificacion IS 'Código de verificación de la factura (típico en facturas administrativas)';
COMMENT ON COLUMN public.invoices.num_albaran IS 'Número de albarán referenciado en la factura';
COMMENT ON COLUMN public.invoices.num_contrato IS 'Número de contrato referenciado';
COMMENT ON COLUMN public.invoices.validez_hasta IS 'Fecha hasta la que la factura/oferta es válida';
COMMENT ON COLUMN public.invoices.idioma IS 'es/en/fr/etc — idioma del documento original';
COMMENT ON COLUMN public.invoices.resumen_ia IS 'Resumen 1-2 líneas que GPT genera del documento, para vista admin';
COMMENT ON COLUMN public.invoices.proyecto_sugerido_code IS 'Código de proyecto sugerido por IA cuando no hay corroboración para auto-asignar (humano confirma)';
COMMENT ON COLUMN public.invoices.proyecto_sugerido_razon IS 'Razón textual de la sugerencia de proyecto';

-- ── B3: invoices.vat_rate huérfana → drop ─────────────────────────────
-- Razón: duplicada con vat_pct. Ningún código del repo la lee.
-- (Verificado con grep antes de hacer este drop)
ALTER TABLE public.invoices DROP COLUMN IF EXISTS vat_rate;

-- ── B6: quotes, columnas IA + metadata email ──────────────────────────
-- Permite que el workflow ruté presupuestos a quotes con la misma trazabilidad
-- que invoices (ai_confidence, file_hash, email_message_id, etc).
-- El mapping en Preparar Supabase reutiliza items/total/subtotal/vat_total/valid_until existentes.

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS supplier_nif TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS empresa TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS concept TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS direccion_obra TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'recibida'
  CHECK (direction IN ('emitida', 'recibida'));
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'subida_manual';
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS ai_data JSONB;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS ai_razones TEXT[];
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS resumen_ia TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pendiente'
  CHECK (review_status IN ('pendiente','revisado','confirmado','rechazado','error'));
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS email_message_id TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS email_account TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS drive_url TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS proyecto_code TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS proyecto_sugerido_code TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS proyecto_sugerido_razon TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS proyecto_confianza NUMERIC;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS num_pedido TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS num_albaran TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS num_contrato TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS codigo_verificacion TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS iban_proveedor TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS plazo_pago_dias INTEGER;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS idioma TEXT DEFAULT 'es';
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS moneda_original TEXT DEFAULT 'EUR';
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS es_documento_propio BOOLEAN DEFAULT false;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS linked_doc_id UUID;

-- Índices útiles para el workflow (dedup + búsquedas)
CREATE UNIQUE INDEX IF NOT EXISTS quotes_file_hash_idx
  ON public.quotes (file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_email_message_id_idx
  ON public.quotes (email_message_id) WHERE email_message_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_supplier_id_idx
  ON public.quotes (supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_review_status_idx
  ON public.quotes (review_status) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.quotes.direction IS 'emitida (presupuesto que damos a un cliente) o recibida (presupuesto que un proveedor nos manda)';
COMMENT ON COLUMN public.quotes.source IS 'subida_manual | email_automatico | drive_retroactivo | manual_upload';
COMMENT ON COLUMN public.quotes.ai_confidence IS 'Confianza global de GPT al extraer este presupuesto (0-1)';
COMMENT ON COLUMN public.quotes.ai_data IS 'jsonb con TODOS los campos extraídos por GPT (estructura libre, evolutiva)';
COMMENT ON COLUMN public.quotes.ai_razones IS 'Array de razones que justifican needs_review o decisiones IA (§VERIFICADOR:..., §FECHA_ERROR:..., etc)';
