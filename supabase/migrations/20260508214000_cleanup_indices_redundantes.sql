-- Sesión 8/05/2026 noche tarde — auditoría 6 agentes detectó índices redundantes
-- y faltante. Esta migration:
--   1. Elimina índice UNIQUE redundante en invoices (legacy de sesión 27).
--      Lo cubre `invoices_unique_active_dedup` (creado hoy en migration anterior)
--      con normalización de NIF (UPPER + remove non-alphanumeric).
--   2. Elimina la UNIQUE CONSTRAINT documents_file_hash_key (cubre todas las
--      filas, bloquea soft-delete + reinsert). Lo cubre `uniq_documents_file_hash`
--      parcial (solo activas) que es la versión correcta.
--   3. Crea índice parcial sobre invoices.email_message_id para acelerar lookups
--      de duplicados por message_id (el workflow general lo usa intensivamente).

DROP INDEX IF EXISTS uniq_invoices_supplier_number_date;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_hash_key;

CREATE INDEX IF NOT EXISTS invoices_email_message_id_idx
  ON invoices (email_message_id)
  WHERE email_message_id IS NOT NULL;

COMMENT ON INDEX invoices_email_message_id_idx IS
  'Sesion 8/05/2026: acelera lookups de duplicados por gmail_message_id que hace el workflow general (Check Duplicado). Parcial (NOT NULL) para no indexar filas legacy sin email origen.';
