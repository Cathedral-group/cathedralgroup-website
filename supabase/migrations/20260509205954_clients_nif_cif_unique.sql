-- Migrar nif → nif_cif para uniformidad con tabla suppliers (donde es nif)
-- y añadir UNIQUE constraint para que el upsert via PostgREST funcione
-- (Cascada Entidad del workflow general LWZWxjo9O5ku7tF7).
-- Aplicada en producción 9/05/2026 vía Supabase Management API.

UPDATE clients SET nif_cif = nif WHERE nif_cif IS NULL AND nif IS NOT NULL;

ALTER TABLE clients ADD CONSTRAINT clients_nif_cif_unique UNIQUE (nif_cif);

COMMENT ON CONSTRAINT clients_nif_cif_unique ON clients IS 'UNIQUE para upsert via PostgREST con on_conflict=nif_cif. Necesario para Cascada Entidad del workflow n8n.';
