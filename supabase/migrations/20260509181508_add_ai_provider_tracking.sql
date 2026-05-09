-- Trazabilidad de proveedor IA en cada documento procesado.
-- Aplicada en producción 9/05/2026 vía Supabase Management API.
-- Valores esperados: 'gemini' | 'gpt-4o' | 'mistral' | NULL (legacy pre-cascada multi-provider)
-- Sirve para: filtrar revisión por provider, métricas de fallback, wipe selectivo

ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS ai_provider TEXT;
ALTER TABLE quotes    ADD COLUMN IF NOT EXISTS ai_provider TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_provider TEXT;

CREATE INDEX IF NOT EXISTS invoices_ai_provider_idx  ON invoices  (ai_provider) WHERE ai_provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotes_ai_provider_idx    ON quotes    (ai_provider) WHERE ai_provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_ai_provider_idx ON documents (ai_provider) WHERE ai_provider IS NOT NULL;

COMMENT ON COLUMN invoices.ai_provider  IS 'Proveedor IA que procesó este row (gemini|gpt-4o|mistral). NULL = pre-cascada multi-provider.';
COMMENT ON COLUMN quotes.ai_provider    IS 'Proveedor IA que procesó este row (gemini|gpt-4o|mistral). NULL = pre-cascada multi-provider.';
COMMENT ON COLUMN documents.ai_provider IS 'Proveedor IA que procesó este row (gemini|gpt-4o|mistral). NULL = pre-cascada multi-provider.';
